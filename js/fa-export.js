// Exportação do FlowAnimator.
//  - Vídeo: WebCodecs + Mediabunny (vendor/mediabunny, carregado sob demanda). Renderiza
//    frame a frame FORA do tempo real: fps exato, mais rápido que o tempo real e imune a aba
//    em segundo plano. Fallback: MediaRecorder em tempo real (navegadores sem VideoEncoder).
//  - GIF (js/gif.js), frames PNG em ZIP (js/zip.js), frame atual em PNG, legendas SRT/VTT.
// Todas usam renderOutputFrame() — a mesma composição da edição, com a câmera aplicada.

FlowAnimator.EXPORT_PRESETS = {
    'auto-1080': { box: [1920, 1080], keepAspect: true },
    'auto-4k': { box: [3840, 2160], keepAspect: true },
    '720p': { size: [1280, 720] },
    '1080p': { size: [1920, 1080] },
    '4k': { size: [3840, 2160] },
    'vertical': { size: [1080, 1920] },
    'square': { size: [1080, 1080] }
};

FlowAnimator.prototype._exportScenes = function(scope) {
    this._captureScene();
    return scope === 'all' ? this.scenes.slice() : [this._scene()];
};

FlowAnimator.prototype._sceneHasContent = function(scene) {
    const s = scene.state;
    return (s.actions || []).length || (s.comments || []).length || (s.cameraMoves || []).length || (s.audioClips || []).length;
};

// View de exportação de uma cena (a cena atual usa também a região de gravação)
FlowAnimator.prototype._exportView = function(scene) {
    const view = this._makeView(scene, 1);
    view.crop = scene === this._scene() ? this.cropRegion : (scene.cropRegion || null);
    return view;
};

FlowAnimator.prototype._outputSize = function(preset, scene) {
    const p = FlowAnimator.EXPORT_PRESETS[preset] || FlowAnimator.EXPORT_PRESETS['auto-1080'];
    let w, h;
    if (p.keepAspect) {
        const base = (scene === this._scene() && this.cropRegion) ? this.cropRegion : { w: scene.width, h: scene.height };
        const aspect = base.w / base.h;
        const [bw, bh] = p.box;
        if (aspect > bw / bh) { w = bw; h = Math.round(bw / aspect); } else { h = bh; w = Math.round(bh * aspect); }
    } else {
        [w, h] = p.size;
    }
    // Dimensões pares (requisito de muitos codecs)
    w = Math.max(2, w - (w % 2));
    h = Math.max(2, h - (h % 2));
    return { w, h };
};

FlowAnimator.prototype._mixExportAudio = async function(scenes) {
    if (!this._isTypeVisible('audio')) return null;
    await this._decodeAllAudio();
    const parts = [];
    let any = false;
    for (const s of scenes) {
        const clips = s.state.audioClips || [];
        const duration = s.state.totalAnimationTime;
        const buffer = clips.length ? await this.audio.mixOffline(clips, duration, (id) => this._audioBuffers.get(id) || null) : null;
        if (buffer) any = true;
        parts.push({ duration, buffer });
    }
    return any ? this.audio.concat(parts) : null;
};

// ─── Diálogo ───────────────────────────────────────────────────────────────

