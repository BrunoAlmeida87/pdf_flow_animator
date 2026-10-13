// Mídia do FlowAnimator: importação de PDF (uma cena por página), imagem e áudio; fundos das
// cenas; assets (bytes guardados no projeto e no IndexedDB).

// Resolução de render das páginas: lado maior ≈ 2400px, limitado a 8 MP — PDFs gigantes (ex.:
// pôster A0) não estouram a memória dos ~6 canvases do mesmo tamanho, e páginas pequenas
// ficam nítidas com zoom.
FlowAnimator.PDF_TARGET_LONG_SIDE = 2400;
FlowAnimator.PDF_MAX_PIXELS = 8e6;
FlowAnimator.IMAGE_MAX_LONG_SIDE = 3840;
FlowAnimator.IMAGE_MAX_PIXELS = 12e6;
FlowAnimator.MAX_PDF_SCENES = 300;

FlowAnimator.prototype._fitSize = function(w, h, targetLong, maxPixels, allowUpscale) {
    const long = Math.max(w, h);
    let scale = Math.min(targetLong / long, Math.sqrt(maxPixels / (w * h)));
    if (!allowUpscale) scale = Math.min(1, scale);
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

// Encaminha qualquer arquivo (botão importar, arrastar-e-soltar, colar)
FlowAnimator.prototype.loadFile = function(file) {
    const name = (file.name || '').toLowerCase();
    const type = file.type || '';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return this.loadPDF(file);
    if (type.startsWith('image/')) return this.loadImage(file);
    if (type === 'application/json' || name.endsWith('.json')) return this.importJSON(file);
    if (type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/.test(name)) return this.importAudioFile(file);
    this.showTooltip(t('unsupportedFile'));
    return Promise.resolve();
};

FlowAnimator.prototype.addAsset = function(asset) {
    const id = asset.id || Util.uid('asset');
    this.assets.set(id, { id, kind: asset.kind, mime: asset.mime, name: asset.name || '', bytes: asset.bytes });
    this.markDirty();
    return id;
};

FlowAnimator.prototype._pdfOptions = function(bytes) {
    return {
        // pdf.js transfere o buffer para o worker (o original fica "detached") — passa uma cópia
        data: bytes.slice(),
        // CVE-2024-4367: no PDF.js < 4.2.67, com isEvalSupported=true (padrão) um PDF
        // malicioso consegue executar JavaScript na origem do app.
        isEvalSupported: false,
        // cMaps (fontes CJK) vêm por fetch, que o Chrome bloqueia em file:// — nesse caso CDN
        cMapUrl: location.protocol === 'file:'
            ? 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/'
            : 'vendor/pdfjs/cmaps/',
        cMapPacked: true
    };
};

// Documento PDF de um asset (cacheado por asset)
FlowAnimator.prototype._getPdfDoc = function(assetId) {
    if (!this._pdfDocs) this._pdfDocs = new Map();
    if (!this._pdfDocs.has(assetId)) {
        const asset = this.assets.get(assetId);
        if (!asset) return Promise.reject(new Error('PDF ausente no projeto'));
        if (typeof pdfjsLib === 'undefined') return Promise.reject(new Error('PDF.js não carregado'));
        const p = pdfjsLib.getDocument(this._pdfOptions(asset.bytes)).promise;
        p.catch(() => this._pdfDocs.delete(assetId));
        this._pdfDocs.set(assetId, p);
    }
    return this._pdfDocs.get(assetId);
};

FlowAnimator.prototype._isSceneEmpty = function(scene) {
    const s = scene === this._scene() ? this._liveState() : scene.state;
    const empty = !(s.actions.length || s.comments.length || (s.cameraMoves || []).length || (s.audioClips || []).length);
    return empty && (!scene.background || scene.background.kind === 'blank');
};

// Insere cenas novas: substitui a atual se ela estiver vazia (quadro branco sem conteúdo),
// senão acrescenta logo depois. Nunca destrói trabalho existente.
FlowAnimator.prototype._insertScenes = function(newScenes) {
    this._captureScene();
    const cur = this._scene();
    let at;
    if (cur && this._isSceneEmpty(cur)) {
        at = this.currentSceneIndex;
        this.scenes.splice(at, 1, ...newScenes);
    } else {
        at = this.currentSceneIndex + 1;
        this.scenes.splice(at, 0, ...newScenes);
    }
    this._applyScene(at);
    this._afterSceneChange();
    this.markDirty();
};

FlowAnimator.prototype._adoptNameFrom = function(fileName) {
    if (this.projectName && this.projectName !== t('untitledProject') && this.projectName !== 'Projeto sem título' && this.projectName !== 'Untitled project') return;
    const base = String(fileName || '').replace(/\.[^.]+$/, '').slice(0, 120);
    if (!base) return;
    this.projectName = base;
    const input = document.getElementById('projectName');
    if (input) input.value = base;
};

FlowAnimator.prototype.loadPDF = async function(file) {
    this._setFileLabel(t('loadingPdf'));
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const assetId = this.addAsset({ kind: 'pdf', mime: 'application/pdf', name: file.name, bytes });
        const pdf = await this._getPdfDoc(assetId);
        this.pdfDoc = pdf;
        this.documentAssetId = assetId;
        this.isImage = false;

        const total = Math.min(pdf.numPages, FlowAnimator.MAX_PDF_SCENES);
        const scenes = [];
        for (let i = 1; i <= total; i++) {
            const page = await pdf.getPage(i);
            const vp = page.getViewport({ scale: 1 });
            const size = this._fitSize(vp.width, vp.height, FlowAnimator.PDF_TARGET_LONG_SIDE, FlowAnimator.PDF_MAX_PIXELS, true);
            scenes.push(this._newScene({ width: size.width, height: size.height, background: { kind: 'pdf', assetId, page: i } }));
        }
        await this._ensureSceneBackground(scenes[0]);
        this.pdfPage = await pdf.getPage(1);
        this._adoptNameFrom(file.name);
        this._insertScenes(scenes);
        this._setFileLabel();
        if (pdf.numPages > total) this.showTooltip(t('pdfTruncated', { n: total }));
        else this.showTooltip(total > 1 ? t('pdfScenesCreated', { n: total }) : t('pdfLoaded'));
    } catch (error) {
        this.handleError(t('errLoadPdf'), error);
        Toast.show(t('errLoadPdf'), { kind: 'error' });
        this._setFileLabel();
    }
};

