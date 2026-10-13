// Flow Animator — núcleo: estado do projeto e das cenas, seleção, undo/redo, reprodução e
// modo de gravação. Outras responsabilidades estendem o mesmo prototype em arquivos próprios:
//   fa-render.js  (motor de renderização: tinta, comentários, efeitos, câmera)
//   fa-input.js   (pointer/teclado, ferramentas, zoom/pan, crop, arrastar-e-soltar)
//   fa-media.js   (PDF/imagem/áudio, fundos das cenas, assets)
//   fa-project.js (serialização, validação, autosave em IndexedDB, projetos)
//   fa-export.js  (vídeo WebCodecs/MediaRecorder, GIF, frames, PNG, legendas)
// Não redefina um método já existente em outro desses arquivos — a segunda definição
// sobrescreve a primeira em silêncio (ver CLAUDE.md; scripts/check-duplicates.js checa no CI).

function FlowAnimator() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.mode = 'draw';
    this.isDrawing = false;
    this.currentPath = [];

    // Estado da cena ATUAL (as demais cenas guardam o seu em scene.state)
    this.actions = [];        // draw / erase / laser / spotlight / redact — tempo absoluto (startTime)
    this.comments = [];       // comentários e números de passo (kind: 'badge')
    this.cameraMoves = [];    // { id, startTime, duration, rect, easing }
    this.audioClips = [];     // { id, assetId, startTime, duration, offset, volume, name }
    this.markers = [];        // { id, time, label }
    this.totalAnimationTime = 10;

    this.isPlaying = false;
    this.animationProgress = 0;
    this.animationSpeed = 1;
    this.persistPaths = true;

    // Canvas só com os traços do usuário (cache da visão de edição). O apagador
    // (destination-out) age só aqui — nunca no canvas principal — e por isso nunca apaga o fundo.
    this.drawingCanvas = document.createElement('canvas');
    this.drawingCtx = this.drawingCanvas.getContext('2d');

    // Projeto
    this.projectId = Util.uid('proj');
    this.projectName = t('untitledProject');
    this.scenes = [];
    this.currentSceneIndex = 0;
    this.assets = new Map();       // id → { id, kind: 'pdf'|'image'|'audio', mime, name, bytes }
    this.documentAssetId = null;   // PDF de origem das cenas de página
    this.pdfDoc = null;
    this.pdfPage = null;
    this.isImage = false;
    this.pdfImageData = null;
    this.displayScale = 1;
    this.panX = 0;
    this.panY = 0;

    // Configurações das ferramentas (persistidas em settings)
    this.flowColor = '#4a90e2';
    this.lineWidth = 3;
    this.penStyle = 'smooth';      // 'smooth' (largura constante) | 'pen' (pressão, perfect-freehand)
    this.eraseSize = 20;
    this.highlightColor = '#ffd400';
    this.highlightWidth = 22;
    this.shapeFill = false;
    this.commentTextColor = '#222222';
    this.commentBgColor = '#ffffff';
    this.commentBorderColor = '#f39c12';
    this.commentFontFamily = 'Arial';
    this.commentFontSize = 24;
    this.commentOpacity = 0.95;
    this.commentAnimIn = 'pop';
    this.commentAnimOut = 'fade';
    this.commentBalloon = false;
    this.badgeColor = '#e74c3c';
    this.laserColor = '#ff3b30';
    this.spotlightDim = 0.6;
    this.spotlightShape = 'rect';
    this.redactMode = 'pixelate';

    // Seleção (ids estáveis — sobrevive a undo/redo, que recria os objetos)
    this.selection = new Set();
    this.clipboard = null;

    // Comentário em posicionamento / arrasto
    this.selectedComment = null;
    this.isDraggingComment = false;
    this.dragOffset = { x: 0, y: 0 };
    this.isPositioningComment = false;
    this.commentPreview = document.createElement('div');
    this.commentPreview.className = 'inline-editor';
    this.commentPreview.style.pointerEvents = 'none';
    this.commentPreview.style.resize = 'none';

    // Modo de gravação (ver enterTimelineMode e CLAUDE.md)
    this.timelineMode = false;
    this._recordContinuous = false; // com narração: relógio contínuo em tempo real
    this._recordCursor = 0;
    this._recordFloor = 0;
    this._recordBase = 0;
    this._recordClockRef = 0;
    this._recordRAF = null;
    this.narrationEnabled = false;

    // Linha reta
    this.isAltPressed = false;
    this.isShiftPressed = false;
    this.isDrawingStraightLine = false;
    this.straightLineStart = null;
    this.drawStartTime = null;

    // Exportação
    this.isRecording = false;
    this.isExporting = false;
    this.mediaRecorder = null;
    this.recordingChunks = [];

    this.lastError = null;
    this.errorCount = 0;

    this.brushPreview = document.getElementById('brushPreview');
    this.eraserPreview = document.getElementById('eraserPreview');

    // Região de gravação (crop estático, base da câmera) em coordenadas do canvas
    this.cropRegion = null;
    this._cropPreview = null;

    this._undoStack = [];
    this._redoStack = [];

    // Composição da reprodução (reutilizado por frame) e caches de render
    this._offscreenCanvas = document.createElement('canvas');
    this._offscreenCtx = this._offscreenCanvas.getContext('2d');
    this._bgCanvas = null;
    this._persistedDrawsCanvas = document.createElement('canvas');
    this._persistedDrawsCtx = this._persistedDrawsCanvas.getContext('2d');
    this._persistedDrawsKey = null;

    this.audio = new AudioEngine();
    this._audioBuffers = new Map(); // assetId → AudioBuffer (decodificado sob demanda)
    this.cameraPreview = false;

    this._dirty = false;

    this._initScenes();
    this.initializeCanvas();
    this.bindEvents();
    this.timeline = new TimelinePro(this);
    this.checkLocalStorage();
    this.updateSceneUI();
}

// ─── Canvas ────────────────────────────────────────────────────────────────

FlowAnimator.prototype.initializeCanvas = function() {
    this._syncCanvasSizes(1920, 1080);
    this.clearCanvas();
    this.updateCanvasInfo();
};

// Mantém TODOS os canvases internos com o mesmo tamanho do principal. Sem isso, o
// _offscreenCanvas de composição ficava travado em 1920×1080 e clipava os traços durante a
// animação em PDFs maiores (ex.: A4 retrato).
FlowAnimator.prototype._syncCanvasSizes = function(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.canvas.width = w;
    this.canvas.height = h;
    this.drawingCanvas.width = w;
    this.drawingCanvas.height = h;
    this._offscreenCanvas.width = w;
    this._offscreenCanvas.height = h;
    this._persistedDrawsCanvas.width = w;
    this._persistedDrawsCanvas.height = h;
    this._persistedDrawsKey = null;
    const scene = this._scene();
    if (scene) { scene.width = w; scene.height = h; }
    if (this._cropCanvas) this._syncCropCanvas();
};