FlowAnimator.prototype.openExportDialog = async function(kind) {
    if (this.isExporting) { this.showTooltip(t('exportInProgress')); return; }
    this._captureScene();
    const multi = this.scenes.length > 1;
    const hasAudio = this.scenes.some((s) => (s.state.audioClips || []).length);
    const scopeField = multi ? [{ id: 'scope', label: t('exportScope'), type: 'select', value: 'all',
        options: [{ value: 'all', label: t('exportAllScenes', { n: this.scenes.length }) }, { value: 'current', label: t('exportCurrentScene') }] }] : [];
    const fitField = { id: 'fit', label: t('exportFit'), type: 'select', value: 'contain',
        options: [{ value: 'contain', label: t('fitContain') }, { value: 'cover', label: t('fitCover') }] };

    if (kind === 'gif') {
        const res = await showFormModal({
            title: t('exportGifTitle'),
            description: t('exportGifDesc'),
            okLabel: t('export'),
            fields: [
                { id: 'width', label: t('gifWidth'), type: 'select', value: '640', options: ['480', '640', '800', '960'].map((v) => ({ value: v, label: v + ' px' })) },
                { id: 'fps', label: t('fps'), type: 'select', value: '12', options: ['8', '10', '12', '15'].map((v) => ({ value: v, label: v + ' fps' })) },
                ...scopeField, fitField
            ]
        });
        if (res) this.exportGif({ width: parseInt(res.width, 10), fps: parseInt(res.fps, 10), scope: res.scope || 'current', fit: res.fit });
        return;
    }

    const webcodecs = typeof VideoEncoder === 'function' && window.isSecureContext;
    const res = await showFormModal({
        title: t('exportVideoTitle'),
        description: webcodecs ? t('exportVideoDescFast') : t('exportVideoDescRealtime'),
        okLabel: t('export'),
        fields: [
            { id: 'format', label: t('exportFormat'), type: 'select', value: 'mp4', options: [{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }] },
            { id: 'preset', label: t('exportResolution'), type: 'select', value: 'auto-1080', options: [
                { value: 'auto-1080', label: t('presetAuto1080') },
                { value: 'auto-4k', label: t('presetAuto4k') },
                { value: '720p', label: '1280 × 720 (16:9)' },
                { value: '1080p', label: '1920 × 1080 (16:9)' },
                { value: '4k', label: '3840 × 2160 (4K 16:9)' },
                { value: 'vertical', label: t('presetVertical') },
                { value: 'square', label: t('presetSquare') }
            ] },
            { id: 'fps', label: t('fps'), type: 'select', value: '30', options: ['24', '30', '60'].map((v) => ({ value: v, label: v + ' fps' })) },
            { id: 'quality', label: t('exportQuality'), type: 'select', value: 'high', options: [
                { value: 'high', label: t('qualityHigh') }, { value: 'medium', label: t('qualityMedium') }, { value: 'low', label: t('qualityLow') }] },
            ...scopeField, fitField,
            ...(hasAudio ? [{ id: 'audio', label: t('exportIncludeAudio'), type: 'checkbox', value: true }] : [])
        ]
    });
    if (!res) return;
    this.exportVideo({
        format: res.format, preset: res.preset, fps: parseInt(res.fps, 10), quality: res.quality,
        scope: res.scope || 'current', fit: res.fit, audio: hasAudio && res.audio !== false
    });
};

// Compat: exportação com as opções padrão
FlowAnimator.prototype.exportVideoHD = function() {
    return this.exportVideo({});
};

FlowAnimator.prototype.exportVideo = async function(options) {
    const opts = Object.assign({ format: 'mp4', preset: 'auto-1080', fps: 30, quality: 'high', scope: 'current', fit: 'contain', audio: true }, options || {});
    if (this.isExporting) { this.showTooltip(t('exportInProgress')); return; }
    const scenes = this._exportScenes(opts.scope).filter((s) => this._sceneHasContent(s));
    if (!scenes.length) { this.showTooltip(t('addActionsFirst')); return; }
    if (this.isPlaying) this.pause();
    if (this.timelineMode) this.exitTimelineMode();

    this.isExporting = true;
    this._exportCancelled = false;
    try {
        await Promise.all(scenes.map((s) => this._ensureSceneBackground(s).catch(() => null)));
        const { w, h } = this._outputSize(opts.preset, scenes[0]);
        const audio = opts.audio ? await this._mixExportAudio(scenes) : null;

        if (typeof VideoEncoder === 'function' && window.isSecureContext) {
            try {
                await Util.loadScript('vendor/mediabunny/mediabunny.min.js');
                await this._exportWithWebCodecs(scenes, opts, w, h, audio);
                return;
            } catch (e) {
                if (this._exportCancelled) return;
                console.warn('[export] WebCodecs indisponível, usando MediaRecorder:', e);
            }
        }
        if (window.MediaRecorder) {
            await this._exportWithMediaRecorder(scenes, opts, w, h, audio);
        } else {
            Toast.show(t('noVideoSupport'), { kind: 'error' });
            await this.exportAsFrames();
        }
    } catch (error) {
        if (!this._exportCancelled) {
            this.handleError(t('errExportVideo'), error);
            Toast.show(t('errExportVideo') + ': ' + (error.message || error), { kind: 'error' });
        }
    } finally {
        this.isExporting = false;
        Progress.hide();
        document.getElementById('recordingIndicator').style.display = 'none';
        this.redrawMainCanvas();
    }
};