FlowAnimator.prototype.loadImage = async function(file) {
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const mime = file.type || 'image/png';
        const img = await Util.bytesToImage(bytes, mime);
        const size = this._fitSize(img.naturalWidth, img.naturalHeight, FlowAnimator.IMAGE_MAX_LONG_SIDE, FlowAnimator.IMAGE_MAX_PIXELS, false);
        const assetId = this.addAsset({ kind: 'image', mime, name: file.name || t('pastedImage'), bytes });
        const scene = this._newScene({ width: size.width, height: size.height, background: { kind: 'image', assetId } });
        scene._bgCanvas = this._imageToCanvas(img, size.width, size.height);
        this.isImage = true;
        this.pdfDoc = null;
        this._adoptNameFrom(file.name);
        this._insertScenes([scene]);
        this._setFileLabel();
        this.showTooltip(t('imageLoaded'));
    } catch (error) {
        this.handleError(t('errLoadImage'), error);
        Toast.show(t('errLoadImage'), { kind: 'error' });
    }
};

FlowAnimator.prototype._imageToCanvas = function(img, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return c;
};

// Garante o canvas de fundo da cena (render da página do PDF ou decodificação da imagem)
FlowAnimator.prototype._ensureSceneBackground = function(scene) {
    if (scene._bgCanvas) return Promise.resolve(scene._bgCanvas);
    if (scene._bgPromise) return scene._bgPromise;
    const bg = scene.background || { kind: 'blank' };
    let p;
    if (bg.kind === 'pdf') {
        p = this._getPdfDoc(bg.assetId).then((doc) => doc.getPage(bg.page)).then((page) => {
            const vp1 = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: scene.width / vp1.width });
            const c = document.createElement('canvas');
            c.width = scene.width;
            c.height = scene.height;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            return page.render({ canvasContext: ctx, viewport }).promise.then(() => c);
        });
    } else if (bg.kind === 'image' && bg.assetId && this.assets.has(bg.assetId)) {
        const asset = this.assets.get(bg.assetId);
        p = Util.bytesToImage(asset.bytes, asset.mime).then((img) => this._imageToCanvas(img, scene.width, scene.height));
    } else {
        p = Promise.resolve(null);
    }
    scene._bgPromise = p.then((canvas) => {
        scene._bgCanvas = canvas;
        scene._thumb = null;
        return canvas;
    }).finally(() => { scene._bgPromise = null; });
    return scene._bgPromise;
};

// Compat: carregar a página N = ir para a cena da página N do PDF atual
FlowAnimator.prototype.loadPage = function(pageNumber) {
    const idx = this.scenes.findIndex((s) => s.background.kind === 'pdf' && s.background.page === pageNumber);
    if (idx < 0) { this.showTooltip(t('pageNotFound', { n: pageNumber })); return Promise.resolve(); }
    this.switchScene(idx);
    return this._ensureSceneBackground(this.scenes[idx]);
};

