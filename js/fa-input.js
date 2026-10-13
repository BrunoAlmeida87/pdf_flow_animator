// Entrada do FlowAnimator: Pointer Events (mouse, caneta, toque), ferramentas, seleção,
// zoom/pan, região de gravação (crop), teclado, arrastar-e-soltar e colar.
//
// Pointer Events com setPointerCapture: soltar o botão fora do canvas sempre finaliza o gesto
// (antes, com mouseup só no canvas, o traço ficava "preso"). Caneta: usa pressure e
// getCoalescedEvents() (todos os pontos do movimento, traço mais fiel). Depois que uma caneta
// é usada, o toque passa a só mover/dar zoom (rejeição da palma da mão).

FlowAnimator.DRAW_MODES = ['draw', 'highlighter', 'erase'];
FlowAnimator.SHAPE_MODES = ['arrow', 'rect', 'ellipse'];
FlowAnimator.RECT_MODES = ['spotlight', 'redact', 'camera', 'crop'];

FlowAnimator.prototype.bindEvents = function() {
    this._pointers = new Map();
    this._gesture = null;
    this._penSeen = false;
    this._bindCanvasPointer();
    this._bindViewportWheel();
    this._bindKeyboard();
    this._bindDropAndPaste();
    this._bindTimelineResize();

    window.addEventListener('blur', () => {
        this.isAltPressed = false;
        this.isShiftPressed = false;
        this.updateStraightLineIndicator();
        // Trocar de janela no meio do gesto não dispara pointerup — finaliza aqui
        if (this._gesture || this.isDrawing) this._finishGesture(null);
    });
};

// Coordenadas do canvas a partir de um evento (funciona com zoom/pan via CSS)
FlowAnimator.prototype.getMousePos = function(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
};

FlowAnimator.prototype._pressureOf = function(e) {
    if (e.pointerType === 'mouse' || !e.pressure) return 0.5;
    return Math.round(e.pressure * 100) / 100;
};

FlowAnimator.prototype._isOverCanvas = function(e) {
    const r = this.canvas.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
};

FlowAnimator.prototype._scheduleLiveRedraw = function() {
    if (this._liveRedrawPending) return;
    this._liveRedrawPending = true;
    requestAnimationFrame(() => {
        this._liveRedrawPending = false;
        if (this.isDrawing && (this.mode === 'draw' || this.mode === 'highlighter')) this.redrawWithCurrentPath();
        else this.redrawMainCanvas();
    });
};

FlowAnimator.prototype._bindCanvasPointer = function() {
    const vp = document.getElementById('canvasViewport');
    this._viewport = vp;

    vp.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    vp.addEventListener('pointermove', (e) => this._onPointerMove(e));
    vp.addEventListener('pointerup', (e) => this._onPointerUp(e));
    vp.addEventListener('pointercancel', (e) => this._onPointerUp(e, true));
    vp.addEventListener('pointerleave', () => this.hideCursorPreview());
    vp.addEventListener('pointerenter', () => this.showCursorPreview());
    vp.addEventListener('contextmenu', (e) => { if (this._gesture) e.preventDefault(); });
    // Clique do meio = mover a visão (sem o autoscroll nativo do Windows)
    vp.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
};

FlowAnimator.prototype._onPointerDown = function(e) {
    if (e.target.closest('.empty-card, .inline-editor')) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'pen') this._penSeen = true;

    // Dois dedos: pinça (zoom + pan). Descarta um traço que o primeiro dedo tenha começado.
    const touches = Array.from(this._pointers.values()).filter((p) => p.type === 'touch');
    if (e.pointerType === 'touch' && touches.length >= 2) {
        if (this._gesture && this._gesture.kind !== 'pinch') this._cancelGesture();
        this._startPinch();
        return;
    }
    if (this._gesture) return;

    const panRequested = e.button === 1 || this.mode === 'pan' || this._spaceHeld ||
        (e.pointerType === 'touch' && this._penSeen);
    if (panRequested) {
        e.preventDefault();
        this._beginPan(e);
        return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.isPlaying) this.pause();

    const pos = this.getMousePos(e);

    // Posicionamento de comentário: o clique só posiciona (sem ação-fantasma de desenho)
    if (this.isPositioningComment) {
        e.preventDefault();
        const text = document.getElementById('commentText').value;
        this.exitCommentPositioning();
        if (this.placeComment(pos, text)) document.getElementById('commentText').value = '';
        return;
    }

    try { this._viewport.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }

    if (this.mode === 'select') {
        e.preventDefault();
        this._selectPointerDown(e, pos);
        return;
    }

    if (!this._isOverCanvas(e)) return;
    e.preventDefault();

    // Comentários são arrastáveis em qualquer ferramenta de criação
    if (this.mode !== 'comment' && this.mode !== 'crop' && this.mode !== 'camera') {
        const c = this.getCommentAt(pos.x, pos.y);
        if (c && !this.timeline.isTrackLocked('comment')) {
            this._gesture = { kind: 'comment-drag', comment: c, offset: { x: pos.x - c.x, y: pos.y - c.y }, snapshotPending: true };
            this.selectedComment = c;
            this.isDraggingComment = true;
            this.canvas.style.cursor = 'grabbing';
            return;
        }
    }

    if (FlowAnimator.DRAW_MODES.includes(this.mode)) {
        this._gesture = { kind: 'draw' };
        this.startDrawing(e);
    } else if (FlowAnimator.SHAPE_MODES.includes(this.mode)) {
        this._beginTimedGesture();
        this._gesture = { kind: 'shape', p0: pos, p1: pos, startedAt: performance.now() };
    } else if (FlowAnimator.RECT_MODES.includes(this.mode)) {
        this._beginTimedGesture();
        this._gesture = { kind: 'rect', p0: pos, startedAt: performance.now() };
    } else if (this.mode === 'laser') {
        this._beginTimedGesture();
        this._gesture = { kind: 'laser', points: [{ x: pos.x, y: pos.y, t: 0 }], ts0: e.timeStamp, startedAt: performance.now() };
    } else if (this.mode === 'comment') {
        const c = this.getCommentAt(pos.x, pos.y);
        if (c) {
            this.setSelection([c.id]);
            this.setMode('select');
            return;
        }
        // Editor de texto aberto: este clique só confirma o texto (não abre outro editor)
        if (this._inlineEditor) { this._closeInlineEditor(true); return; }
        const text = document.getElementById('commentText').value;
        if (text.trim()) {
            if (this.placeComment(pos, text)) document.getElementById('commentText').value = '';
        } else {
            this._openInlineEditor(pos, e.clientX, e.clientY);
        }
    } else if (this.mode === 'badge') {
        this.placeBadge(pos);
    }
};