// Define o fundo da cena atual a partir de um ImageData (null = quadro branco). Converte em
// canvas cacheado: drawImage é muito mais rápido que putImageData por frame.
FlowAnimator.prototype._setBackgroundFromImageData = function(imageData) {
    this.pdfImageData = imageData;
    const scene = this._scene();
    if (!imageData) {
        this._bgCanvas = null;
        if (scene) {
            scene._bgCanvas = null;
            scene.background = { kind: 'blank', color: (scene.background && scene.background.color) || '#ffffff' };
        }
        return;
    }
    const bg = document.createElement('canvas');
    bg.width = imageData.width;
    bg.height = imageData.height;
    bg.getContext('2d').putImageData(imageData, 0, 0);
    this._bgCanvas = bg;
    if (scene) {
        scene._bgCanvas = bg;
        if (!scene.background || scene.background.kind === 'blank') scene.background = { kind: 'image', assetId: null };
    }
};

FlowAnimator.prototype._drawBackground = function(ctx, view) {
    const v = view || this._liveView();
    if (v.bg) {
        ctx.drawImage(v.bg, 0, 0, v.width, v.height);
    } else {
        ctx.fillStyle = v.bgColor || '#ffffff';
        ctx.fillRect(0, 0, v.width, v.height);
    }
};

FlowAnimator.prototype.clearCanvas = function() {
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawBackground(this.ctx);
};

// ─── Cenas ─────────────────────────────────────────────────────────────────

FlowAnimator.prototype._newScene = function(opts) {
    const o = opts || {};
    return {
        id: o.id || Util.uid('scene'),
        name: o.name || '',
        width: o.width || 1920,
        height: o.height || 1080,
        background: o.background || { kind: 'blank', color: '#ffffff' },
        state: o.state || { actions: [], comments: [], cameraMoves: [], audioClips: [], markers: [], totalAnimationTime: 10 },
        _bgCanvas: null,
        _bgPromise: null,
        _undo: [],
        _redo: [],
        _thumb: null
    };
};

FlowAnimator.prototype._initScenes = function() {
    this.scenes = [this._newScene()];
    this.currentSceneIndex = 0;
};

FlowAnimator.prototype._scene = function() {
    return (this.scenes && this.scenes[this.currentSceneIndex]) || null;
};

// Grava o estado de trabalho (campos do FlowAnimator) na cena atual
FlowAnimator.prototype._captureScene = function() {
    const scene = this._scene();
    if (!scene) return;
    scene.state = this._liveState();
    scene._undo = this._undoStack;
    scene._redo = this._redoStack;
    scene._bgCanvas = this._bgCanvas;
    scene.cropRegion = this.cropRegion;
    scene._thumb = null;
};

// Carrega o estado de uma cena nos campos de trabalho (sem re-render)
FlowAnimator.prototype._applyScene = function(index) {
    this.currentSceneIndex = Util.clamp(index, 0, this.scenes.length - 1);
    const scene = this._scene();
    const s = scene.state;
    this.actions = s.actions || [];
    this.comments = s.comments || [];
    this.cameraMoves = s.cameraMoves || [];
    this.audioClips = s.audioClips || [];
    this.markers = s.markers || [];
    this.totalAnimationTime = s.totalAnimationTime || 10;
    const durInput = document.getElementById('totalDuration');
    if (durInput) durInput.value = this.totalAnimationTime;
    this._undoStack = scene._undo || (scene._undo = []);
    this._redoStack = scene._redo || (scene._redo = []);
    this._bgCanvas = scene._bgCanvas || null;
    this.selection.clear();
    this.animationProgress = 0;
    this._syncCanvasSizes(scene.width, scene.height);
    this.cropRegion = scene.cropRegion || null;
    if (this._cropCanvas) this.drawCropOverlay();
    if (this.updateCropIndicator) this.updateCropIndicator();

    if (!this._bgCanvas && scene.background && scene.background.kind !== 'blank') {
        this._ensureSceneBackground(scene).then(() => {
            if (this._scene() === scene) {
                this._bgCanvas = scene._bgCanvas;
                if (this.isPlaying) this.renderAnimationFrame();
                else this.redrawMainCanvas();
                this._updateEmptyState();
            }
        }).catch((e) => this.handleError(t('errBackground'), e));
    }
};

FlowAnimator.prototype.switchScene = function(index) {
    if (index === this.currentSceneIndex || index < 0 || index >= this.scenes.length) return;
    if (this.isPlaying) this.pause();
    if (this.timelineMode) this.exitTimelineMode();
    this._captureScene();
    this._applyScene(index);
    this._afterSceneChange();
};

FlowAnimator.prototype._afterSceneChange = function() {
    this.rebuildDrawingCanvas();
    this.redrawMainCanvas();
    this.timeline.refresh();
    this.updateInfo();
    this.updateTimeDisplay();
    this.updateSceneUI();
    this.fitToScreen();
    if (this.inspector) this.inspector.refresh();
    this._updateEmptyState();
};

FlowAnimator.prototype.addBlankScene = function(after) {
    this._captureScene();
    const cur = this._scene();
    const scene = this._newScene({ width: cur ? cur.width : 1920, height: cur ? cur.height : 1080 });
    const at = after != null ? after + 1 : this.scenes.length;
    this.scenes.splice(at, 0, scene);
    this._applyScene(at);
    this._afterSceneChange();
    this.markDirty();
    return scene;
};

FlowAnimator.prototype.duplicateScene = function(index) {
    this._captureScene();
    const src = this.scenes[index];
    if (!src) return;
    const clone = this._newScene({
        width: src.width,
        height: src.height,
        name: src.name ? src.name + ' ' + t('copySuffix') : '',
        background: JSON.parse(JSON.stringify(src.background)),
        state: this._snapshotState(src.state, true)
    });
    clone._bgCanvas = src._bgCanvas;
    this.scenes.splice(index + 1, 0, clone);
    this._applyScene(index + 1);
    this._afterSceneChange();
    this.markDirty();
};

FlowAnimator.prototype.deleteScene = function(index) {
    if (this.scenes.length <= 1) {
        this.showTooltip(t('cantDeleteLastScene'));
        return;
    }
    this._captureScene();
    const removed = this.scenes.splice(index, 1)[0];
    this._applyScene(Math.min(index, this.scenes.length - 1));
    this._afterSceneChange();
    this.markDirty();
    Toast.show(t('sceneDeleted'), {
        action: {
            label: t('undo'),
            onClick: () => {
                this._captureScene();
                this.scenes.splice(index, 0, removed);
                this._applyScene(index);
                this._afterSceneChange();
                this.markDirty();
            }
        }
    });
};

FlowAnimator.prototype.moveScene = function(index, dir) {
    const to = index + dir;
    if (to < 0 || to >= this.scenes.length) return;
    this._captureScene();
    const current = this._scene();
    const [s] = this.scenes.splice(index, 1);
    this.scenes.splice(to, 0, s);
    this.currentSceneIndex = this.scenes.indexOf(current);
    this.updateSceneUI();
    this.markDirty();
};

FlowAnimator.prototype.renameScene = function(index, name) {
    const s = this.scenes[index];
    if (!s) return;
    s.name = String(name || '').slice(0, 80);
    this.updateSceneUI();
    this.markDirty();
};

FlowAnimator.prototype._sceneDisplayName = function(scene, index) {
    if (scene.name) return scene.name;
    if (scene.background && scene.background.kind === 'pdf') return t('pageN', { n: scene.background.page });
    return t('sceneN', { n: index + 1 });
};

