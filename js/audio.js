// AudioEngine — áudio da timeline (narração gravada e arquivos importados).
// Um clipe = { id, assetId, startTime, duration, offset, volume, name }: toca o trecho
// [offset, offset+duration] do asset, começando em startTime na timeline da cena.

class AudioEngine {
    constructor() {
        this.ctx = null;
        this._playing = [];       // AudioBufferSourceNodes em execução
        this._destination = null; // destino extra (MediaStream, para export via MediaRecorder)
    }

    isSupported() {
        return typeof (window.AudioContext || window.webkitAudioContext) === 'function';
    }

    ensureContext() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            this.ctx = new Ctx();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
    }

    // Decodifica bytes (qualquer formato suportado pelo navegador) num AudioBuffer
    async decode(bytes) {
        const ctx = this.ensureContext();
        if (!ctx) throw new Error('Web Audio indisponível');
        const copy = bytes.slice().buffer; // decodeAudioData "consome" o ArrayBuffer
        return await new Promise((resolve, reject) => {
            const p = ctx.decodeAudioData(copy, resolve, reject);
            if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
    }

    // Picos (máximo absoluto por bucket) para desenhar a forma de onda
    static peaks(buffer, buckets) {
        const n = Math.max(1, buckets | 0);
        const out = new Float32Array(n);
        const chans = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
        const len = buffer.length;
        const size = len / n;
        for (let i = 0; i < n; i++) {
            const start = Math.floor(i * size);
            const end = Math.min(len, Math.floor((i + 1) * size));
            let max = 0;
            const stride = Math.max(1, Math.floor((end - start) / 200));
            for (const data of chans) {
                for (let j = start; j < end; j += stride) {
                    const v = Math.abs(data[j]);
                    if (v > max) max = v;
                }
            }
            out[i] = max;
        }
        return out;
    }

    // Toca os clipes a partir de `fromTime` (s, na timeline) com a velocidade dada.
    // getBuffer(assetId) → AudioBuffer | null
    play(clips, fromTime, speed, getBuffer) {
        this.stop();
        const ctx = this.ensureContext();
        if (!ctx) return;
        const rate = Util.clamp(speed || 1, 0.25, 4);
        const now = ctx.currentTime + 0.03;
        for (const clip of clips) {
            const buffer = getBuffer(clip.assetId);
            if (!buffer) continue;
            const clipEnd = clip.startTime + clip.duration;
            if (fromTime >= clipEnd) continue;
            const skip = Math.max(0, fromTime - clip.startTime);
            const offset = (clip.offset || 0) + skip;
            const length = clip.duration - skip;
            if (offset >= buffer.duration || length <= 0) continue;
            const when = now + Math.max(0, clip.startTime - fromTime) / rate;

            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.playbackRate.value = rate;
            const gain = ctx.createGain();
            gain.gain.value = Util.clamp(clip.volume != null ? clip.volume : 1, 0, 2);
            src.connect(gain);
            gain.connect(ctx.destination);
            if (this._destination) gain.connect(this._destination);
            src.start(when, offset, Math.min(length, buffer.duration - offset));
            this._playing.push(src);
        }
    }

    stop() {
        for (const src of this._playing) {
            try { src.stop(); } catch (e) { /* já parado */ }
            try { src.disconnect(); } catch (e) { /* idem */ }
        }
        this._playing = [];
    }

    // Destino MediaStream extra (exportação em tempo real via MediaRecorder)
    createStreamDestination() {
        const ctx = this.ensureContext();
        if (!ctx || !ctx.createMediaStreamDestination) return null;
        this._destination = ctx.createMediaStreamDestination();
        return this._destination;
    }

    releaseStreamDestination() {
        this._destination = null;
    }

    // Grava o microfone. Retorna { stop(): Promise<{bytes, mime, duration}>, level(): 0..1 }
    async startMicRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(t('micUnsupported'));
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        const mime = (window.MediaRecorder && mimes.find((m) => MediaRecorder.isTypeSupported(m))) || '';
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const startedAt = performance.now();

        const ctx = this.ensureContext();
        let analyser = null, levelData = null;
        if (ctx) {
            const srcNode = ctx.createMediaStreamSource(stream);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            levelData = new Uint8Array(analyser.fftSize);
            srcNode.connect(analyser);
        }
        recorder.start(250);

        return {
            startedAt,
            level() {
                if (!analyser) return 0;
                analyser.getByteTimeDomainData(levelData);
                let max = 0;
                for (const v of levelData) max = Math.max(max, Math.abs(v - 128));
                return max / 128;
            },
            stop() {
                return new Promise((resolve) => {
                    recorder.onstop = async () => {
                        stream.getTracks().forEach((tr) => tr.stop());
                        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
                        const bytes = new Uint8Array(await blob.arrayBuffer());
                        resolve({ bytes, mime: blob.type, duration: (performance.now() - startedAt) / 1000 });
                    };
                    if (recorder.state !== 'inactive') recorder.stop();
                    else recorder.onstop();
                });
            }
        };
    }

    // Mixa os clipes num único AudioBuffer (offline) de `duration` segundos — usado na exportação
    async mixOffline(clips, duration, getBuffer, sampleRate) {
        const rate = sampleRate || 48000;
        const length = Math.max(1, Math.ceil(duration * rate));
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Offline) return null;
        const octx = new Offline(2, length, rate);
        let any = false;
        for (const clip of clips) {
            const buffer = getBuffer(clip.assetId);
            if (!buffer) continue;
            const offset = clip.offset || 0;
            const len = Math.min(clip.duration, buffer.duration - offset);
            if (len <= 0 || clip.startTime >= duration) continue;
            const src = octx.createBufferSource();
            src.buffer = buffer;
            const gain = octx.createGain();
            gain.gain.value = Util.clamp(clip.volume != null ? clip.volume : 1, 0, 2);
            src.connect(gain);
            gain.connect(octx.destination);
            src.start(Math.max(0, clip.startTime), offset, len);
            any = true;
        }
        if (!any) return null;
        return await octx.startRendering();
    }

    // Concatena AudioBuffers (cenas exportadas em sequência); null = silêncio daquela duração
    concat(parts, sampleRate) {
        const rate = sampleRate || 48000;
        const total = parts.reduce((s, p) => s + Math.ceil(p.duration * rate), 0);
        if (!total) return null;
        const out = new AudioBuffer({ length: total, numberOfChannels: 2, sampleRate: rate });
        let pos = 0;
        for (const p of parts) {
            const frames = Math.ceil(p.duration * rate);
            if (p.buffer) {
                for (let c = 0; c < 2; c++) {
                    const src = p.buffer.getChannelData(Math.min(c, p.buffer.numberOfChannels - 1));
                    out.getChannelData(c).set(src.subarray(0, Math.min(frames, src.length)), pos);
                }
            }
            pos += frames;
        }
        return out;
    }
}