// No modo gravação sequencial, o relógio corre durante qualquer gesto de criação
FlowAnimator.prototype._beginTimedGesture = function() {
    this._gestureActive = true;
    if (!this.timelineMode) return;
    if (this._recordContinuous) {
        this._gestureRecordStart = this._recordNow();
    } else {
        this._recordCursor = this._nextRecordStart();
        this._startRecordClock(this._recordCursor);
        this._seekNeedle(this._recordCursor);
    }
};

FlowAnimator.prototype._onPointerMove = function(e) {
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const g = this._gesture;

    if (this.isPositioningComment) {
        this.commentPreview.style.left = (e.clientX + 12) + 'px';
        this.commentPreview.style.top = (e.clientY - 12) + 'px';
        return;
    }

    if (!g) {
        this._updateHoverCursor(e);
        this.updateCursorPreview(e);
        return;
    }

    if (g.kind === 'pinch') { this._updatePinch(); return; }
    if (g.kind === 'pan') {
        this.panX = g.panX + (e.clientX - g.x);
        this.panY = g.panY + (e.clientY - g.y);
        this.updateCanvasDisplay();
        return;
    }

    const pos = this.getMousePos(e);
    this.updateCursorPreview(e);

    switch (g.kind) {
        case 'draw':
            this.draw(e);
            break;
        case 'comment-drag': {
            if (g.snapshotPending) { g.snapshotPending = false; this.saveUndoState(); }
            g.comment.x = pos.x - g.offset.x;
            g.comment.y = pos.y - g.offset.y;
            g.moved = true;
            this._scheduleLiveRedraw();
            break;
        }
        case 'shape': {
            let p1 = pos;
            if (e.shiftKey) {
                if (this.mode === 'arrow') p1 = this.snapAngle(g.p0, pos, 45);
                else {
                    const d = Math.max(Math.abs(pos.x - g.p0.x), Math.abs(pos.y - g.p0.y));
                    p1 = { x: g.p0.x + Math.sign(pos.x - g.p0.x || 1) * d, y: g.p0.y + Math.sign(pos.y - g.p0.y || 1) * d };
                }
            }
            g.p1 = { x: p1.x, y: p1.y };
            this._livePreview = this._shapeAction(g.p0, g.p1);
            this._scheduleLiveRedraw();
            break;
        }
        case 'rect':
            this._rectPreview = Object.assign(Geometry.rectFromPoints(g.p0, pos), { kind: this.mode });
            if (this.mode === 'crop') {
                this._cropPreview = this._rectPreview;
                this.drawCropOverlay();
            } else {
                this._scheduleLiveRedraw();
            }
            break;
        case 'laser': {
            const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
            for (const ev of (evs.length ? evs : [e])) {
                const p = this.getMousePos(ev);
                p.t = Math.max(0, (ev.timeStamp - g.ts0) / 1000);
                g.points.push(p);
            }
            this._livePreview = null;
            this._scheduleLiveRedraw();
            this._laserLive = { type: 'laser', points: g.points, color: this.laserColor };
            requestAnimationFrame(() => {
                if (this._gesture === g) this._drawLaser(this.ctx, this._laserLive, 1, this._liveView());
            });
            break;
        }
        default:
            if (g.kind.startsWith('select')) this._selectPointerMove(e, pos);
    }
};

FlowAnimator.prototype._onPointerUp = function(e, cancelled) {
    this._pointers.delete(e.pointerId);
    try { this._viewport.releasePointerCapture(e.pointerId); } catch (err) { /* não capturado */ }
    const g = this._gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
        if (this._pointers.size < 2) this._gesture = null;
        return;
    }
    if (cancelled && g.kind === 'draw') { this._cancelGesture(); return; }
    this._finishGesture(e);
};

FlowAnimator.prototype._finishGesture = function(e) {
    const g = this._gesture;
    this._gesture = null;
    this._gestureActive = false;
    const pos = e ? this.getMousePos(e) : null;

    if (!g) {
        if (this.isDrawing) this.stopDrawing();
        return;
    }
    switch (g.kind) {
        case 'draw':
            this.stopDrawing();
            break;
        case 'pan':
            this._viewport.classList.remove('panning');
            this.updateCursor();
            break;
        case 'comment-drag':
            this.isDraggingComment = false;
            this.selectedComment = null;
            this.updateCursor();
            if (g.moved) this._afterContentChange();
            break;
        case 'shape':
            this._livePreview = null;
            this._finishShape(g);
            break;
        case 'rect':
            this._rectPreview = null;
            this._finishRectTool(g, pos || g.p0);
            break;
        case 'laser':
            this._laserLive = null;
            this._finishLaser(g);
            break;
        default:
            if (g.kind.startsWith('select')) this._selectPointerUp(g, pos);
    }
    this._gestureRecordStart = null;
    if (this.timelineMode && !this._recordContinuous && !this.isDrawing) this._stopRecordClock();
};

FlowAnimator.prototype._cancelGesture = function() {
    const g = this._gesture;
    this._gesture = null;
    this._gestureActive = false;
    this._livePreview = null;
    this._rectPreview = null;
    this._marquee = null;
    if (g && g.kind === 'draw') {
        this.isDrawing = false;
        this.currentPath = [];
        this.isDrawingStraightLine = false;
        this.rebuildDrawingCanvas();
    }
    if (this.timelineMode && !this._recordContinuous) this._stopRecordClock();
    this.redrawMainCanvas();
};

// ─── Desenho livre (caneta, marca-texto, apagador) ─────────────────────────