FlowAnimator.prototype.updateSceneUI = function() {
    const label = document.getElementById('sceneLabel');
    if (!label) return;
    const scene = this._scene();
    const name = scene ? this._sceneDisplayName(scene, this.currentSceneIndex) : '';
    label.textContent = `${this.currentSceneIndex + 1}/${this.scenes.length} · ${name}`;
    document.getElementById('scenePrevBtn').disabled = this.currentSceneIndex <= 0;
    document.getElementById('sceneNextBtn').disabled = this.currentSceneIndex >= this.scenes.length - 1;
    const nameInput = document.getElementById('sceneNameInput');
    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = scene ? (scene.name || '') : '';
        nameInput.placeholder = scene ? this._sceneDisplayName(scene, this.currentSceneIndex) : '';
    }
    const bgField = document.getElementById('sceneBgField');
    if (bgField && scene) {
        bgField.hidden = scene.background.kind !== 'blank';
        document.getElementById('sceneBgColor').value = scene.background.color || '#ffffff';
    }
};

// ─── IDs e lookup ──────────────────────────────────────────────────────────

// Garante um id estável em cada item (objetos criados por código antigo/testes podem vir sem)
FlowAnimator.prototype._ensureIds = function() {
    for (const a of this.actions) if (!a.id) a.id = Util.uid('a');
    for (const c of this.comments) if (!c.id) c.id = Util.uid('c');
    for (const m of this.cameraMoves) if (!m.id) m.id = Util.uid('cam');
    for (const c of this.audioClips) if (!c.id) c.id = Util.uid('au');
    for (const m of this.markers) if (!m.id) m.id = Util.uid('mk');
};

// Tipo de track de um item ('draw' inclui formas e marca-texto)
FlowAnimator.prototype._trackTypeOf = function(kind, obj) {
    if (kind === 'comment') return 'comment';
    if (kind === 'camera') return 'camera';
    if (kind === 'audio') return 'audio';
    if (kind === 'marker') return 'marker';
    if (obj.type === 'erase') return 'erase';
    if (obj.type === 'laser') return 'laser';
    if (obj.type === 'spotlight' || obj.type === 'redact') return 'effect';
    return 'draw';
};

FlowAnimator.prototype._allItems = function() {
    this._ensureIds();
    const out = [];
    for (const a of this.actions) out.push({ kind: 'action', obj: a });
    for (const c of this.comments) out.push({ kind: 'comment', obj: c });
    for (const m of this.cameraMoves) out.push({ kind: 'camera', obj: m });
    for (const c of this.audioClips) out.push({ kind: 'audio', obj: c });
    for (const m of this.markers) out.push({ kind: 'marker', obj: m });
    return out;
};

FlowAnimator.prototype.findItemById = function(id) {
    for (const it of this._allItems()) if (it.obj.id === id) return it;
    return null;
};

// Tempo de início / duração genéricos de um item
FlowAnimator.itemStart = function(kind, obj) {
    if (kind === 'comment' || kind === 'marker') return obj.time || 0;
    return obj.startTime || 0;
};
FlowAnimator.itemDuration = function(kind, obj) {
    if (kind === 'marker') return 0;
    if (kind === 'comment') return obj.duration || 3;
    return obj.duration || 2;
};
FlowAnimator.setItemStart = function(kind, obj, v) {
    if (kind === 'comment' || kind === 'marker') obj.time = Math.max(0, v);
    else obj.startTime = Math.max(0, v);
};

// ─── Seleção ───────────────────────────────────────────────────────────────

FlowAnimator.prototype.setSelection = function(ids, additive) {
    if (!additive) this.selection.clear();
    for (const id of ids) if (id) this.selection.add(id);
    this._onSelectionChanged();
};

FlowAnimator.prototype.toggleSelection = function(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this._onSelectionChanged();
};

FlowAnimator.prototype.clearSelection = function() {
    if (!this.selection.size) return;
    this.selection.clear();
    this._onSelectionChanged();
};

FlowAnimator.prototype.isSelected = function(id) {
    return this.selection.has(id);
};

FlowAnimator.prototype.getSelectedItems = function() {
    if (!this.selection.size) return [];
    return this._allItems().filter((it) => this.selection.has(it.obj.id));
};

FlowAnimator.prototype._onSelectionChanged = function() {
    // Remove ids que não existem mais (ex.: após deleção ou undo)
    if (this.selection.size) {
        const existing = new Set(this._allItems().map((it) => it.obj.id));
        for (const id of Array.from(this.selection)) if (!existing.has(id)) this.selection.delete(id);
    }
    if (!this.isPlaying) this.redrawMainCanvas();
    if (this.timeline) this.timeline.updateSelectionClasses();
    if (this.inspector) this.inspector.refresh();
};

FlowAnimator.prototype.selectAll = function() {
    this.setSelection(this._allItems().filter((it) => it.kind !== 'marker').map((it) => it.obj.id));
};

FlowAnimator.prototype._isItemLocked = function(it) {
    return !!(this.timeline && this.timeline.isTrackLocked(this._trackTypeOf(it.kind, it.obj)));
};

FlowAnimator.prototype._removeItems = function(items) {
    const ids = new Set(items.map((it) => it.obj.id));
    this.actions = this.actions.filter((a) => !ids.has(a.id));
    this.comments = this.comments.filter((c) => !ids.has(c.id));
    this.cameraMoves = this.cameraMoves.filter((m) => !ids.has(m.id));
    this.audioClips = this.audioClips.filter((c) => !ids.has(c.id));
    this.markers = this.markers.filter((m) => !ids.has(m.id));
    for (const id of ids) this.selection.delete(id);
};

// Exclui itens com aviso "Desfazer" (em vez de pedir confirmação a cada exclusão)
FlowAnimator.prototype.deleteItems = function(items) {
    const deletable = items.filter((it) => !this._isItemLocked(it));
    if (!deletable.length) {
        if (items.length) this.showTooltip(t('trackLockedDelete'));
        return false;
    }
    this.saveUndoState();
    this._removeItems(deletable);
    this._afterContentChange();
    Toast.show(deletable.length === 1 ? t('itemDeleted') : t('itemsDeleted', { n: deletable.length }), {
        action: { label: t('undo'), onClick: () => this.undo() }
    });
    return true;
};

FlowAnimator.prototype.deleteSelection = function() {
    return this.deleteItems(this.getSelectedItems());
};

FlowAnimator.prototype._cloneForPaste = function(it, dx, dy, dt) {
    const o = this._cloneItem(it.obj);
    const prefix = { comment: 'c', camera: 'cam', audio: 'au', marker: 'mk' }[it.kind] || 'a';
    o.id = Util.uid(prefix);
    if (it.kind === 'action') {
        if (o.points) o.points = Geometry.translatePoints(o.points, dx, dy);
        if (o.rect) o.rect = { x: o.rect.x + dx, y: o.rect.y + dy, w: o.rect.w, h: o.rect.h };
    } else if (it.kind === 'comment') {
        o.x += dx;
        o.y += dy;
        if (o.pointer) o.pointer = { x: o.pointer.x + dx, y: o.pointer.y + dy };
    } else if (it.kind === 'camera' && o.rect) {
        o.rect = { x: o.rect.x + dx, y: o.rect.y + dy, w: o.rect.w, h: o.rect.h };
    }
    FlowAnimator.setItemStart(it.kind, o, FlowAnimator.itemStart(it.kind, it.obj) + dt);
    return o;
};