function _sliceAudioBuffer(buffer, fromSec, toSec) {
    const rate = buffer.sampleRate;
    const start = Math.max(0, Math.floor(fromSec * rate));
    const end = Math.min(buffer.length, Math.floor(toSec * rate));
    if (end <= start) return null;
    const out = new AudioBuffer({ length: end - start, numberOfChannels: buffer.numberOfChannels, sampleRate: rate });
    for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(start, end), c);
    return out;
}

FlowAnimator.prototype._exportWithWebCodecs = async function(scenes, opts, W, H, audioBuffer) {
    const M = window.Mediabunny;
    const webm = opts.format === 'webm';
    const quality = { high: M.QUALITY_HIGH, medium: M.QUALITY_MEDIUM, low: M.QUALITY_LOW }[opts.quality] || M.QUALITY_HIGH;
    const codecs = webm ? ['vp9', 'vp8', 'av1'] : ['avc', 'hevc', 'vp9', 'av1'];
    const codec = await M.getFirstEncodableVideoCodec(codecs, { width: W, height: H, bitrate: quality, frameRate: opts.fps });
    if (!codec) throw new Error('nenhum codec de vídeo disponível');

    const output = new M.Output({
        format: webm ? new M.WebMOutputFormat() : new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new M.BufferTarget()
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const videoSource = new M.CanvasSource(canvas, { codec, bitrate: quality, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: opts.fps });

    let audioSource = null;
    if (audioBuffer) {
        const acodec = await M.getFirstEncodableAudioCodec(webm ? ['opus', 'vorbis'] : ['aac', 'opus'], { numberOfChannels: 2, sampleRate: audioBuffer.sampleRate });
        if (acodec) {
            audioSource = new M.AudioBufferSource({ codec: acodec, bitrate: M.QUALITY_MEDIUM });
            output.addAudioTrack(audioSource);
        } else {
            Toast.show(t('noAudioCodec'));
        }
    }

    const totalFrames = scenes.reduce((n, s) => n + Math.max(1, Math.round(s.state.totalAnimationTime * opts.fps)), 0);
    Progress.show(t('exportingVideo'), () => { this._exportCancelled = true; });
    await output.start();

    // Áudio em blocos de 1s acompanhando o vídeo (evita esperar por backpressure de uma
    // trilha enquanto a outra ainda não começou)
    let audioPos = 0;
    const feedAudio = async (untilSec) => {
        if (!audioSource) return;
        while (audioPos < Math.min(untilSec, audioBuffer.duration)) {
            const chunk = _sliceAudioBuffer(audioBuffer, audioPos, Math.min(audioPos + 1, audioBuffer.duration));
            audioPos = Math.min(audioPos + 1, audioBuffer.duration);
            if (chunk) await audioSource.add(chunk);
        }
    };

    const started = performance.now();
    let frame = 0;
    for (const scene of scenes) {
        const view = this._exportView(scene);
        const n = Math.max(1, Math.round(scene.state.totalAnimationTime * opts.fps));
        for (let f = 0; f < n; f++) {
            if (this._exportCancelled) {
                await output.cancel();
                Toast.show(t('exportCancelled'));
                return;
            }
            const ts = frame / opts.fps;
            await feedAudio(ts + 1);
            this.renderOutputFrame(ctx, W, H, view, f / opts.fps, opts.fit);
            await videoSource.add(ts, 1 / opts.fps);
            frame++;
            if (frame % 5 === 0 || frame === totalFrames) {
                const elapsed = (performance.now() - started) / 1000;
                const eta = frame > 5 ? Math.round(elapsed / frame * (totalFrames - frame)) : null;
                Progress.update(frame / totalFrames, t('exportFrameOf', { n: frame, total: totalFrames }) + (eta != null ? ' · ' + t('etaSeconds', { s: eta }) : ''));
                await new Promise((r) => setTimeout(r, 0));
            }
        }
    }
    await feedAudio(Infinity);
    Progress.update(1, t('finalizing'));
    await output.finalize();

    const blob = new Blob([output.target.buffer], { type: webm ? 'video/webm' : 'video/mp4' });
    Util.downloadBlob(blob, `${Util.slug(this.projectName, 'animacao')}_${W}x${H}.${webm ? 'webm' : 'mp4'}`);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    if (!webm && codec !== 'avc') Toast.show(t('mp4CodecNote', { codec: codec.toUpperCase() }), { duration: 8000 });
    else this.showTooltip(t('videoExported', { s: secs }));
};

FlowAnimator.prototype._exportWithMediaRecorder = async function(scenes, opts, W, H, audioBuffer) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(opts.fps);

    let audioCtx = null, audioNode = null;
    if (audioBuffer) {
        audioCtx = this.audio.ensureContext();
        const dest = audioCtx.createMediaStreamDestination();
        audioNode = audioCtx.createBufferSource();
        audioNode.buffer = audioBuffer;
        audioNode.connect(dest);
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }

    const candidates = opts.format === 'webm'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const bits = { high: 10e6, medium: 6e6, low: 3e6 }[opts.quality] || 8e6;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: bits } : undefined);
    this.mediaRecorder = recorder;
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

    const timeline = [];
    let acc = 0;
    for (const s of scenes) {
        timeline.push({ view: this._exportView(s), start: acc, dur: s.state.totalAnimationTime });
        acc += s.state.totalAnimationTime;
    }
    const total = acc;

    this.isRecording = true;
    Progress.show(t('exportingRealtime'), () => { this._exportCancelled = true; });
    document.getElementById('recordingIndicator').style.display = 'block';
    Toast.show(t('realtimeWarning'), { duration: 6000 });

    this.renderOutputFrame(ctx, W, H, timeline[0].view, 0, opts.fit);
    recorder.start(100);
    const t0 = performance.now();
    if (audioNode) audioNode.start();

    await new Promise((resolve) => {
        const tick = () => {
            const elapsed = (performance.now() - t0) / 1000;
            if (this._exportCancelled || elapsed >= total) { resolve(); return; }
            const seg = timeline.find((s) => elapsed < s.start + s.dur) || timeline[timeline.length - 1];
            this.renderOutputFrame(ctx, W, H, seg.view, Math.min(seg.dur, elapsed - seg.start), opts.fit);
            Progress.update(elapsed / total);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const last = timeline[timeline.length - 1];
    this.renderOutputFrame(ctx, W, H, last.view, last.dur, opts.fit);
    await new Promise((r) => setTimeout(r, 300));
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    if (audioNode) { try { audioNode.stop(); } catch (e) { /* já parou */ } }
    stream.getTracks().forEach((tr) => tr.stop());
    this.isRecording = false;
    this.mediaRecorder = null;
    if (this._exportCancelled) { Toast.show(t('exportCancelled')); return; }
    const type = recorder.mimeType || mimeType || 'video/webm';
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    Util.downloadBlob(new Blob(chunks, { type }), `${Util.slug(this.projectName, 'animacao')}_${W}x${H}.${ext}`);
    this.showTooltip(t('videoExported', { s: total.toFixed(1) }));
};

// Interrompe uma exportação em tempo real em andamento
FlowAnimator.prototype.stopRecording = function() {
    this._exportCancelled = true;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
    this.isRecording = false;
    document.getElementById('recordingIndicator').style.display = 'none';
};

// Compat (nome antigo)
FlowAnimator.prototype._downloadBlob = function(blob, filename) {
    Util.downloadBlob(blob, filename);
};

// ─── Frames PNG (ZIP) ──────────────────────────────────────────────────────

FlowAnimator.prototype.exportAsFrames = async function(options) {
    const opts = Object.assign({ fps: 30, preset: 'auto-1080', fit: 'contain' }, options || {});
    if (!this._hasContent()) {
        this.showTooltip(t('addActionsFirst'));
        return;
    }
    if (this.isExporting) return;
    this.isExporting = true;
    this._exportCancelled = false;
    try {
        if (this.isPlaying) this.pause();
        this._captureScene();
        const scene = this._scene();
        const view = this._exportView(scene);
        const { w, h } = this._outputSize(opts.preset, scene);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const totalFrames = Math.max(1, Math.floor(this.totalAnimationTime * opts.fps));
        const zip = new ZipBuilder();
        Progress.show(t('exportingFrames'), () => { this._exportCancelled = true; });
        for (let frame = 0; frame < totalFrames; frame++) {
            if (this._exportCancelled) { Toast.show(t('exportCancelled')); return; }
            this.renderOutputFrame(ctx, w, h, view, frame / opts.fps, opts.fit);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (blob) zip.addFile('frame_' + String(frame).padStart(5, '0') + '.png', new Uint8Array(await blob.arrayBuffer()));
            Progress.update((frame + 1) / totalFrames, t('exportFrameOf', { n: frame + 1, total: totalFrames }));
            if (frame % 10 === 9) await new Promise((r) => setTimeout(r, 0));
        }
        Util.downloadBlob(zip.build(), 'frames_' + Date.now() + '.zip');
        this.showTooltip(t('framesExported', { n: totalFrames }));
    } catch (error) {
        this.handleError(t('errExportFrames'), error);
        Toast.show(t('errExportFrames'), { kind: 'error' });
    } finally {
        this.isExporting = false;
        Progress.hide();
    }
};

// ─── GIF ───────────────────────────────────────────────────────────────────

FlowAnimator.GIF_MAX_FRAMES = 900;

FlowAnimator.prototype.exportGif = async function(options) {
    const opts = Object.assign({ width: 640, fps: 12, scope: 'current', fit: 'contain' }, options || {});
    if (this.isExporting) return;
    const scenes = this._exportScenes(opts.scope).filter((s) => this._sceneHasContent(s));
    if (!scenes.length) { this.showTooltip(t('addActionsFirst')); return; }
    if (this.isPlaying) this.pause();
    this.isExporting = true;
    this._exportCancelled = false;
    try {
        await Promise.all(scenes.map((s) => this._ensureSceneBackground(s).catch(() => null)));
        const base = this._outputSize('auto-1080', scenes[0]);
        const W = Math.round(opts.width);
        const H = Math.max(2, Math.round(W * base.h / base.w));
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const frames = [];
        for (const s of scenes) {
            const view = this._exportView(s);
            const n = Math.max(1, Math.round(s.state.totalAnimationTime * opts.fps));
            for (let f = 0; f < n; f++) frames.push({ view, t: f / opts.fps });
        }
        if (frames.length > FlowAnimator.GIF_MAX_FRAMES) {
            const step = frames.length / FlowAnimator.GIF_MAX_FRAMES;
            const reduced = [];
            for (let i = 0; i < FlowAnimator.GIF_MAX_FRAMES; i++) reduced.push(frames[Math.floor(i * step)]);
            frames.length = 0;
            frames.push(...reduced);
            Toast.show(t('gifReduced', { n: FlowAnimator.GIF_MAX_FRAMES }));
        }
        Progress.show(t('exportingGif'), () => { this._exportCancelled = true; });

        // Paleta global a partir de algumas amostras (início, meio, fim)
        const samples = [];
        const picks = [0, Math.floor(frames.length / 3), Math.floor(frames.length * 2 / 3), frames.length - 1];
        for (const i of picks) {
            const fr = frames[Math.max(0, i)];
            this.renderOutputFrame(ctx, W, H, fr.view, fr.t, opts.fit);
            samples.push(ctx.getImageData(0, 0, W, H).data);
        }
        const palette = GifEncoder.buildPalette(samples, 256);
        const enc = new GifEncoder(W, H, palette, { loop: 0 });
        const delay = 100 / opts.fps;
        for (let i = 0; i < frames.length; i++) {
            if (this._exportCancelled) { Toast.show(t('exportCancelled')); return; }
            this.renderOutputFrame(ctx, W, H, frames[i].view, frames[i].t, opts.fit);
            enc.addFrame(ctx.getImageData(0, 0, W, H).data, delay);
            if (i % 3 === 0) {
                Progress.update((i + 1) / frames.length, t('exportFrameOf', { n: i + 1, total: frames.length }));
                await new Promise((r) => setTimeout(r, 0));
            }
        }
        Util.downloadBlob(enc.finish(), `${Util.slug(this.projectName, 'animacao')}.gif`);
        this.showTooltip(t('gifExported'));
    } catch (error) {
        this.handleError(t('errExportGif'), error);
        Toast.show(t('errExportGif'), { kind: 'error' });
    } finally {
        this.isExporting = false;
        Progress.hide();
    }
};

// ─── Frame atual (PNG) ─────────────────────────────────────────────────────

FlowAnimator.prototype.exportCurrentFramePng = async function() {
    this._captureScene();
    const scene = this._scene();
    const view = this._exportView(scene);
    view.crop = null;
    const c = document.createElement('canvas');
    c.width = scene.width;
    c.height = scene.height;
    this._composite(c.getContext('2d'), view, this.currentTime());
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    Util.downloadBlob(blob, `${Util.slug(this.projectName, 'frame')}_${this.currentTime().toFixed(1)}s.png`);
    this.showTooltip(t('pngExported'));
};

// ─── Legendas (SRT / VTT) a partir dos comentários ─────────────────────────

FlowAnimator.prototype.buildSubtitles = function(format) {
    this._captureScene();
    const cues = [];
    let offset = 0;
    for (const s of this.scenes) {
        for (const c of (s.state.comments || [])) {
            if (c.kind === 'badge' || !String(c.text || '').trim()) continue;
            const start = offset + (c.time || 0);
            const end = start + (c.duration || 3);
            cues.push({ start, end, text: String(c.text).trim() });
        }
        offset += s.state.totalAnimationTime;
    }
    cues.sort((a, b) => a.start - b.start);
    if (format === 'vtt') {
        return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${Util.formatTimestamp(c.start, '.')} --> ${Util.formatTimestamp(c.end, '.')}\n${c.text}\n`).join('\n');
    }
    return cues.map((c, i) => `${i + 1}\n${Util.formatTimestamp(c.start, ',')} --> ${Util.formatTimestamp(c.end, ',')}\n${c.text}\n`).join('\n');
};

FlowAnimator.prototype.exportSubtitles = function(format) {
    const text = this.buildSubtitles(format);
    if (!text.replace(/^WEBVTT\s*/, '').trim()) { this.showTooltip(t('noCommentsForSubs')); return; }
    Util.downloadBlob(new Blob([text], { type: format === 'vtt' ? 'text/vtt' : 'application/x-subrip' }),
        `${Util.slug(this.projectName, 'legendas')}.${format === 'vtt' ? 'vtt' : 'srt'}`);
    this.showTooltip(t('subsExported'));
};