FlowAnimator.prototype.startDrawing = function(e) {
    this.isDrawing = true;
    const pos = this.getMousePos(e);
    pos.t = 0;
    pos.p = this._pressureOf(e);
    this.currentPath = [pos];
    this._strokeTs0 = e.timeStamp || performance.now();
    this._strokeStartedAt = performance.now();
    this.drawStartTime = Date.now();

    // Modo gravação sequencial: a agulha "pula" para o início do próximo traço (recalculado a
    // partir do conteúdo atual — já reflete undos/deleções) e o relógio recomeça dali.
    if (this.timelineMode) {
        if (this._recordContinuous) {
            this._gestureRecordStart = this._recordNow();
        } else {
            this._recordCursor = this._nextRecordStart();
            this._startRecordClock(this._recordCursor);
            this._seekNeedle(this._recordCursor);
        }
    }

    // Linha reta: Alt = livre, Shift = snap 45°
    if (this.isAltPressed || this.isShiftPressed) {
        this.isDrawingStraightLine = true;
        this.straightLineStart = pos;
    } else {
        this.isDrawingStraightLine = false;
    }

    if (this.mode === 'draw' || this.mode === 'highlighter') this.redrawWithCurrentPath();
    else if (this.mode === 'erase') this.erasePathFromDrawing(this.currentPath, this._liveEraseSize());
};

FlowAnimator.prototype.draw = function(e) {
    if (!this.isDrawing) return;
    const k = 1 / this._screenScale();

    if (this.isDrawingStraightLine && this.straightLineStart) {
        const pos = this.getMousePos(e);
        let endpoint = pos;
        if (this.isShiftPressed) {
            const snapped = this.snapAngle(this.straightLineStart, pos, 45);
            endpoint = { x: snapped.x, y: snapped.y };
            this._lastSnapAngle = snapped.snapDeg;
        } else {
            const dx = pos.x - this.straightLineStart.x;
            const dy = pos.y - this.straightLineStart.y;
            this._lastFreeAngle = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360);
        }
        endpoint.t = Math.max(0, ((e.timeStamp || performance.now()) - this._strokeTs0) / 1000);
        endpoint.p = this._pressureOf(e);
        this.currentPath = [this.straightLineStart, endpoint];
        this.updateStraightLineIndicator();
    } else {
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        for (const ev of (evs.length ? evs : [e])) {
            const p = this.getMousePos(ev);
            const last = this.currentPath[this.currentPath.length - 1];
            if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.75 * k) continue;
            p.t = Math.max(0, ((ev.timeStamp || performance.now()) - this._strokeTs0) / 1000);
            p.p = this._pressureOf(ev);
            this.currentPath.push(p);
        }
    }

    if (this.mode === 'erase') {
        // Só o trecho novo (destination-out é idempotente) — barato mesmo em traços longos
        this.erasePathFromDrawing(this.isDrawingStraightLine ? this.currentPath : this.currentPath.slice(-3), this._liveEraseSize());
    } else {
        this._scheduleLiveRedraw();
    }
};

FlowAnimator.prototype.stopDrawing = function() {
    if (!this.isDrawing || this.currentPath.length < 1) {
        this.isDrawing = false;
        this.isDrawingStraightLine = false;
        this.straightLineStart = null;
        return;
    }
    this.isDrawing = false;

    const drawnSeconds = (performance.now() - this._strokeStartedAt) / 1000;
    const { startTime, duration } = this._timingForNew(drawnSeconds, 'stroke');

    this.saveUndoState(); // snapshot antes de adicionar a ação
    const points = this.currentPath.map((p) => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        t: Math.round((p.t || 0) * 1000) / 1000,
        p: p.p != null ? p.p : 0.5
    }));
    const action = {
        id: Util.uid('a'),
        type: this.mode === 'erase' ? 'erase' : 'draw',
        points,
        color: this.mode === 'highlighter' ? this.highlightColor : this.flowColor,
        width: this._liveWidth(),
        size: this._liveEraseSize(),
        duration,
        startTime, // TEMPO ABSOLUTO, não sequencial
        timestamp: Date.now()
    };
    if (this.mode === 'highlighter') action.tool = 'highlighter';
    if (this.mode === 'draw' && this.penStyle === 'pen') action.style = 'pen';
    this.actions.push(action);
    this._commitTiming(startTime, duration);

    this.currentPath = [];
    this.isDrawingStraightLine = false;
    this.straightLineStart = null;
    this._lastSnapAngle = null;
    this._lastFreeAngle = null;
    this._gestureRecordStart = null;
    this.updateStraightLineIndicator();

    this._afterContentChange();
};

// ─── Formas, retângulos e laser ────────────────────────────────────────────

// Espessuras efetivas (escaladas para cenas grandes — ver _toolScale)
FlowAnimator.prototype._liveWidth = function() {
    return (this.mode === 'highlighter' ? this.highlightWidth : this.lineWidth) * this._toolScale();
};
FlowAnimator.prototype._liveEraseSize = function() {
    return this.eraseSize * this._toolScale();
};

FlowAnimator.prototype._shapeAction = function(p0, p1) {
    return {
        type: 'draw',
        shape: this.mode,
        points: [{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }],
        color: this.flowColor,
        width: this.lineWidth * this._toolScale(),
        fill: (this.mode === 'rect' || this.mode === 'ellipse') && this.shapeFill
    };
};

FlowAnimator.prototype._finishShape = function(g) {
    const k = 1 / this._screenScale();
    if (Math.hypot(g.p1.x - g.p0.x, g.p1.y - g.p0.y) < 6 * k) {
        this.redrawMainCanvas();
        return;
    }
    const real = (performance.now() - g.startedAt) / 1000;
    const { startTime, duration } = this._timingForNew(real, 'shape');
    this.saveUndoState();
    const a = Object.assign(this._shapeAction(g.p0, g.p1), { id: Util.uid('a'), startTime, duration, timestamp: Date.now() });
    if (!a.fill) delete a.fill;
    this.actions.push(a);
    this._commitTiming(startTime, duration);
    this._afterContentChange();
};