FlowAnimator.prototype._insertItems = function(items) {
    const ids = [];
    for (const it of items) {
        if (it.kind === 'action') this.actions.push(it.obj);
        else if (it.kind === 'comment') this.comments.push(it.obj);
        else if (it.kind === 'camera') this.cameraMoves.push(it.obj);
        else if (it.kind === 'audio') this.audioClips.push(it.obj);
        else if (it.kind === 'marker') this.markers.push(it.obj);
        ids.push(it.obj.id);
    }
    return ids;
};

FlowAnimator.prototype.duplicateSelection = function() {
    const items = this.getSelectedItems().filter((it) => it.kind !== 'audio' && it.kind !== 'marker');
    if (!items.length) { this.showTooltip(t('nothingSelected')); return; }
    this.saveUndoState();
    const clones = items.map((it) => ({ kind: it.kind, obj: this._cloneForPaste(it, 24, 24, 0) }));
    const ids = this._insertItems(clones);
    this._afterContentChange();
    this.setSelection(ids);
    this.showTooltip(t('duplicated', { n: ids.length }));
};

FlowAnimator.prototype.copySelection = function() {
    const items = this.getSelectedItems().filter((it) => it.kind !== 'marker');
    if (!items.length) return false;
    const minStart = Math.min(...items.map((it) => FlowAnimator.itemStart(it.kind, it.obj)));
    this.clipboard = { items: items.map((it) => ({ kind: it.kind, obj: this._cloneItem(it.obj) })), minStart };
    this.showTooltip(t('copied', { n: items.length }));
    return true;
};

// Cola deslocado e reposicionado na agulha (mantendo os tempos relativos entre os itens)
FlowAnimator.prototype.pasteClipboard = function() {
    if (!this.clipboard || !this.clipboard.items.length) return false;
    this.saveUndoState();
    const dt = this.currentTime() - this.clipboard.minStart;
    const clones = this.clipboard.items.map((it) => ({ kind: it.kind, obj: this._cloneForPaste(it, 24, 24, dt) }));
    const ids = this._insertItems(clones);
    for (const c of clones) this._ensureDurationCovers(FlowAnimator.itemStart(c.kind, c.obj) + FlowAnimator.itemDuration(c.kind, c.obj));
    this._afterContentChange();
    this.setSelection(ids);
    return true;
};

// Desloca itens no espaço (pontos são REATRIBUÍDOS, nunca mutados in-place — ver saveUndoState)
FlowAnimator.prototype.moveItems = function(items, dx, dy) {
    for (const it of items) {
        const o = it.obj;
        if (it.kind === 'action') {
            if (o.points) o.points = Geometry.translatePoints(o.points, dx, dy);
            if (o.rect) o.rect = { x: o.rect.x + dx, y: o.rect.y + dy, w: o.rect.w, h: o.rect.h };
        } else if (it.kind === 'comment') {
            o.x += dx;
            o.y += dy;
            if (o.pointer) o.pointer = { x: o.pointer.x + dx, y: o.pointer.y + dy };
        } else if (it.kind === 'camera' && o.rect) {
            o.rect = { x: o.rect.x + dx, y: o.rect.y + dy, w: o.rect.w, h: o.rect.h };
        }
    }
};

// Escala um item a partir de `origin` (alça de canto da seleção)
FlowAnimator.prototype.scaleItem = function(it, origin, sx, sy) {
    const o = it.obj;
    const scaleRect = (r) => Geometry.rectFromPoints(
        { x: origin.x + (r.x - origin.x) * sx, y: origin.y + (r.y - origin.y) * sy },
        { x: origin.x + (r.x + r.w - origin.x) * sx, y: origin.y + (r.y + r.h - origin.y) * sy });
    if (it.kind === 'action') {
        if (o.points) o.points = Geometry.scalePoints(o.points, origin, sx, sy);
        if (o.rect) o.rect = scaleRect(o.rect);
    } else if (it.kind === 'comment') {
        const s = Math.max(0.1, Math.sqrt(Math.abs(sx * sy)));
        o.fontSize = Util.clamp(Math.round((o.fontSize || this.commentFontSize) * s), 8, 240);
        o.x = origin.x + (o.x - origin.x) * sx;
        o.y = origin.y + (o.y - origin.y) * sy;
    } else if (it.kind === 'camera' && o.rect) {
        o.rect = scaleRect(o.rect);
    }
};

// Caixa ocupada no canvas (null para itens sem posição, ex.: áudio)
FlowAnimator.prototype.itemBounds = function(it) {
    const o = it.obj;
    if (it.kind === 'comment') {
        const b = this._getCommentBox(o);
        return { x: b.x, y: b.y, w: b.w, h: b.h };
    }
    if (it.kind === 'camera') return o.rect ? Object.assign({}, o.rect) : null;
    if (it.kind !== 'action') return null;
    if (o.rect) return Object.assign({}, o.rect);
    if (!o.points || !o.points.length) return null;
    const b = Geometry.bbox(o.points);
    const pad = (o.type === 'erase' ? (o.size || 20) : (o.width || 3)) / 2;
    return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
};

// ─── Undo / Redo ───────────────────────────────────────────────────────────
// Snapshots copiam cada item (1 nível) mas compartilham os arrays `points` por referência —
// seguro porque `points` nunca é mutado in-place, só reatribuído (moveItems, scaleItem,
// optimizePerformance). Objetos aninhados (rect, pointer) também são sempre reatribuídos.

FlowAnimator.prototype._cloneItem = function(o) {
    const c = Object.assign({}, o);
    if (o.rect) c.rect = Object.assign({}, o.rect);
    if (o.pointer) c.pointer = Object.assign({}, o.pointer);
    delete c._layout;
    delete c._layoutKey;
    return c;
};

FlowAnimator.prototype._snapshotState = function(state, newIds) {
    const clone = (arr, prefix) => (arr || []).map((o) => {
        const c = this._cloneItem(o);
        if (newIds) c.id = Util.uid(prefix);
        return c;
    });
    return {
        actions: clone(state.actions, 'a'),
        comments: clone(state.comments, 'c'),
        cameraMoves: clone(state.cameraMoves, 'cam'),
        audioClips: clone(state.audioClips, 'au'),
        markers: clone(state.markers, 'mk'),
        totalAnimationTime: state.totalAnimationTime
    };
};

FlowAnimator.prototype._liveState = function() {
    return {
        actions: this.actions,
        comments: this.comments,
        cameraMoves: this.cameraMoves,
        audioClips: this.audioClips,
        markers: this.markers,
        totalAnimationTime: this.totalAnimationTime
    };
};

FlowAnimator.prototype._restoreSnapshot = function(snap) {
    this.actions = snap.actions;
    this.comments = snap.comments;
    this.cameraMoves = snap.cameraMoves;
    this.audioClips = snap.audioClips;
    this.markers = snap.markers;
    if (snap.totalAnimationTime) this.setTotalDuration(snap.totalAnimationTime, true);
};

FlowAnimator.UNDO_LIMIT = 100;

FlowAnimator.prototype.saveUndoState = function() {
    this._ensureIds();
    this._undoStack.push(this._snapshotState(this._liveState()));
    if (this._undoStack.length > FlowAnimator.UNDO_LIMIT) this._undoStack.shift();
    this._redoStack.length = 0; // nova ação invalida o redo
    this.markDirty();
};

FlowAnimator.prototype.undo = function() {
    if (this._undoStack.length === 0) { this.showTooltip(t('nothingToUndo')); return; }
    this._redoStack.push(this._snapshotState(this._liveState()));
    this._restoreSnapshot(this._undoStack.pop());
    this._afterContentChange();
    this.showTooltip(t('undone'));
};