// Adiciona uma cena com a página N do PDF do projeto
FlowAnimator.prototype.addPdfPageScene = async function(pageNumber) {
    if (!this.documentAssetId) return;
    const doc = await this._getPdfDoc(this.documentAssetId);
    if (pageNumber < 1 || pageNumber > doc.numPages) return;
    const page = await doc.getPage(pageNumber);
    const vp = page.getViewport({ scale: 1 });
    const size = this._fitSize(vp.width, vp.height, FlowAnimator.PDF_TARGET_LONG_SIDE, FlowAnimator.PDF_MAX_PIXELS, true);
    const scene = this._newScene({ width: size.width, height: size.height, background: { kind: 'pdf', assetId: this.documentAssetId, page: pageNumber } });
    await this._ensureSceneBackground(scene);
    this._captureScene();
    this.scenes.splice(this.currentSceneIndex + 1, 0, scene);
    this._applyScene(this.currentSceneIndex + 1);
    this._afterSceneChange();
    this.markDirty();
};

FlowAnimator.prototype._setFileLabel = function(text) {
    const el = document.getElementById('fileName');
    if (!el) return;
    if (text) { el.textContent = text; return; }
    const scene = this._scene();
    const bg = scene ? scene.background : { kind: 'blank' };
    if (bg.kind === 'pdf') {
        const asset = this.assets.get(bg.assetId);
        const total = this.scenes.filter((s) => s.background.kind === 'pdf' && s.background.assetId === bg.assetId).length;
        el.textContent = `${asset ? asset.name : 'PDF'} — ${t('pageOf', { n: bg.page, total: (this.pdfDoc && this.pdfDoc.numPages) || total })}`;
        this.isImage = false;
    } else if (bg.kind === 'image') {
        const asset = this.assets.get(bg.assetId);
        el.textContent = asset ? asset.name : t('imageBackground');
        this.isImage = true;
    } else {
        el.textContent = t('noFileLoaded');
        this.isImage = false;
    }
};

// ─── Áudio ─────────────────────────────────────────────────────────────────

FlowAnimator.prototype._ensureAudioDecoded = async function(assetId) {
    if (this._audioBuffers.has(assetId)) return this._audioBuffers.get(assetId);
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    const buffer = await this.audio.decode(asset.bytes);
    this._audioBuffers.set(assetId, buffer);
    if (this.timeline) this.timeline.refresh(true);
    return buffer;
};

FlowAnimator.prototype._decodeAllAudio = function() {
    const ids = new Set();
    const collect = (clips) => { for (const c of clips || []) if (c.assetId) ids.add(c.assetId); };
    collect(this.audioClips);
    for (const s of this.scenes) collect(s.state && s.state.audioClips);
    return Promise.all(Array.from(ids).map((id) => this._ensureAudioDecoded(id).catch((e) => this.handleError(t('errAudio'), e))));
};

FlowAnimator.prototype._addAudioClip = function(assetId, buffer, startTime, name, duration) {
    this.saveUndoState();
    const clip = {
        id: Util.uid('au'),
        assetId,
        name: name || t('audio'),
        startTime: Math.max(0, startTime),
        duration: Math.max(0.1, Math.min(duration || buffer.duration, buffer.duration)),
        offset: 0,
        volume: 1
    };
    this.audioClips.push(clip);
    this._ensureDurationCovers(clip.startTime + clip.duration);
    this._afterContentChange();
    return clip;
};

FlowAnimator.prototype.importAudioFile = async function(file) {
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const buffer = await this.audio.decode(bytes);
        const assetId = this.addAsset({ kind: 'audio', mime: file.type || 'audio/mpeg', name: file.name, bytes });
        this._audioBuffers.set(assetId, buffer);
        this._addAudioClip(assetId, buffer, this.currentTime(), file.name.replace(/\.[^.]+$/, ''));
        this.showTooltip(t('audioImported', { s: Util.num(buffer.duration, 1) }));
    } catch (error) {
        this.handleError(t('errAudio'), error);
        Toast.show(t('errAudio'), { kind: 'error' });
    }
};

// Clipe a partir de uma gravação do microfone ({ bytes, mime, duration })
FlowAnimator.prototype._addRecordedAudio = async function(result, startTime, name) {
    if (!result || !result.bytes || !result.bytes.length) return null;
    try {
        const buffer = await this.audio.decode(result.bytes);
        const assetId = this.addAsset({ kind: 'audio', mime: result.mime || 'audio/webm', name: name + '.webm', bytes: result.bytes });
        this._audioBuffers.set(assetId, buffer);
        const clip = this._addAudioClip(assetId, buffer, startTime, name);
        Toast.show(t('narrationSaved', { s: Util.num(clip.duration, 1) }), { action: { label: t('undo'), onClick: () => this.undo() } });
        return clip;
    } catch (error) {
        this.handleError(t('errAudio'), error);
        Toast.show(t('errAudio'), { kind: 'error' });
        return null;
    }
};