FlowAnimator.prototype._finishRectTool = function(g, pos) {
    const r = Geometry.rectFromPoints(g.p0, pos);
    const k = 1 / this._screenScale();
    const mode = this.mode;
    if (r.w < 8 * k || r.h < 8 * k) {
        if (mode === 'crop') { this._cropPreview = null; this.drawCropOverlay(); this.exitCropMode(); }
        else this.redrawMainCanvas();
        return;
    }
    const real = (performance.now() - g.startedAt) / 1000;

    if (mode === 'crop') {
        this.cropRegion = r;
        this._cropPreview = null;
        this.drawCropOverlay();
        this.updateCropIndicator();
        this.showTooltip(t('cropSet', { w: Math.round(r.w), h: Math.round(r.h) }));
        this.exitCropMode();
        this.markDirty();
        return;
    }

    this.saveUndoState();
    if (mode === 'spotlight') {
        const { startTime, duration } = this._timingForNew(Math.max(real, 2), 'spotlight');
        this.actions.push({ id: Util.uid('a'), type: 'spotlight', rect: r, shape: this.spotlightShape, dim: this.spotlightDim, startTime, duration });
        this._commitTiming(startTime, duration);
    } else if (mode === 'redact') {
        this.actions.push({ id: Util.uid('a'), type: 'redact', rect: r, mode: this.redactMode, startTime: 0, duration: this.totalAnimationTime });
        this.showTooltip(t('redactAdded'));
    } else if (mode === 'camera') {
        const { startTime, duration } = this._timingForNew(1.5, 'camera');
        const move = { id: Util.uid('cam'), startTime, duration, rect: r, easing: 'easeInOut' };
        this.cameraMoves.push(move);
        this.cameraMoves.sort((a, b) => a.startTime - b.startTime);
        this._commitTiming(startTime, duration);
        this.showTooltip(t('cameraAdded', { t: Util.num(startTime, 1) }));
    }
    this._afterContentChange();
};

FlowAnimator.prototype._finishLaser = function(g) {
    const real = Math.max(0.3, (performance.now() - g.startedAt) / 1000);
    const pts = g.points.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, t: Math.round((p.t || 0) * 1000) / 1000 }));
    if (pts.length === 1) pts.push({ x: pts[0].x, y: pts[0].y, t: real });
    const { startTime, duration } = this._timingForNew(real, 'laser');
    this.saveUndoState();
    this.actions.push({ id: Util.uid('a'), type: 'laser', points: pts, color: this.laserColor, startTime, duration });
    this._commitTiming(startTime, duration);
    this._afterContentChange();
};

// ─── Seleção (ferramenta Selecionar) ───────────────────────────────────────

FlowAnimator.prototype._hitTest = function(pos) {
    const k = 1 / this._screenScale();
    const tol = 6 * k;
    const c = this.getCommentAt(pos.x, pos.y);
    if (c) return { kind: 'comment', obj: c };

    const ordered = this.actions.slice().sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    for (const a of ordered) {
        const track = this._trackTypeOf('action', a);
        if (!this._isTypeVisible(track)) continue;
        if (a.rect) {
            if (Geometry.pointInRect(pos, a.rect, tol)) return { kind: 'action', obj: a };
            continue;
        }
        if (!a.points || !a.points.length) continue;
        const w = (a.type === 'erase' ? (a.size || 20) : (a.width || 3)) / 2 + tol;
        if (a.shape) {
            if (a.fill && Geometry.pointInRect(pos, Geometry.bbox(a.points))) return { kind: 'action', obj: a };
            for (const path of Geometry.shapeSubpaths(a)) {
                if (Geometry.distToPolyline(pos, path) <= w) return { kind: 'action', obj: a };
            }
        } else if (Geometry.distToPolyline(pos, a.points) <= w) {
            return { kind: 'action', obj: a };
        }
    }
    if (this._isTypeVisible('camera')) {
        for (const m of this.cameraMoves) {
            if (!m.rect) continue;
            const r = m.rect;
            const onEdge = Geometry.pointInRect(pos, r, tol) && !Geometry.pointInRect(pos, { x: r.x + tol, y: r.y + tol, w: r.w - 2 * tol, h: r.h - 2 * tol });
            if (onEdge) return { kind: 'camera', obj: m };
        }
    }
    return null;
};

FlowAnimator.prototype._hitHandle = function(pos) {
    const k = 1 / this._screenScale();
    for (const h of this._selectionHandles()) {
        if (Math.abs(pos.x - h.x) <= 8 * k && Math.abs(pos.y - h.y) <= 8 * k) return h;
    }
    return null;
};

FlowAnimator.prototype._selectPointerDown = function(e, pos) {
    const handle = this._hitHandle(pos);
    if (handle) {
        const it = this.getSelectedItems()[0];
        if (this._isItemLocked(it)) { this.showTooltip(t('trackLockedMove')); return; }
        if (handle.id === 'pointer') {
            this._gesture = { kind: 'select-pointer', item: it, snapshotPending: true };
            return;
        }
        const o = it.obj;
        this._gesture = {
            kind: 'select-scale', item: it, handle,
            origin: { x: handle.ox, y: handle.oy },
            start: { x: handle.x, y: handle.y },
            orig: { points: o.points, rect: o.rect ? Object.assign({}, o.rect) : null, x: o.x, y: o.y, fontSize: o.fontSize },
            snapshotPending: true
        };
        return;
    }

    const hit = this._hitTest(pos);
    if (hit) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            this.toggleSelection(hit.obj.id);
        } else if (!this.selection.has(hit.obj.id)) {
            this.setSelection([hit.obj.id]);
        }
        this._gesture = { kind: 'select-move', last: pos, startClient: { x: e.clientX, y: e.clientY }, snapshotPending: true, moved: false };
        return;
    }

    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) this.clearSelection();
    this._gesture = { kind: 'select-marquee', p0: pos, additive: e.shiftKey || e.ctrlKey || e.metaKey };
};

FlowAnimator.prototype._selectPointerMove = function(e, pos) {
    const g = this._gesture;
    if (g.kind === 'select-move') {
        if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < 3) return;
        const items = this.getSelectedItems().filter((it) => !this._isItemLocked(it));
        if (!items.length) return;
        if (g.snapshotPending) { g.snapshotPending = false; this.saveUndoState(); }
        g.moved = true;
        this.moveItems(items, pos.x - g.last.x, pos.y - g.last.y);
        g.last = pos;
        this.invalidateRenderCaches();
        this._rebuildPending = true;
        this._scheduleSelectRedraw();
    } else if (g.kind === 'select-scale') {
        if (g.snapshotPending) { g.snapshotPending = false; this.saveUndoState(); }
        const o = g.item.obj;
        // Reaplica a partir do estado original a cada movimento (sem acumular erro)
        if (g.orig.points) o.points = g.orig.points;
        if (g.orig.rect) o.rect = Object.assign({}, g.orig.rect);
        if (g.item.kind === 'comment') { o.x = g.orig.x; o.y = g.orig.y; o.fontSize = g.orig.fontSize; }
        const dx0 = g.start.x - g.origin.x, dy0 = g.start.y - g.origin.y;
        let sx = dx0 ? (pos.x - g.origin.x) / dx0 : 1;
        let sy = dy0 ? (pos.y - g.origin.y) / dy0 : 1;
        if (e.shiftKey || g.item.kind === 'comment') {
            const s = Math.max(Math.abs(sx), Math.abs(sy));
            sx = Math.sign(sx || 1) * s;
            sy = Math.sign(sy || 1) * s;
        }
        if (Math.abs(sx) < 0.02) sx = 0.02 * Math.sign(sx || 1);
        if (Math.abs(sy) < 0.02) sy = 0.02 * Math.sign(sy || 1);
        this.scaleItem(g.item, g.origin, sx, sy);
        g.moved = true;
        this.invalidateRenderCaches();
        this._rebuildPending = true;
        this._scheduleSelectRedraw();
    } else if (g.kind === 'select-pointer') {
        if (g.snapshotPending) { g.snapshotPending = false; this.saveUndoState(); }
        g.item.obj.pointer = { x: pos.x, y: pos.y };
        g.moved = true;
        this._scheduleSelectRedraw();
    } else if (g.kind === 'select-marquee') {
        this._marquee = Geometry.rectFromPoints(g.p0, pos);
        this._scheduleSelectRedraw();
    }
};