FlowAnimator.prototype.redo = function() {
    if (this._redoStack.length === 0) { this.showTooltip(t('nothingToRedo')); return; }
    this._undoStack.push(this._snapshotState(this._liveState()));
    this._restoreSnapshot(this._redoStack.pop());
    this._afterContentChange();
    this.showTooltip(t('redone'));
};

// Chokepoint após qualquer mutação de conteúdo da cena
FlowAnimator.prototype._afterContentChange = function() {
    this.rebuildDrawingCanvas();
    if (this.isPlaying) this.renderAnimationFrame();
    else this.redrawMainCanvas();
    this.timeline.refresh();
    this.updateInfo();
    const scene = this._scene();
    if (scene) scene._thumb = null;
    this._onSelectionChanged();
    this._updateEmptyState();
    this.markDirty();
};

// ─── Tempo / informações ───────────────────────────────────────────────────

FlowAnimator.prototype.currentTime = function() {
    return this.animationProgress * this.totalAnimationTime;
};

FlowAnimator.prototype.formatTime = function(seconds) {
    return Util.formatTime(seconds);
};

FlowAnimator.prototype.updateTimeDisplay = function() {
    const el = document.getElementById('timeDisplay');
    if (el) el.textContent = `${Util.formatTimePrecise(this.currentTime())} / ${Util.formatTimePrecise(this.totalAnimationTime)}`;
    this.updateCurrentTimeDisplay();
};

// O campo "Aparece em" do comentário acompanha a agulha até o usuário digitar outro valor
FlowAnimator.prototype.updateCurrentTimeDisplay = function() {
    const field = document.getElementById('commentTime');
    if (field && !this._commentTimeManual && document.activeElement !== field) {
        field.value = String(Math.round(this.currentTime() * 10) / 10);
    }
};

FlowAnimator.prototype.updateInfo = function() {
    let drawCount = 0, eraseCount = 0;
    for (const a of this.actions) {
        if (a.type === 'draw') drawCount++;
        else if (a.type === 'erase') eraseCount++;
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('drawCount', drawCount);
    set('eraseCount', eraseCount);
    set('commentCount', this.comments.length);
    set('realDuration', Util.num(this._lastContentEnd(), 1) + 's');
};

// ─── Reprodução ────────────────────────────────────────────────────────────
// play() retorna uma Promise que resolve quando a reprodução para (fim natural, pause ou
// reset). Novos jeitos de parar a reprodução precisam chamar _resolvePlaybackEnd().

FlowAnimator.prototype._hasContent = function() {
    return this.actions.length > 0 || this.comments.length > 0 || this.cameraMoves.length > 0 || this.audioClips.length > 0;
};

FlowAnimator.prototype.play = function() {
    if (!this._hasContent()) {
        this.showTooltip(t('addActionsFirst'));
        return Promise.resolve();
    }

    // Já tocando: reutiliza a Promise em andamento — sobrescrever _onPlaybackEnd deixaria a
    // Promise anterior (que o export pode estar aguardando) pendurada para sempre.
    if (this.isPlaying && this._playbackPromise) {
        return this._playbackPromise;
    }
    if (this.animationProgress >= 1) this.animationProgress = 0;

    this.isPlaying = true;
    this.animationStartTime = performance.now() - (this.animationProgress * this.totalAnimationTime * 1000 / this.animationSpeed);
    this._startAudio();
    this._updatePlayButton();
    this._playbackPromise = new Promise((resolve) => {
        this._onPlaybackEnd = resolve;
        this.animate();
    });
    return this._playbackPromise;
};

FlowAnimator.prototype._resolvePlaybackEnd = function() {
    if (this._onPlaybackEnd) {
        const resolve = this._onPlaybackEnd;
        this._onPlaybackEnd = null;
        this._playbackPromise = null;
        resolve();
    }
};

FlowAnimator.prototype.pause = function() {
    this.isPlaying = false;
    this.audio.stop();
    this._updatePlayButton();
    this._resolvePlaybackEnd();
    this.redrawOverlaysAtPlayhead();
};

FlowAnimator.prototype.reset = function() {
    this.isPlaying = false;
    this.audio.stop();
    this.animationProgress = 0;
    this.renderAnimationFrame();
    this.timeline.updatePlayhead();
    this.updateTimeDisplay();
    this._updatePlayButton();
    this._resolvePlaybackEnd();
};

FlowAnimator.prototype.togglePlay = function() {
    if (this.isPlaying) this.pause();
    else this.play();
};

FlowAnimator.prototype._updatePlayButton = function() {
    const btn = document.getElementById('timelinePlayBtn');
    if (!btn) return;
    const use = btn.querySelector('use');
    if (use) use.setAttribute('href', this.isPlaying ? '#i-pause' : '#i-play');
};

FlowAnimator.prototype._startAudio = function() {
    if (!this.audioClips.length || !this._isTypeVisible('audio') || this._narration) return;
    this.audio.play(this.audioClips, this.currentTime(), this.animationSpeed, (id) => this._audioBuffers.get(id) || null);
};

FlowAnimator.prototype.animate = function() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = (now - this.animationStartTime) * this.animationSpeed / 1000;
    this.animationProgress = elapsed / this.totalAnimationTime;

    if (this.animationProgress >= 1) {
        this.animationProgress = 1;
        this.isPlaying = false;
        this.audio.stop();
        this._updatePlayButton();
    }

    this.renderAnimationFrame();
    this.timeline.updatePlayhead();
    this.updateTimeDisplay();

    if (this.isPlaying) {
        requestAnimationFrame(() => this.animate());
    } else {
        this._resolvePlaybackEnd();
    }
};

// Posiciona a agulha (funciona também durante a reprodução, reiniciando o áudio)
FlowAnimator.prototype.seekTo = function(seconds, options) {
    const s = Util.clamp(seconds, 0, this.totalAnimationTime);
    this.animationProgress = this.totalAnimationTime > 0 ? s / this.totalAnimationTime : 0;
    if (this.isPlaying) {
        this.animationStartTime = performance.now() - (s * 1000 / this.animationSpeed);
        this._startAudio();
    }
    this.renderAnimationFrame();
    this.timeline.updatePlayhead(options && options.noAutoScroll);
    this.updateTimeDisplay();
};

FlowAnimator.prototype.stepTime = function(delta) {
    this.seekTo(this.currentTime() + delta);
};

// Muda a velocidade preservando o progresso atual — sem recalcular animationStartTime, mudar
// a velocidade durante o playback reescalaria todo o tempo já decorrido e o playhead saltaria.
FlowAnimator.prototype.setSpeed = function(speed) {
    const v = parseFloat(speed);
    if (!isFinite(v) || v <= 0) return;
    if (this.isPlaying) {
        this.animationStartTime = performance.now() - (this.animationProgress * this.totalAnimationTime * 1000 / v);
    }
    this.animationSpeed = v;
    if (this.isPlaying) this._startAudio();
};

// ─── Modo de gravação ──────────────────────────────────────────────────────