FlowAnimator.prototype._scheduleSelectRedraw = function() {
    if (this._selectRedrawPending) return;
    this._selectRedrawPending = true;
    requestAnimationFrame(() => {
        this._selectRedrawPending = false;
        if (this._rebuildPending) {
            this._rebuildPending = false;
            this._renderInkEdit(this.drawingCtx, this.actions);
        }
        this.redrawMainCanvas();
    });
};

FlowAnimator.prototype._selectPointerUp = function(g, pos) {
    if (g.kind === 'select-marquee') {
        const r = this._marquee;
        this._marquee = null;
        if (r && (r.w > 2 || r.h > 2)) {
            const ids = this._allItems().filter((it) => {
                const b = this.itemBounds(it);
                return b && Geometry.rectsIntersect(r, b) && this._isTypeVisible(this._trackTypeOf(it.kind, it.obj));
            }).map((it) => it.obj.id);
            this.setSelection(ids, g.additive);
        } else {
            this.redrawMainCanvas();
        }
        return;
    }
    if (g.moved) this._afterContentChange();
};

// ─── Pan / pinça / zoom ────────────────────────────────────────────────────

FlowAnimator.prototype._beginPan = function(e) {
    try { this._viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._gesture = { kind: 'pan', x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
    this._viewport.classList.add('panning');
};

FlowAnimator.prototype._startPinch = function() {
    const pts = Array.from(this._pointers.values()).filter((p) => p.type === 'touch').slice(0, 2);
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
    this._gesture = { kind: 'pinch', dist, cx, cy, scale: this.displayScale, panX: this.panX, panY: this.panY };
};

FlowAnimator.prototype._updatePinch = function() {
    const g = this._gesture;
    const pts = Array.from(this._pointers.values()).filter((p) => p.type === 'touch').slice(0, 2);
    if (pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
    const vr = this._viewport.getBoundingClientRect();
    const newScale = Util.clamp(g.scale * dist / Math.max(1, g.dist), 0.05, 8);
    // Mantém o ponto sob o centro inicial da pinça embaixo do centro atual
    const ax = (g.cx - vr.left - g.panX) / g.scale;
    const ay = (g.cy - vr.top - g.panY) / g.scale;
    this.displayScale = newScale;
    this.panX = (cx - vr.left) - ax * newScale;
    this.panY = (cy - vr.top) - ay * newScale;
    this.updateCanvasDisplay();
};

FlowAnimator.prototype._bindViewportWheel = function() {
    const vp = document.getElementById('canvasViewport');
    vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        if (e.ctrlKey || e.metaKey) {
            const factor = Math.exp(-e.deltaY * unit * 0.0015);
            this.zoomAt(e.clientX, e.clientY, this.displayScale * factor);
        } else {
            const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
            const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
            this.panX -= dx;
            this.panY -= dy;
            this.updateCanvasDisplay();
        }
    }, { passive: false });

    if (typeof ResizeObserver === 'function') {
        let first = true;
        new ResizeObserver(() => {
            if (first) { first = false; return; }
            clearTimeout(this._resizeFitTimer);
            this._resizeFitTimer = setTimeout(() => this._keepCanvasInView(), 80);
        }).observe(vp);
    }
};

FlowAnimator.prototype.zoomAt = function(clientX, clientY, newScale) {
    const vr = this._viewport.getBoundingClientRect();
    const s = Util.clamp(newScale, 0.05, 8);
    const px = clientX - vr.left, py = clientY - vr.top;
    const cx = (px - this.panX) / this.displayScale;
    const cy = (py - this.panY) / this.displayScale;
    this.displayScale = s;
    this.panX = px - cx * s;
    this.panY = py - cy * s;
    this.updateCanvasDisplay();
};

FlowAnimator.prototype._zoomAtCenter = function(newScale) {
    const vr = this._viewport.getBoundingClientRect();
    this.zoomAt(vr.left + vr.width / 2, vr.top + vr.height / 2, newScale);
};

FlowAnimator.prototype.zoomIn = function() { this._zoomAtCenter(this.displayScale * 1.25); };
FlowAnimator.prototype.zoomOut = function() { this._zoomAtCenter(this.displayScale / 1.25); };

FlowAnimator.prototype.fitToScreen = function() {
    const vp = this._viewport || document.getElementById('canvasViewport');
    const availW = vp.clientWidth - 48;
    const availH = vp.clientHeight - 48;
    if (availW <= 0 || availH <= 0) return;
    this.displayScale = Math.min(availW / this.canvas.width, availH / this.canvas.height);
    this.centerCanvas();
};

FlowAnimator.prototype.centerCanvas = function() {
    const vp = this._viewport || document.getElementById('canvasViewport');
    this.panX = (vp.clientWidth - this.canvas.width * this.displayScale) / 2;
    this.panY = (vp.clientHeight - this.canvas.height * this.displayScale) / 2;
    this.updateCanvasDisplay();
};

// Após redimensionar a janela/timeline: se o canvas estava ajustado, reajusta; senão só
// garante que continue visível
FlowAnimator.prototype._keepCanvasInView = function() {
    if (this._fitted) this.fitToScreen();
    else this.updateCanvasDisplay();
};

FlowAnimator.prototype.updateCanvasDisplay = function() {
    const w = this.canvas.width * this.displayScale;
    const h = this.canvas.height * this.displayScale;
    const vp = this._viewport || document.getElementById('canvasViewport');
    // Mantém pelo menos 60px do canvas visíveis (não dá para "perder" o canvas no pan)
    const margin = 60;
    this.panX = Util.clamp(this.panX, margin - w, vp.clientWidth - margin);
    this.panY = Util.clamp(this.panY, margin - h, vp.clientHeight - margin);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const wrapper = document.getElementById('canvasWrapper');
    wrapper.style.transform = `translate(${Math.round(this.panX)}px, ${Math.round(this.panY)}px)`;
    if (this._cropCanvas) {
        this._cropCanvas.style.width = w + 'px';
        this._cropCanvas.style.height = h + 'px';
    }
    const fitScale = Math.min((vp.clientWidth - 48) / this.canvas.width, (vp.clientHeight - 48) / this.canvas.height);
    this._fitted = Math.abs(this.displayScale - fitScale) < 0.002;
    this.updateCanvasInfo();
    this.updateCursorPreview();
};

FlowAnimator.prototype.updateCanvasInfo = function() {
    const info = document.getElementById('canvasInfo');
    if (info) info.textContent = `${this.canvas.width}×${this.canvas.height}`;
    const zoom = document.getElementById('zoomDisplay');
    if (zoom) zoom.textContent = Math.round(this.displayScale * 100) + '%';
};

// ─── Cursor e indicadores ──────────────────────────────────────────────────

FlowAnimator.prototype.updateCursor = function() {
    const cursors = {
        select: 'default', pan: 'grab', draw: 'crosshair', highlighter: 'crosshair', erase: 'crosshair',
        arrow: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', comment: 'text', badge: 'cell',
        laser: 'crosshair', spotlight: 'crosshair', redact: 'crosshair', camera: 'crosshair', crop: 'crosshair'
    };
    this.canvas.style.cursor = cursors[this.mode] || 'crosshair';
};

FlowAnimator.prototype._updateHoverCursor = function(e) {
    if (this.mode === 'pan') return;
    const pos = this.getMousePos(e);
    if (this.mode === 'select') {
        const h = this._hitHandle(pos);
        if (h) { this.canvas.style.cursor = h.id === 'pointer' ? 'move' : (h.id === 'nw' || h.id === 'se' ? 'nwse-resize' : 'nesw-resize'); return; }
        this.canvas.style.cursor = this._hitTest(pos) ? 'move' : 'default';
        return;
    }
    if (this.mode !== 'comment' && this.comments.length && this.getCommentAt(pos.x, pos.y)) {
        this.canvas.style.cursor = 'grab';
        return;
    }
    this.updateCursor();
};

FlowAnimator.prototype.showCursorPreview = function() {
    const show = (el, on) => { el.style.display = on ? 'block' : 'none'; };
    show(this.brushPreview, this.mode === 'draw' || this.mode === 'highlighter');
    show(this.eraserPreview, this.mode === 'erase');
};

FlowAnimator.prototype.hideCursorPreview = function() {
    this.brushPreview.style.display = 'none';
    this.eraserPreview.style.display = 'none';
};

// Fator tela/canvas: espessuras estão em pixels do CANVAS; na tela o traço aparece
// multiplicado pelo zoom de exibição.
FlowAnimator.prototype._screenScale = function() {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width > 0 ? rect.width / this.canvas.width : 1;
};

FlowAnimator.prototype.updateCursorPreview = function(e) {
    const k = this._screenScale() * this._toolScale();
    const brushW = this.mode === 'highlighter' ? this.highlightWidth : this.lineWidth;
    const brushSize = Math.max(4, brushW * k);
    const eraserSize = Math.max(4, this.eraseSize * k);
    this.brushPreview.style.width = this.brushPreview.style.height = brushSize + 'px';
    this.eraserPreview.style.width = this.eraserPreview.style.height = eraserSize + 'px';
    if (!e) return;
    if (!this._isOverCanvas(e)) { this.hideCursorPreview(); return; }
    this.showCursorPreview();
    const preview = this.mode === 'erase' ? this.eraserPreview : this.brushPreview;
    const size = this.mode === 'erase' ? eraserSize : brushSize;
    preview.style.left = (e.clientX - size / 2) + 'px';
    preview.style.top = (e.clientY - size / 2) + 'px';
};

// Snap de ponto para o ângulo múltiplo de `step` graus mais próximo
FlowAnimator.prototype.snapAngle = function(start, end, step) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: end.x, y: end.y, snapDeg: 0 };
    const rawDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const snapped = Math.round(rawDeg / step) * step;
    const rad = snapped * Math.PI / 180;
    return { x: start.x + len * Math.cos(rad), y: start.y + len * Math.sin(rad), snapDeg: ((snapped % 360) + 360) % 360 };
};