// Tempo (s) em que o último conteúdo termina. Ponto de partida do cursor de gravação.
FlowAnimator.prototype._lastContentEnd = function() {
    let end = 0;
    for (const a of this.actions) end = Math.max(end, (a.startTime || 0) + (a.duration || 0));
    for (const c of this.comments) end = Math.max(end, (c.time || 0) + (c.duration || 0));
    for (const m of this.cameraMoves) end = Math.max(end, (m.startTime || 0) + (m.duration || 0));
    for (const c of this.audioClips) end = Math.max(end, (c.startTime || 0) + (c.duration || 0));
    return end;
};

// Onde o próximo traço gravado deve começar: logo após o conteúdo existente, mas nunca antes
// do piso escolhido ao entrar no modo (_recordFloor). DERIVADO do conteúdo real em vez de um
// contador que só cresce — undo/redo, deleção e "limpar" reposicionam o início sozinhos.
FlowAnimator.prototype._nextRecordStart = function() {
    return Math.max(this._lastContentEnd(), this._recordFloor || 0);
};

// Posiciona a agulha sem re-renderizar o canvas (só playhead + displays de tempo)
FlowAnimator.prototype._seekNeedle = function(seconds) {
    const clamped = Math.max(0, Math.min(seconds, this.totalAnimationTime));
    this.animationProgress = this.totalAnimationTime > 0 ? clamped / this.totalAnimationTime : 0;
    this.timeline.updatePlayhead();
    this.updateTimeDisplay();
};

// Relógio de gravação (rAF): a agulha corre em tempo real enquanto um traço está sendo
// desenhado (modo sequencial) ou continuamente (modo com narração). Só move o playhead —
// nunca re-renderiza o canvas —, então convive com o desenho ao vivo.
FlowAnimator.prototype._startRecordClock = function(baseSeconds) {
    this._recordBase = baseSeconds;
    this._recordClockRef = performance.now();
    if (this._recordRAF) cancelAnimationFrame(this._recordRAF);

    const tick = () => {
        this._recordRAF = null;
        if (!this.timelineMode || this.isPlaying) return;
        // Sequencial: para quando ocioso (fora de um traço/gesto de criação)
        if (!this._recordContinuous && !this.isDrawing && !this._gestureActive) return;
        const now = this._recordNow();
        if (this._recordContinuous && now > this.totalAnimationTime - 0.5) this.setTotalDuration(Math.ceil(now + 5), true);
        this._seekNeedle(now);
        this._updateRecPill(now);
        this._recordRAF = requestAnimationFrame(tick);
    };
    this._recordRAF = requestAnimationFrame(tick);
};

FlowAnimator.prototype._recordNow = function() {
    return this._recordBase + (performance.now() - this._recordClockRef) / 1000;
};

FlowAnimator.prototype._stopRecordClock = function() {
    if (this._recordRAF) cancelAnimationFrame(this._recordRAF);
    this._recordRAF = null;
};

// Em modo gravação sequencial e ocioso, a agulha marca onde o PRÓXIMO traço vai começar.
// Chamado de rebuildDrawingCanvas() (chokepoint de toda mutação).
FlowAnimator.prototype._syncRecordNeedle = function() {
    if (this.timelineMode && !this._recordContinuous && !this.isDrawing && !this._gestureActive && !this.isPlaying) {
        this._recordCursor = this._nextRecordStart();
        this._seekNeedle(this._recordCursor);
    }
};

// Início/duração de um item recém-criado, conforme o modo:
//  - gravação sequencial: logo após o conteúdo, com o tempo real de desenho;
//  - gravação contínua (narração): no instante real em que o gesto começou;
//  - normal: na agulha, com a duração-padrão do tipo.
FlowAnimator.prototype._timingForNew = function(realSeconds, kind) {
    if (this.timelineMode && this._recordContinuous) {
        const start = this._gestureRecordStart != null ? this._gestureRecordStart : this._recordNow();
        return { startTime: start, duration: Math.max(0.3, realSeconds) };
    }
    if (this.timelineMode) {
        return { startTime: this._nextRecordStart(), duration: Math.max(0.5, Math.min(realSeconds, 15)) };
    }
    const defaults = {
        stroke: Util.clamp(realSeconds * 0.5, 0.5, 10),
        laser: Util.clamp(realSeconds, 0.5, 30),
        shape: 1,
        spotlight: 3,
        camera: 1.5
    };
    return { startTime: this.currentTime(), duration: defaults[kind] != null ? defaults[kind] : 1 };
};

// Após inserir um item gravado: avança o cursor, estende a duração e reancora a agulha
FlowAnimator.prototype._commitTiming = function(start, duration) {
    const end = start + duration;
    this._ensureDurationCovers(end);
    if (this.timelineMode && !this._recordContinuous) {
        this._recordCursor = end;
        this._stopRecordClock();
        this._seekNeedle(this._recordCursor);
    }
};

// Modo Timeline = modo de GRAVAÇÃO. Sequencial (padrão): cada traço entra logo após o
// anterior — pausas para pensar não viram espaço vazio. Contínuo (com narração): relógio em
// tempo real, microfone gravando, e cada traço entra no instante em que foi feito.
// Novos jeitos de sair do modo precisam chamar exitTimelineMode() (para o rAF do relógio).
FlowAnimator.prototype.enterTimelineMode = function(options) {
    const opts = options || {};
    if (this.isPlaying) this.pause();
    this.timelineMode = true;
    this._recordContinuous = !!opts.continuous;
    document.body.classList.add('timeline-mode');

    // Piso = SÓ o offset do playhead escolhido. O fim do conteúdo entra dinamicamente via
    // _lastContentEnd() dentro de _nextRecordStart() (limpar/deletar não deixa piso obsoleto).
    this._recordFloor = this.animationProgress * this.totalAnimationTime;
    this._recordCursor = this._nextRecordStart();
    this._seekNeedle(this._recordCursor);

    if (this._recordContinuous) {
        this._recordSessionStart = this._recordCursor;
        this._startRecordClock(this._recordCursor);
    }
    this._updateRecordUI();
};

FlowAnimator.prototype.exitTimelineMode = function() {
    const wasContinuous = this._recordContinuous;
    const endTime = wasContinuous ? this._recordNow() : null;
    this.timelineMode = false;
    this._recordContinuous = false;
    this._stopRecordClock();
    document.body.classList.remove('timeline-mode');
    if (wasContinuous) this._ensureDurationCovers(endTime);
    this._updateRecordUI();
    if (this._micSession) this._finishMicSession();
};

// Botão "● Gravar" (com o microfone ligado, faz contagem 3-2-1 e grava a narração junto)
FlowAnimator.prototype.toggleRecording = async function() {
    if (this.timelineMode) {
        this.exitTimelineMode();
        return;
    }
    if (this.narrationEnabled) {
        let session;
        try {
            session = await this.audio.startMicRecording();
        } catch (e) {
            this.handleError(t('micError'), e);
            Toast.show(t('micError') + ': ' + (e.message || e), { kind: 'error' });
            return;
        }
        await this._countdown();
        this._micSession = session;
        this.enterTimelineMode({ continuous: true });
        session.timelineStart = this._recordSessionStart;
    } else {
        this.enterTimelineMode();
        Toast.show(t('recordStarted'));
    }
};

FlowAnimator.prototype._countdown = function() {
    return new Promise((resolve) => {
        const el = document.createElement('div');
        el.className = 'rec-pill';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);font-size:40px;height:auto;padding:16px 28px;border-radius:40px;z-index:9000';
        document.body.appendChild(el);
        let n = 3;
        const step = () => {
            if (n === 0) { el.remove(); resolve(); return; }
            el.textContent = String(n--);
            setTimeout(step, 700);
        };
        step();
    });
};