FlowAnimator.prototype.updateStraightLineIndicator = function() {
    const indicator = document.getElementById('straightLineIndicator');
    if (!indicator) return;
    const label = document.getElementById('straightLineLabel');
    const badge = document.getElementById('angleDisplay');
    const active = FlowAnimator.DRAW_MODES.includes(this.mode);
    const vp = document.getElementById('canvasViewport').getBoundingClientRect();
    indicator.style.left = (vp.left + 16) + 'px';
    indicator.style.top = (vp.bottom - 48) + 'px';
    if (this.isShiftPressed && active) {
        indicator.classList.add('show', 'snap-mode');
        label.textContent = t('snap45');
        badge.textContent = this._lastSnapAngle != null ? this._lastSnapAngle + '°' : '—';
    } else if (this.isAltPressed && active) {
        indicator.classList.add('show');
        indicator.classList.remove('snap-mode');
        label.textContent = t('freeLine');
        badge.textContent = this._lastFreeAngle != null ? this._lastFreeAngle + '°' : '—';
    } else {
        indicator.classList.remove('show', 'snap-mode');
    }
};

// ─── Região de gravação (crop) ─────────────────────────────────────────────

FlowAnimator.prototype.initCropOverlay = function() {
    this._cropCanvas = document.getElementById('cropOverlay');
    this._cropCtx = this._cropCanvas.getContext('2d');
    this._syncCropCanvas();
};

FlowAnimator.prototype._syncCropCanvas = function() {
    if (!this._cropCanvas) return;
    this._cropCanvas.width = this.canvas.width;
    this._cropCanvas.height = this.canvas.height;
    this._cropCanvas.style.width = this.canvas.style.width || this.canvas.width + 'px';
    this._cropCanvas.style.height = this.canvas.style.height || this.canvas.height + 'px';
    this.drawCropOverlay();
};

FlowAnimator.prototype.enterCropMode = function() {
    if (this.mode !== 'crop') this._modeBeforeCrop = this.mode;
    this.setMode('crop');
    this.showTooltip(t('cropHelp'));
};

FlowAnimator.prototype.exitCropMode = function(fromSetMode) {
    if (this.mode !== 'crop') return;
    this._rectPreview = null;
    this._cropPreview = null;
    this.drawCropOverlay();
    if (!fromSetMode) this.setMode(this._modeBeforeCrop && this._modeBeforeCrop !== 'crop' ? this._modeBeforeCrop : 'draw');
};

FlowAnimator.prototype.drawCropOverlay = function() {
    if (!this._cropCtx) return;
    const ctx = this._cropCtx;
    const cw = this._cropCanvas.width;
    const ch = this._cropCanvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const r = this._cropPreview || this.cropRegion;
    if (!r || r.w < 2 || r.h < 2) return;
    const k = 1 / this._screenScale();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 2 * k;
    ctx.setLineDash([7 * k, 4 * k]);
    ctx.strokeRect(r.x + k, r.y + k, r.w - 2 * k, r.h - 2 * k);
    ctx.setLineDash([]);
    const label = `${Math.round(r.w)} × ${Math.round(r.h)} px`;
    ctx.font = `bold ${Math.round(13 * k)}px monospace`;
    const lw = ctx.measureText(label).width + 14 * k;
    const lx = Math.max(0, Math.min(r.x, cw - lw - 4 * k));
    const ly = r.y > 26 * k ? r.y - 6 * k : r.y + r.h + 20 * k;
    ctx.fillStyle = 'rgba(23,116,74,0.92)';
    ctx.beginPath();
    ctx.roundRect(lx - 2 * k, ly - 16 * k, lw, 20 * k, 4 * k);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx + 5 * k, ly);
};

FlowAnimator.prototype.clearCropRegion = function() {
    this.cropRegion = null;
    this._cropPreview = null;
    this.drawCropOverlay();
    document.getElementById('cropIndicator').classList.remove('show');
    this.showTooltip(t('cropRemoved'));
    this.markDirty();
};

FlowAnimator.prototype.updateCropIndicator = function() {
    const el = document.getElementById('cropIndicator');
    if (!this.cropRegion) { el.classList.remove('show'); return; }
    const r = this.cropRegion;
    document.getElementById('cropInfo').textContent = `${Math.round(r.w)} × ${Math.round(r.h)} px`;
    const vp = document.getElementById('canvasViewport').getBoundingClientRect();
    el.style.left = (vp.left + vp.width / 2) + 'px';
    el.style.top = (vp.top + 10) + 'px';
    el.classList.add('show');
};

// ─── Editor de texto no canvas ─────────────────────────────────────────────

FlowAnimator.prototype._openInlineEditor = function(pos, clientX, clientY) {
    this._closeInlineEditor(true);
    const ta = document.createElement('textarea');
    ta.className = 'inline-editor';
    ta.setAttribute('aria-label', t('labelCommentText'));
    ta.placeholder = t('inlinePlaceholder');
    const k = this._screenScale();
    ta.style.left = Math.round(clientX - 90) + 'px';
    ta.style.top = Math.round(clientY - 24) + 'px';
    ta.style.fontSize = Math.max(13, Math.round(this.commentFontSize * k)) + 'px';
    ta.style.fontFamily = this.commentFontFamily;
    ta.style.borderColor = this.commentBorderColor;
    ta.style.color = this.commentTextColor;
    ta.rows = 2;
    document.body.appendChild(ta);
    this._inlineEditor = { el: ta, pos };
    ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._closeInlineEditor(true); }
        else if (e.key === 'Escape') { e.preventDefault(); this._closeInlineEditor(false); }
    });
    ta.addEventListener('blur', () => this._closeInlineEditor(true));
    setTimeout(() => ta.focus(), 0);
};

FlowAnimator.prototype._closeInlineEditor = function(commit) {
    const ed = this._inlineEditor;
    if (!ed) return;
    this._inlineEditor = null;
    const text = ed.el.value;
    ed.el.remove();
    if (commit && text.trim()) this.placeComment(ed.pos, text);
};

// ─── Teclado ───────────────────────────────────────────────────────────────

FlowAnimator.prototype._bindKeyboard = function() {
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') { this.isAltPressed = false; this.updateStraightLineIndicator(); }
        if (e.key === 'Shift') { this.isShiftPressed = false; this.updateStraightLineIndicator(); }
    });
};