FlowAnimator.prototype._finishMicSession = async function() {
    const session = this._micSession;
    this._micSession = null;
    if (!session) return;
    const result = await session.stop();
    await this._addRecordedAudio(result, session.timelineStart || 0, t('narration'));
};

FlowAnimator.prototype._updateRecordUI = function() {
    const btn = document.getElementById('recordBtn');
    if (btn) {
        btn.classList.toggle('recording', this.timelineMode);
        const label = btn.querySelector('.btn-label');
        if (label) label.textContent = this.timelineMode ? t('stopRecording') : t('record');
    }
    const pill = document.getElementById('recPill');
    if (pill) {
        pill.hidden = !this.timelineMode;
        this._updateRecPill(this.currentTime());
    }
};

FlowAnimator.prototype._updateRecPill = function(seconds) {
    const pill = document.getElementById('recPill');
    if (pill && !pill.hidden) pill.textContent = `${this._recordContinuous ? 'REC' : t('recSequential')} ${Util.formatTime(seconds)}`;
};

// Narrar (voice-over): reproduz a cena a partir da agulha e grava o microfone por cima
FlowAnimator.prototype.toggleNarration = async function() {
    if (this._narration) {
        this.pause();
        return;
    }
    if (!this._hasContent()) { this.showTooltip(t('addActionsFirst')); return; }
    let session;
    try {
        session = await this.audio.startMicRecording();
    } catch (e) {
        this.handleError(t('micError'), e);
        Toast.show(t('micError') + ': ' + (e.message || e), { kind: 'error' });
        return;
    }
    if (this.animationProgress >= 1) this.animationProgress = 0;
    const startTime = this.currentTime();
    this._narration = session;
    const btn = document.getElementById('narrateBtn');
    if (btn) btn.classList.add('active');
    Toast.show(t('narrationStarted'));
    await this.play();
    this._narration = null;
    if (btn) btn.classList.remove('active');
    const result = await session.stop();
    await this._addRecordedAudio(result, startTime, t('narration'));
};

// ─── Marcadores ────────────────────────────────────────────────────────────

FlowAnimator.prototype.addMarker = function(time, label) {
    this.saveUndoState();
    const m = {
        id: Util.uid('mk'),
        time: time != null ? time : this.currentTime(),
        label: label || t('markerN', { n: this.markers.length + 1 })
    };
    this.markers.push(m);
    this.markers.sort((a, b) => a.time - b.time);
    this._afterContentChange();
    this.showTooltip(t('markerAdded', { t: Util.num(m.time, 1) }));
    return m;
};

FlowAnimator.prototype.renameMarker = async function(id) {
    const m = this.markers.find((x) => x.id === id);
    if (!m) return;
    const name = await showPromptModal(t('markerRename'), m.label);
    if (name == null) return;
    this.saveUndoState();
    m.label = String(name).slice(0, 60);
    this._afterContentChange();
};

// ─── Duração ───────────────────────────────────────────────────────────────

FlowAnimator.prototype.setTotalDuration = function(seconds, silent) {
    const v = Util.clamp(Math.round(seconds * 10) / 10, 0.1, 3600);
    const prevTime = this.currentTime();
    this.totalAnimationTime = v;
    this.animationProgress = Util.clamp(prevTime / v, 0, 1);
    const input = document.getElementById('totalDuration');
    if (input && document.activeElement !== input) input.value = v;
    if (!this.timeline) return;
    if (!silent) {
        this.timeline.refresh();
        this.updateTimeDisplay();
        this.markDirty();
    } else {
        this.timeline.renderRuler();
        this.timeline.updatePlayhead();
    }
};

// Estende a duração total se o conteúdo passar do fim (com folga de 1s)
FlowAnimator.prototype._ensureDurationCovers = function(end) {
    if (end > this.totalAnimationTime) {
        this.setTotalDuration(Math.ceil(end + 1));
        return true;
    }
    return false;
};

FlowAnimator.prototype.fitDurationToContent = function() {
    const end = this._lastContentEnd();
    if (end <= 0) { this.showTooltip(t('addActionsFirst')); return; }
    this.saveUndoState();
    this.setTotalDuration(Math.max(1, Math.ceil((end + 0.5) * 2) / 2));
    this.showTooltip(t('durationFitted', { s: Util.num(this.totalAnimationTime, 1) }));
};

// ─── Limpar ────────────────────────────────────────────────────────────────

FlowAnimator.prototype.clear = async function() {
    const hadContent = this._hasContent() || this.markers.length > 0;
    if (hadContent) {
        if (!(await showConfirm(t('confirmClear')))) return;
        // Snapshot ANTES de limpar: "Limpar" é desfazível com Ctrl+Z
        this.saveUndoState();
    }

    this.actions = [];
    this.comments = [];
    this.cameraMoves = [];
    this.audioClips = [];
    this.markers = [];
    this.currentPath = [];
    this.isPlaying = false;
    this.audio.stop();
    this.animationProgress = 0;
    this._resolvePlaybackEnd();

    this._afterContentChange();
    this.updateTimeDisplay();
    if (hadContent) {
        Toast.show(t('cleared'), { action: { label: t('undo'), onClick: () => this.undo() } });
    }
};

// ─── Ferramentas ───────────────────────────────────────────────────────────

FlowAnimator.TOOL_KEYS = {
    v: 'select', g: 'pan', d: 'draw', p: 'draw', h: 'highlighter', e: 'erase', a: 'arrow', r: 'rect',
    o: 'ellipse', c: 'comment', t: 'comment', n: 'badge', z: 'laser', s: 'spotlight', x: 'redact', f: 'camera'
};

FlowAnimator.prototype.setMode = function(mode) {
    if (this.mode === 'crop' && mode !== 'crop') this.exitCropMode(true);
    const changed = this.mode !== mode;
    this.mode = mode;
    document.querySelectorAll('.mode-btn').forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.updateCursor();
    this.updateStraightLineIndicator();
    this._syncQuickColor();
    this.hideCursorPreview();
    if (changed && this.timeline) this.timeline.refresh();
    if (this.inspector) this.inspector.refresh();
};

// Escala das ferramentas para cenas grandes: espessuras e fontes são definidas para uma cena
// de referência de 1920px; numa página de PDF de 2400px elas crescem na mesma proporção
// (senão traços de 3px ficam finos demais ao ver a página inteira).
FlowAnimator.prototype._toolScale = function() {
    return Math.max(1, Math.max(this.canvas.width, this.canvas.height) / 1920);
};

// Cor da ferramenta atual (botão de cor rápida da barra)
FlowAnimator.prototype._toolColorKey = function() {
    switch (this.mode) {
        case 'highlighter': return 'highlightColor';
        case 'comment': return 'commentBorderColor';
        case 'badge': return 'badgeColor';
        case 'laser': return 'laserColor';
        default: return 'flowColor';
    }
};

FlowAnimator.prototype._syncQuickColor = function() {
    const q = document.getElementById('quickColor');
    if (q) q.value = this[this._toolColorKey()] || '#4a90e2';
};

// ─── Comentários ───────────────────────────────────────────────────────────