FlowAnimator.prototype._onKeyDown = function(e) {
    if (isModalOpen()) return;
    // Em campos de texto, Ctrl+Z/Ctrl+Y acionam o undo NATIVO do campo, não o do canvas
    const inText = Util.isTextField(e.target);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (mod && key === 's') { e.preventDefault(); this.saveProject({ manual: true }); return; }
    if (mod && key === 'o') { e.preventDefault(); document.getElementById('jsonInput').click(); return; }
    if (mod && key === 'e') { e.preventDefault(); this.openExportDialog('video'); return; }

    if (!inText && mod) {
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
        if (key === 'd') { e.preventDefault(); this.duplicateSelection(); return; }
        if (key === 'c') { if (this.copySelection()) e.preventDefault(); return; }
        if (key === 'a') { e.preventDefault(); this.selectAll(); return; }
        if (key === '=' || key === '+') { e.preventDefault(); this.zoomIn(); return; }
        if (key === '-') { e.preventDefault(); this.zoomOut(); return; }
        if (key === '0') { e.preventDefault(); this.fitToScreen(); return; }
    }

    if (e.key === 'Escape') {
        if (this.isPositioningComment) { this.exitCommentPositioning(); return; }
        if (this._gesture) { this._cancelGesture(); return; }
        if (this.mode === 'crop') { this.exitCropMode(); return; }
        if (this.selection.size && !inText) { this.clearSelection(); return; }
        // Esc "no vazio" não faz nada — resetar o playhead sem pedir seria surpreendente
        return;
    }

    if (e.key === 'Alt') {
        e.preventDefault();
        this.isAltPressed = true;
        this.updateStraightLineIndicator();
    }
    if (e.key === 'Shift') {
        this.isShiftPressed = true;
        this.updateStraightLineIndicator();
    }

    if (inText || mod || e.altKey) return;
    // Itens da timeline tratam as próprias teclas (setas/Delete) quando focados
    if (e.target.closest && e.target.closest('.timeline-item')) return;

    if (e.key === ' ') {
        // Espaço num botão focado deve ativar o botão, não o play/pause
        if (e.target.closest && e.target.closest('button, a, select')) return;
        e.preventDefault();
        this.togglePlay();
        return;
    }

    const sel = this.getSelectedItems().filter((it) => it.kind !== 'audio' && it.kind !== 'marker');
    switch (e.key) {
        case 'Delete':
        case 'Backspace':
            if (this.selection.size) { e.preventDefault(); this.deleteSelection(); }
            return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            if (sel.length) {
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                const now = Date.now();
                if (!this._lastArrowAt || now - this._lastArrowAt > 800) this.saveUndoState();
                this._lastArrowAt = now;
                this.moveItems(sel.filter((it) => !this._isItemLocked(it)), dx, dy);
                this._afterContentChange();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const dt = e.shiftKey ? 1 : 1 / 30;
                this.stepTime(e.key === 'ArrowLeft' ? -dt : dt);
            }
            return;
        }
        case 'Home': e.preventDefault(); this.seekTo(0); return;
        case 'End': e.preventDefault(); this.seekTo(this.totalAnimationTime); return;
        default: break;
    }

    if (key === 'k') { this.togglePlay(); return; }
    if (key === 'j') { this.stepTime(-1); return; }
    if (key === 'l') { this.stepTime(1); return; }
    if (key === 'm') { this.addMarker(); return; }
    if (key === '?') { this.showShortcuts(); return; }
    const tool = FlowAnimator.TOOL_KEYS[key];
    if (tool) this.setMode(tool);
};

FlowAnimator.prototype.showShortcuts = function() {
    const rows = [
        [t('scGroupTools'), null],
        ['V', t('toolSelectName')], ['G', t('toolPanName')], ['D', t('sectionDraw')], ['H', t('toolHighlighterName')],
        ['E', t('sectionErase')], ['A', t('toolArrowName')], ['R', t('shapeRect')], ['O', t('shapeEllipse')],
        ['C / T', t('sectionComments')], ['N', t('toolBadgeName')], ['Z', t('toolLaserName')], ['S', t('toolSpotlightName')],
        ['X', t('toolRedactName')], ['F', t('toolCameraName')],
        [t('scGroupPlayback'), null],
        [t('keySpace') + ' / K', t('playPause')], ['J / L', t('scJumpSecond')], ['← / →', t('scFrameStep')],
        ['Home / End', t('scStartEnd')], ['M', t('addMarker')],
        [t('scGroupEdit'), null],
        ['Ctrl+Z', t('undo')], ['Ctrl+Y', t('redo')], ['Ctrl+D', t('duplicate')], ['Ctrl+C / Ctrl+V', t('scCopyPaste')],
        ['Ctrl+A', t('selectAll')], ['Del', t('deleteSelection')], ['← ↑ → ↓', t('scNudge')], ['Alt / Shift', t('scStraight')],
        [t('scGroupView'), null],
        ['Ctrl + ' + t('keyWheel'), t('zoomIn')], [t('keyWheel'), t('scPan')], ['Ctrl+0', t('fitScreen')],
        ['Ctrl+S', t('btnSave')], ['Ctrl+O', t('btnImportJson')], ['Ctrl+E', t('btnExportVideo')], ['?', t('shortcutsTitle')]
    ];
    showCustomModal(t('shortcutsTitle'), (body) => {
        const grid = document.createElement('div');
        grid.className = 'shortcut-grid';
        for (const [k, label] of rows) {
            if (label == null) {
                const h = document.createElement('h4');
                h.textContent = k;
                grid.appendChild(h);
                continue;
            }
            const row = document.createElement('div');
            const l = document.createElement('span');
            l.textContent = label;
            const kb = document.createElement('kbd');
            kb.textContent = k;
            row.append(l, kb);
            grid.appendChild(row);
        }
        body.appendChild(grid);
    }, { wide: true });
};

// ─── Arrastar-e-soltar e colar ─────────────────────────────────────────────

FlowAnimator.prototype._bindDropAndPaste = function() {
    const overlay = document.getElementById('dropOverlay');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth++;
        overlay.classList.add('show');
    });
    window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
        if (!hasFiles(e)) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) overlay.classList.remove('show');
    });
    window.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        overlay.classList.remove('show');
        for (const file of Array.from(e.dataTransfer.files || [])) this.loadFile(file);
    });

    document.addEventListener('paste', (e) => {
        const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
        const imageItem = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
        if (imageItem) {
            e.preventDefault();
            const file = imageItem.getAsFile();
            if (file) this.loadFile(file);
            return;
        }
        if (Util.isTextField(e.target)) return;
        if (this.pasteClipboard()) e.preventDefault();
    });
};

// ─── Redimensionar a timeline ──────────────────────────────────────────────

FlowAnimator.prototype._bindTimelineResize = function() {
    const handle = document.getElementById('timelineResize');
    if (!handle) return;
    const app = document.getElementById('app');
    try {
        const saved = parseInt(localStorage.getItem('flowAnimatorTimelineH'), 10);
        if (saved >= 140 && saved <= 800) app.style.setProperty('--timeline-h', saved + 'px');
    } catch (e) { /* sem localStorage */ }
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        const area = document.querySelector('.timeline-area');
        start = { y: e.clientY, h: area.offsetHeight };
        handle.classList.add('active');
        document.body.style.cursor = 'ns-resize';
    });
    handle.addEventListener('pointermove', (e) => {
        if (!start) return;
        const max = Math.max(160, window.innerHeight - 220);
        const h = Util.clamp(start.h + (start.y - e.clientY), 140, max);
        app.style.setProperty('--timeline-h', h + 'px');
    });
    const end = () => {
        if (!start) return;
        start = null;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        try { localStorage.setItem('flowAnimatorTimelineH', parseInt(getComputedStyle(app).getPropertyValue('--timeline-h'), 10)); } catch (e) { /* ignore */ }
        this.timeline.updatePlayhead();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
};