FlowAnimator.prototype._newComment = function(x, y, text, time, duration) {
    const c = {
        id: Util.uid('c'),
        x,
        y,
        text,
        time,
        duration,
        textColor: this.commentTextColor,
        bgColor: this.commentBgColor,
        borderColor: this.commentBorderColor,
        fontFamily: this.commentFontFamily,
        fontSize: Math.round(this.commentFontSize * this._toolScale()),
        opacity: this.commentOpacity,
        animIn: this.commentAnimIn,
        animOut: this.commentAnimOut
    };
    if (this.commentBalloon) c.pointer = { x: x + 140 * this._toolScale(), y: y + 110 * this._toolScale() };
    return c;
};

FlowAnimator.prototype._commentTiming = function() {
    const field = parseFloat(document.getElementById('commentTime').value);
    const duration = Util.clamp(parseFloat(document.getElementById('commentDuration').value) || 3, 0.2, 600);
    if (this.timelineMode) {
        const tm = this._timingForNew(duration, 'comment');
        return { time: tm.startTime, duration };
    }
    return { time: isFinite(field) && field >= 0 ? field : this.currentTime(), duration };
};

// Cria um comentário na posição (coordenadas do canvas)
FlowAnimator.prototype.placeComment = function(pos, text) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const { time, duration } = this._commentTiming();
    this.saveUndoState();
    const c = this._newComment(pos.x, pos.y, clean, time, duration);
    this.comments.push(c);
    this._commitTiming(time, duration);
    this._commentTimeManual = false;
    this._afterContentChange();
    this.showTooltip(t('commentPlaced', { t: Util.num(time, 1) }));
    return c;
};

FlowAnimator.prototype.nextBadgeNumber = function() {
    let max = 0;
    for (const c of this.comments) if (c.kind === 'badge') max = Math.max(max, parseInt(c.text, 10) || 0);
    return max + 1;
};

FlowAnimator.prototype.placeBadge = function(pos) {
    const input = document.getElementById('badgeNext');
    let n = parseInt(input && input.value, 10);
    if (!isFinite(n)) n = this.nextBadgeNumber();
    this.saveUndoState();
    const time = this.timelineMode ? this._timingForNew(1, 'badge').startTime : this.currentTime();
    const c = {
        id: Util.uid('c'),
        kind: 'badge',
        x: pos.x,
        y: pos.y,
        text: String(n),
        time,
        duration: Math.max(1, this.totalAnimationTime - time),
        textColor: '#ffffff',
        bgColor: this.badgeColor,
        borderColor: '#ffffff',
        fontFamily: 'Arial',
        fontSize: Math.max(18, Math.round(this.canvas.width / 70)),
        opacity: 1,
        animIn: 'pop',
        animOut: 'none'
    };
    this.comments.push(c);
    if (this.timelineMode) this._commitTiming(time, 1);
    if (input) input.value = n + 1;
    this._afterContentChange();
    return c;
};

FlowAnimator.prototype.startCommentPositioning = function() {
    const text = document.getElementById('commentText').value.trim();
    if (!text) {
        this.showTooltip(t('typeCommentFirst'));
        document.getElementById('commentText').focus();
        return;
    }
    if (this.isPositioningComment) return;
    this.isPositioningComment = true;
    this.canvas.classList.add('comment-positioning');
    this.commentPreview.textContent = text;
    this.commentPreview.style.display = 'block';
    this.commentPreview.style.left = '-9999px';
    if (!this.commentPreview.parentNode) document.body.appendChild(this.commentPreview);
    Toast.show(t('positionCommentHelp'));
};

FlowAnimator.prototype.exitCommentPositioning = function() {
    this.isPositioningComment = false;
    this.canvas.classList.remove('comment-positioning');
    this.commentPreview.style.display = 'none';
    if (this.commentPreview.parentNode) this.commentPreview.parentNode.removeChild(this.commentPreview);
};

// Layout do texto: respeita quebras de linha (Enter) e quebra automaticamente linhas mais
// largas que maxWidth. Cacheado por (texto, fonte, tamanho) — getCommentAt roda a cada
// pointermove e measureText por comentário é caro.
FlowAnimator.COMMENT_MAX_WIDTH = 480;
FlowAnimator.COMMENT_PADDING = 12;

FlowAnimator.prototype._getCommentLayout = function(comment) {
    const fontFamily = comment.fontFamily || this.commentFontFamily;
    const fontSize = comment.fontSize || this.commentFontSize;
    const bold = comment.kind === 'badge' ? 'bold ' : '';
    const text = String(comment.text == null ? '' : comment.text);
    const maxW = comment.maxWidth || FlowAnimator.COMMENT_MAX_WIDTH * Math.max(1, fontSize / 24);
    const key = `${text}|${fontFamily}|${fontSize}|${bold}|${maxW}`;
    if (comment._layoutKey !== key) {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = `${bold}${fontSize}px ${fontFamily}`;
        const lines = [];
        for (const para of text.split(/\r?\n/)) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const candidate = line ? line + ' ' + word : word;
                if (line && ctx.measureText(candidate).width > maxW) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            lines.push(line);
        }
        let width = 0;
        for (const l of lines) width = Math.max(width, ctx.measureText(l).width);
        ctx.restore();
        comment._layout = { lines, width, lineHeight: Math.round(fontSize * 1.3) };
        comment._layoutKey = key;
    }
    return comment._layout;
};

// Caixa (centrada em x,y) ocupada pelo comentário no canvas
FlowAnimator.prototype._getCommentBox = function(comment) {
    const layout = this._getCommentLayout(comment);
    const fontSize = comment.fontSize || this.commentFontSize;
    if (comment.kind === 'badge') {
        const d = Math.max(layout.width + fontSize * 0.9, fontSize * 1.9);
        return { x: comment.x - d / 2, y: comment.y - d / 2, w: d, h: d, layout };
    }
    const pad = FlowAnimator.COMMENT_PADDING * Math.max(0.75, fontSize / 24);
    const w = layout.width + pad * 2;
    const h = layout.lines.length * layout.lineHeight + pad * 1.6;
    return { x: comment.x - w / 2, y: comment.y - h / 2, w, h, layout };
};

FlowAnimator.prototype.getCommentAt = function(x, y) {
    if (!this._isTypeVisible('comment')) return null;
    for (let i = this.comments.length - 1; i >= 0; i--) {
        const c = this.comments[i];
        const b = this._getCommentBox(c);
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return c;
    }
    return null;
};

// ─── Erros / avisos ────────────────────────────────────────────────────────

FlowAnimator.prototype.handleError = function(context, error) {
    this.lastError = { context, error, timestamp: new Date() };
    this.errorCount++;
    console.error(`[FlowAnimator] ${context}:`, error);
};

FlowAnimator.prototype.showTooltip = function(message) {
    Toast.show(message);
};

FlowAnimator.prototype.hexToRgba = function(hex, alpha) {
    return Util.hexToRgba(hex, alpha);
};

// Simplifica traços muito longos (Ramer–Douglas–Peucker, preservando forma e tempo).
// Reatribui `points` — nunca muta in-place (ver saveUndoState).
FlowAnimator.prototype.optimizePerformance = function() {
    if (this.isPlaying || this.isDrawing || this.isExporting) return;
    let changed = false;
    for (const action of this.actions) {
        if (action.points && action.points.length > 1500 && !action.shape) {
            action.points = Geometry.simplify(action.points, 0.6);
            changed = true;
        }
    }
    if (changed) this.invalidateRenderCaches();
};
