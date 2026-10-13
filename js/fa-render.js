// Motor de renderização do FlowAnimator.
// Uma única composição (_composite) é usada pela edição (t = null: tudo visível), pela
// reprodução, pelas miniaturas e pela exportação — assim o vídeo mostra exatamente o que a
// edição mostra. Ordem: fundo → tinta (desenhos e apagamentos intercalados por startTime) →
// ocultações (redact) → comentários → laser → destaque (spotlight). A câmera é aplicada
// depois, só na saída (exportação / pré-visualização).
//
// Uma "view" descreve o que renderizar: { actions, comments, cameraMoves, width, height, bg,
// bgColor, layer/layerCtx (camada de tinta), cache/cacheCtx/cacheOwner (prefixo concluído) }.

// Uma track oculta (👁️ na timeline) não renderiza seus itens — nem na exportação.
FlowAnimator.prototype._isTypeVisible = function(type) {
    return !this.timeline || this.timeline.isTypeVisible(type);
};

// Invalida caches de render (após mutação de actions, toggle de persistPaths/visibilidade).
// Já chamado por rebuildDrawingCanvas(), que roda em todo caminho de mutação.
FlowAnimator.prototype.invalidateRenderCaches = function() {
    this._persistedDrawsKey = null;
};

FlowAnimator.prototype._liveView = function() {
    const scene = this._scene();
    return {
        actions: this.actions,
        comments: this.comments,
        cameraMoves: this.cameraMoves,
        width: this.canvas.width,
        height: this.canvas.height,
        bg: this._bgCanvas,
        bgColor: (scene && scene.background && scene.background.color) || '#ffffff',
        layer: this._offscreenCanvas,
        layerCtx: this._offscreenCtx,
        cache: this._persistedDrawsCanvas,
        cacheCtx: this._persistedDrawsCtx,
        cacheOwner: this,
        crop: this.cropRegion,
        live: true
    };
};

// View de uma cena qualquer (exportação/miniatura), com canvases próprios. `scale` < 1 gera
// camadas menores (miniaturas); as coordenadas continuam em pixels da cena.
FlowAnimator.prototype._makeView = function(scene, scale) {
    const k = scale || 1;
    const s = scene.state;
    const mk = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(scene.width * k));
        c.height = Math.max(1, Math.round(scene.height * k));
        const ctx = c.getContext('2d');
        ctx.setTransform(k, 0, 0, k, 0, 0);
        return [c, ctx];
    };
    const [layer, layerCtx] = mk();
    const [cache, cacheCtx] = mk();
    return {
        actions: s.actions || [],
        comments: s.comments || [],
        cameraMoves: s.cameraMoves || [],
        width: scene.width,
        height: scene.height,
        bg: scene._bgCanvas,
        bgColor: (scene.background && scene.background.color) || '#ffffff',
        layer, layerCtx, cache, cacheCtx,
        cacheOwner: { _persistedDrawsKey: null },
        crop: null,
        live: false
    };
};

function _clearCanvasCtx(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
}

// Progresso (0..1, com easing) de uma ação no tempo t; -1 = ainda não começou, 2 = terminou
FlowAnimator.prototype._actionProgress = function(a, t) {
    const start = a.startTime || 0;
    const dur = a.duration || 2;
    if (t < start) return -1;
    if (t > start + dur) return 2;
    return Util.ease(a.easing || 'linear', (t - start) / dur);
};

FlowAnimator._pressureCache = new WeakMap();

// Desenha uma ação de tinta (desenho, forma, marca-texto ou apagamento) com progresso 0..1.
// Ritmo: traços com tempo por ponto (t) reproduzem o ritmo real da mão ("natural"); sem t (ou
// pace: 'uniform') o progresso é por comprimento de arco (velocidade constante).
FlowAnimator.prototype._drawActionInk = function(ctx, a, progress) {
    if (!a.points || !a.points.length) return;
    const p = Util.clamp(progress, 0, 1);
    const isErase = a.type === 'erase';
    const width = isErase ? (a.size || 20) : (a.width || 3);
    ctx.save();
    if (isErase) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = ctx.fillStyle = '#000';
    } else {
        ctx.strokeStyle = ctx.fillStyle = a.color || '#000000';
        if (a.tool === 'highlighter') ctx.globalAlpha = 0.38;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;

    if (a.shape) {
        const full = Geometry.shapeSubpaths(a);
        if (a.fill && (a.shape === 'rect' || a.shape === 'ellipse') && p > 0.85) {
            ctx.save();
            ctx.globalAlpha *= 0.2 * Math.min(1, (p - 0.85) / 0.15);
            ctx.beginPath();
            const pts = full[0];
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        for (const path of Geometry.subpathsPrefix(full, p)) {
            if (path.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    let pts = a.points;
    if (p < 1) {
        pts = (a.pace !== 'uniform' && Geometry.hasTimestamps(a.points))
            ? Geometry.prefixByTime(a.points, p)
            : Geometry.prefixByLength(a.points, p);
    }
    if (a.points.length === 1) {
        if (p < 1) ctx.globalAlpha *= p;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (a.style === 'pen' && !isErase) {
        let path;
        if (p >= 1) {
            const cached = FlowAnimator._pressureCache.get(a.points);
            if (cached && cached.width === width) path = cached.path;
            else {
                path = Geometry.pressureOutline(a.points, width);
                FlowAnimator._pressureCache.set(a.points, { width, path });
            }
        } else {
            path = Geometry.pressureOutline(pts, width, { last: false });
        }
        if (path) ctx.fill(path);
    } else {
        ctx.beginPath();
        Geometry.tracePath(ctx, pts);
        ctx.stroke();
    }
    ctx.restore();
};

// Compatibilidade com a API anterior (testes e código externo)
FlowAnimator.prototype.animatePathOnCanvas = function(ctx, points, options, progress) {
    const a = options.mode === 'erase'
        ? { type: 'erase', points, size: options.size }
        : { type: 'draw', points, color: options.color, width: options.width };
    this._drawActionInk(ctx, a, progress);
};
FlowAnimator.prototype.drawAnimatedPath = function(ctx, points, color, width, progress) {
    this._drawActionInk(ctx, { type: 'draw', points, color, width }, progress);
};
FlowAnimator.prototype.eraseAnimatedPathOnCanvas = function(ctx, points, size, progress) {
    this._drawActionInk(ctx, { type: 'erase', points, size }, progress);
};
FlowAnimator.prototype.drawPathOnContext = function(ctx, points, color, width) {
    this._drawActionInk(ctx, { type: 'draw', points, color, width }, 1);
};
FlowAnimator.prototype.erasePathOnContext = function(ctx, points, size) {
    this._drawActionInk(ctx, { type: 'erase', points, size }, 1);
};

FlowAnimator.prototype._isInk = function(a) {
    return (a.type === 'draw' || a.type === 'erase') && this._isTypeVisible(a.type);
};

// Camada de tinta no tempo t. Desenhos e apagamentos são aplicados INTERCALADOS em ordem
// cronológica — a mesma da edição. O prefixo cronológico de ações já concluídas é composto
// uma vez no cache e reaproveitado via drawImage enquanto não mudar.
FlowAnimator.prototype._renderInkLayer = function(view, t) {
    const ctx = view.layerCtx;
    _clearCanvasCtx(ctx);
    const actions = view.actions;
    const order = actions.map((_, i) => i).sort((a, b) =>
        ((actions[a].startTime || 0) - (actions[b].startTime || 0)) || (a - b));
    const endOf = (a) => (a.startTime || 0) + (a.duration || 2);

    let prefixLen = 0;
    if (this.persistPaths) {
        while (prefixLen < order.length) {
            const a = actions[order[prefixLen]];
            if (this._isInk(a) && endOf(a) >= t) break;
            prefixLen++;
        }
    }
    const key = order.slice(0, prefixLen).join(',');
    if (key !== view.cacheOwner._persistedDrawsKey) {
        _clearCanvasCtx(view.cacheCtx);
        for (let k = 0; k < prefixLen; k++) {
            const a = actions[order[k]];
            if (this._isInk(a)) this._drawActionInk(view.cacheCtx, a, 1);
        }
        view.cacheOwner._persistedDrawsKey = key;
    }
    if (prefixLen > 0) ctx.drawImage(view.cache, 0, 0, view.width, view.height);

    for (let k = prefixLen; k < order.length; k++) {
        const a = actions[order[k]];
        if (!this._isInk(a)) continue;
        const p = this._actionProgress(a, t);
        if (p < 0) continue;
        if (p > 1 && !this.persistPaths) continue;
        this._drawActionInk(ctx, a, Math.min(1, p));
    }
    return view.layer;
};

// Camada de tinta da edição (tudo, em ordem cronológica)
FlowAnimator.prototype._renderInkEdit = function(ctx, actions) {
    _clearCanvasCtx(ctx);
    const sorted = actions.slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    for (const a of sorted) if (this._isInk(a)) this._drawActionInk(ctx, a, 1);
};

// Composição completa de uma view no tempo t (null = edição: tudo visível, sem animação)
FlowAnimator.prototype._composite = function(ctx, view, t) {
    _clearCanvasCtx(ctx);
    this._drawBackground(ctx, view);

    let ink;
    if (t == null) {
        if (view.live) ink = this.drawingCanvas;
        else { this._renderInkEdit(view.layerCtx, view.actions); ink = view.layer; }
    } else {
        ink = this._renderInkLayer(view, t);
    }
    ctx.drawImage(ink, 0, 0, view.width, view.height);

    if (this._isTypeVisible('effect')) this._applyRedacts(ctx, view, t);

    if (this._isTypeVisible('comment')) {
        for (const c of view.comments) {
            if (t == null) this._drawCommentAt(ctx, c, null);
            else {
                const start = c.time || 0;
                const end = start + (c.duration || 3);
                if (t >= start && t <= end) this._drawCommentAt(ctx, c, t);
            }
        }
    }

    if (t != null && this._isTypeVisible('laser')) {
        for (const a of view.actions) {
            if (a.type !== 'laser') continue;
            const p = this._actionProgress(a, t);
            if (p >= 0 && p <= 1) this._drawLaser(ctx, a, p, view);
        }
    }

    if (t != null && this._isTypeVisible('effect')) this._drawSpotlights(ctx, view, t);
};

FlowAnimator.prototype.renderAnimationFrame = function() {
    try {
        const t = this.currentTime();
        const view = this._liveView();
        if (this.cameraPreview && (this.cameraMoves.length || this.cropRegion)) {
            if (!this._previewCanvas) this._previewCanvas = document.createElement('canvas');
            const pc = this._previewCanvas;
            if (pc.width !== view.width || pc.height !== view.height) { pc.width = view.width; pc.height = view.height; }
            this._composite(pc.getContext('2d'), view, t);
            const cam = this._cameraViewAt(view, t);
            const ctx = this.ctx;
            _clearCanvasCtx(ctx);
            ctx.fillStyle = '#0b0d11';
            ctx.fillRect(0, 0, view.width, view.height);
            const fit = Geometry.fitRect(cam.w, cam.h, view.width, view.height, 'contain');
            ctx.drawImage(pc, cam.x, cam.y, cam.w, cam.h, fit.x, fit.y, fit.w, fit.h);
        } else {
            this._composite(this.ctx, view, t);
            if (!this.isPlaying && !this.isExporting) this._drawEditOverlays(this.ctx, { atPlayhead: true });
        }
    } catch (error) {
        this.handleError(t('errRender'), error);
    }
};

FlowAnimator.prototype.redrawOverlaysAtPlayhead = function() {
    this.renderAnimationFrame();
};

FlowAnimator.prototype.redrawMainCanvas = function() {
    this._composite(this.ctx, this._liveView(), null);
    this._drawEditOverlays(this.ctx, {});
};

// Reconstrói o cache de tinta da edição. Toda reconstrução implica mutação de conteúdo:
// invalida os caches da animação e reancora a agulha do modo gravação (se ociosa).
FlowAnimator.prototype.rebuildDrawingCanvas = function() {
    this.invalidateRenderCaches();
    this._renderInkEdit(this.drawingCtx, this.actions);
    this._syncRecordNeedle();
};

// Visão de edição + o traço/forma em andamento (desenho ao vivo)
FlowAnimator.prototype.redrawWithCurrentPath = function() {
    this.redrawMainCanvas();
    if (!this.currentPath.length) return;
    const ctx = this.ctx;

    if (this.isDrawingStraightLine && this.currentPath.length >= 2) {
        const p0 = this.currentPath[0];
        const p1 = this.currentPath[this.currentPath.length - 1];
        const isSnap = this.isShiftPressed;
        const color = this.mode === 'highlighter' ? this.highlightColor : this.flowColor;
        const width = this._liveWidth();
        const k = 1 / this._screenScale();
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, Math.max(width * 1.2, 4 * k), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, Math.max(width * 1.2, 4 * k), 0, Math.PI * 2);
        ctx.strokeStyle = isSnap ? '#2ecc71' : color;
        ctx.lineWidth = 2 * k;
        ctx.stroke();
        const deg = isSnap ? this._lastSnapAngle : this._lastFreeAngle;
        if (deg != null) {
            const label = deg + '°';
            ctx.font = `bold ${Math.round(13 * k)}px monospace`;
            const tw = ctx.measureText(label).width + 12 * k;
            const bx = p1.x + 14 * k;
            const by = p1.y - 10 * k;
            ctx.fillStyle = isSnap ? 'rgba(23,116,74,0.92)' : 'rgba(47,111,228,0.92)';
            ctx.beginPath();
            ctx.roundRect(bx, by - 14 * k, tw, 18 * k, 5 * k);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, bx + 6 * k, by);
        }
        ctx.restore();
        return;
    }

    if (this.mode === 'draw' || this.mode === 'highlighter') {
        this._drawActionInk(ctx, this._liveStrokeAction(), 1);
    }
};

// Ação "em construção" com as configurações atuais da ferramenta
FlowAnimator.prototype._liveStrokeAction = function() {
    if (this.mode === 'highlighter') {
        return { type: 'draw', tool: 'highlighter', points: this.currentPath, color: this.highlightColor, width: this._liveWidth() };
    }
    return { type: 'draw', points: this.currentPath, color: this.flowColor, width: this._liveWidth(), style: this.penStyle };
};

// Apagador ao vivo: aplica o caminho atual direto no cache de tinta da edição (rebuild ao soltar)
FlowAnimator.prototype.erasePathFromDrawing = function(points, size) {
    if (!points.length) return;
    this._drawActionInk(this.drawingCtx, { type: 'erase', points, size }, 1);
    this.redrawMainCanvas();
};

// ─── Comentários ───────────────────────────────────────────────────────────

FlowAnimator.prototype.drawComments = function() {
    for (const c of this.comments) this._drawCommentAt(this.ctx, c, null);
};

FlowAnimator.prototype.drawComment = function(comment) {
    this._drawCommentAt(this.ctx, comment, null);
};

// Contorno de balão (retângulo arredondado com "rabicho" apontando para tip)
function _balloonPath(ctx, b, r, tip) {
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    const rr = Math.min(r, b.w / 2, b.h / 2);
    let side = null, base = 0;
    if (tip) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const dx = (tip.x - cx) / (b.w / 2), dy = (tip.y - cy) / (b.h / 2);
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) tip = null; // ponta dentro da caixa
        else if (Math.abs(dx) > Math.abs(dy)) side = dx > 0 ? 'right' : 'left';
        else side = dy > 0 ? 'bottom' : 'top';
    }
    const half = Math.min(14, (side === 'left' || side === 'right' ? b.h : b.w) / 4);
    if (side === 'top' || side === 'bottom') base = Util.clamp(tip.x, x0 + rr + half, x1 - rr - half);
    if (side === 'left' || side === 'right') base = Util.clamp(tip.y, y0 + rr + half, y1 - rr - half);

    ctx.beginPath();
    ctx.moveTo(x0 + rr, y0);
    if (side === 'top') { ctx.lineTo(base - half, y0); ctx.lineTo(tip.x, tip.y); ctx.lineTo(base + half, y0); }
    ctx.lineTo(x1 - rr, y0);
    ctx.arcTo(x1, y0, x1, y0 + rr, rr);
    if (side === 'right') { ctx.lineTo(x1, base - half); ctx.lineTo(tip.x, tip.y); ctx.lineTo(x1, base + half); }
    ctx.lineTo(x1, y1 - rr);
    ctx.arcTo(x1, y1, x1 - rr, y1, rr);
    if (side === 'bottom') { ctx.lineTo(base + half, y1); ctx.lineTo(tip.x, tip.y); ctx.lineTo(base - half, y1); }
    ctx.lineTo(x0 + rr, y1);
    ctx.arcTo(x0, y1, x0, y1 - rr, rr);
    if (side === 'left') { ctx.lineTo(x0, base + half); ctx.lineTo(tip.x, tip.y); ctx.lineTo(x0, base - half); }
    ctx.lineTo(x0, y0 + rr);
    ctx.arcTo(x0, y0, x0 + rr, y0, rr);
    ctx.closePath();
}

// Desenha um comentário (t = null: estático; t: com animação de entrada/saída)
FlowAnimator.prototype._drawCommentAt = function(ctx, c, t) {
    const fontFamily = c.fontFamily || this.commentFontFamily;
    const fontSize = c.fontSize || this.commentFontSize;
    const textColor = c.textColor || this.commentTextColor;
    const bgColor = c.bgColor || this.commentBgColor;
    const borderColor = c.borderColor || c.color || this.commentBorderColor;
    const opacity = c.opacity !== undefined ? c.opacity : this.commentOpacity;
    const box = this._getCommentBox(c);
    const layout = box.layout;

    let alpha = 1, scale = 1, dy = 0, chars = null;
    if (t != null) {
        const local = t - (c.time || 0);
        const dur = c.duration || 3;
        const inD = Math.min(0.4, dur / 3);
        const outD = Math.min(0.35, dur / 3);
        const pin = Util.clamp(local / inD, 0, 1);
        const pout = Util.clamp((dur - local) / outD, 0, 1);
        switch (c.animIn) {
            case 'fade': alpha *= pin; break;
            case 'pop': scale *= 0.3 + 0.7 * Util.ease('easeOutBack', pin); alpha *= Util.clamp(pin * 2, 0, 1); break;
            case 'slide': dy = (1 - Util.ease('easeOut', pin)) * fontSize * 1.5; alpha *= pin; break;
            case 'typewriter': {
                const total = layout.lines.reduce((s, l) => s + l.length, 0);
                const typeD = Util.clamp(dur * 0.5, 0.4, 2.5);
                chars = Math.floor(total * Util.clamp(local / typeD, 0, 1));
                alpha *= Util.clamp(local / 0.15, 0, 1);
                break;
            }
            default: break;
        }
        if (c.animOut === 'fade') alpha *= pout;
        else if (c.animOut === 'pop') { scale *= 0.3 + 0.7 * pout; alpha *= pout; }
    }
    if (alpha <= 0.001) return;

    ctx.save();
    ctx.globalAlpha *= alpha;
    if (scale !== 1 || dy) {
        ctx.translate(c.x, c.y + dy);
        ctx.scale(scale, scale);
        ctx.translate(-c.x, -c.y);
    }

    if (c.kind === 'badge') {
        const r = box.w / 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = fontSize * 0.4;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(2, fontSize * 0.1);
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(c.text), c.x, c.y + fontSize * 0.04);
        ctx.restore();
        return;
    }

    const radius = Math.max(4, fontSize * 0.3);
    _balloonPath(ctx, box, radius, c.pointer || null);
    ctx.fillStyle = Util.hexToRgba(bgColor, opacity);
    ctx.fill();
    const bw = c.borderWidth != null ? c.borderWidth : Math.max(2, fontSize / 12);
    if (bw > 0) {
        ctx.lineWidth = bw;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
    }

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    const firstY = c.y - ((layout.lines.length - 1) * layout.lineHeight) / 2;
    let remaining = chars;
    layout.lines.forEach((line, i) => {
        let text = line;
        if (remaining != null) {
            text = line.slice(0, Math.max(0, remaining));
            remaining -= line.length;
        }
        if (!text) return;
        if (remaining != null && text.length < line.length) {
            // Mantém o alinhamento da linha completa enquanto "digita"
            ctx.textAlign = 'left';
            const fullW = ctx.measureText(line).width;
            ctx.fillText(text, c.x - fullW / 2, firstY + i * layout.lineHeight);
            ctx.textAlign = 'center';
        } else {
            ctx.fillText(text, c.x, firstY + i * layout.lineHeight);
        }
    });
    ctx.restore();
};

// ─── Laser, destaque e ocultação ───────────────────────────────────────────

FlowAnimator.prototype._drawLaser = function(ctx, a, p, view) {
    const pts = a.points;
    if (!pts || !pts.length) return;
    const k = Math.max(1, view.width / 1600);
    const color = a.color || '#ff3b30';
    const timed = Geometry.hasTimestamps(pts);
    const T = timed ? pts[pts.length - 1].t : 1;
    const v = p * T;
    const head = timed ? Geometry.pointAtTime(pts, v) : (() => { const pre = Geometry.prefixByLength(pts, p); return pre[pre.length - 1]; })();
    if (!head) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 * k;
    if (timed) {
        const trail = 0.45;
        const from = v - trail;
        let prev = null;
        for (const q of pts) {
            if (q.t < from) continue;
            if (q.t > v) break;
            if (prev) {
                const alpha = Util.clamp((q.t - from) / trail, 0, 1);
                ctx.strokeStyle = Util.hexToRgba(color, alpha * 0.85);
                ctx.lineWidth = 5 * k * (0.4 + 0.6 * alpha);
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(q.x, q.y);
                ctx.stroke();
            }
            prev = q;
        }
        if (prev) {
            ctx.strokeStyle = Util.hexToRgba(color, 0.85);
            ctx.lineWidth = 5 * k;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(head.x, head.y);
            ctx.stroke();
        }
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 9 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.2 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

FlowAnimator.prototype._effectAlpha = function(a, t) {
    const local = t - (a.startTime || 0);
    const dur = a.duration || 3;
    if (local < 0 || local > dur) return 0;
    const ramp = Math.min(0.3, dur / 3);
    return Util.clamp(Math.min(local / ramp, (dur - local) / ramp), 0, 1);
};

FlowAnimator.prototype._drawSpotlights = function(ctx, view, t) {
    for (const a of view.actions) {
        if (a.type !== 'spotlight' || !a.rect) continue;
        const alpha = this._effectAlpha(a, t);
        if (alpha <= 0) continue;
        const r = a.rect;
        const k = Math.max(1, view.width / 1600);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, view.width, view.height);
        if (a.shape === 'ellipse') {
            ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w / 2), Math.max(1, r.h / 2), 0, 0, Math.PI * 2);
        } else {
            ctx.roundRect(r.x, r.y, r.w, r.h, 10 * k);
        }
        ctx.fillStyle = `rgba(0, 0, 0, ${(a.dim != null ? a.dim : 0.6) * alpha})`;
        ctx.fill('evenodd');
        ctx.restore();
    }
};

FlowAnimator.prototype._applyRedacts = function(ctx, view, t) {
    for (const a of view.actions) {
        if (a.type !== 'redact' || !a.rect) continue;
        if (t != null && this._effectAlpha(a, t) <= 0 && !(t >= a.startTime && t <= a.startTime + a.duration)) continue;
        const r = Geometry.normalizeRect(a.rect);
        if (r.w < 2 || r.h < 2) continue;
        const sx = Math.max(0, Math.floor(r.x)), sy = Math.max(0, Math.floor(r.y));
        const sw = Math.min(view.width - sx, Math.ceil(r.w)), sh = Math.min(view.height - sy, Math.ceil(r.h));
        if (sw <= 0 || sh <= 0) continue;
        ctx.save();
        if (a.mode === 'solid') {
            ctx.fillStyle = '#111';
            ctx.fillRect(sx, sy, sw, sh);
        } else {
            // Pixeliza copiando a região para um canvas minúsculo e ampliando sem suavização.
            // ('blur' usa um bloco maior — ctx.filter não é suportado em todos os navegadores.)
            const block = Math.max(8, Math.round(Math.min(sw, sh) / (a.mode === 'blur' ? 4 : 8)));
            if (!this._redactCanvas) this._redactCanvas = document.createElement('canvas');
            const tmp = this._redactCanvas;
            tmp.width = Math.max(1, Math.ceil(sw / block));
            tmp.height = Math.max(1, Math.ceil(sh / block));
            const tctx = tmp.getContext('2d');
            tctx.imageSmoothingEnabled = true;
            const src = ctx.canvas;
            const m = ctx.getTransform();
            tctx.drawImage(src, sx * m.a + m.e, sy * m.d + m.f, sw * m.a, sh * m.d, 0, 0, tmp.width, tmp.height);
            ctx.imageSmoothingEnabled = a.mode === 'blur';
            ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, sx, sy, sw, sh);
        }
        ctx.restore();
    }
};

// ─── Câmera ────────────────────────────────────────────────────────────────

// Enquadramento no tempo t: parte da região de gravação (ou cena inteira) e aplica os
// movimentos de câmera em ordem — cada um interpola do enquadramento anterior até o seu
// retângulo durante [startTime, startTime + duration] e mantém depois.
FlowAnimator.prototype._cameraViewAt = function(view, t) {
    let cur = view.crop ? Object.assign({}, view.crop) : { x: 0, y: 0, w: view.width, h: view.height };
    const moves = (view.cameraMoves || []).filter((m) => m.rect && m.rect.w > 1 && m.rect.h > 1)
        .slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    if (!this._isTypeVisible('camera')) return cur;
    for (const m of moves) {
        const start = m.startTime || 0;
        const dur = Math.max(0.01, m.duration || 1.5);
        if (t >= start + dur) { cur = Object.assign({}, m.rect); continue; }
        if (t >= start) cur = Geometry.lerpRect(cur, m.rect, Util.ease(m.easing || 'easeInOut', (t - start) / dur));
        break;
    }
    return cur;
};

// Frame de saída (exportação): compõe a view em view.compose e aplica a câmera no tamanho final
FlowAnimator.prototype.renderOutputFrame = function(outCtx, outW, outH, view, t, fitMode) {
    if (!view.compose) {
        view.compose = document.createElement('canvas');
        view.compose.width = view.width;
        view.compose.height = view.height;
    }
    this._composite(view.compose.getContext('2d'), view, t);
    const cam = this._cameraViewAt(view, t);
    outCtx.save();
    outCtx.setTransform(1, 0, 0, 1, 0, 0);
    outCtx.fillStyle = '#000';
    outCtx.fillRect(0, 0, outW, outH);
    const fit = Geometry.fitRect(cam.w, cam.h, outW, outH, fitMode || 'contain');
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(view.compose, cam.x, cam.y, cam.w, cam.h, fit.x, fit.y, fit.w, fit.h);
    outCtx.restore();
};

// ─── Overlays de edição ────────────────────────────────────────────────────

// Alças de canto da seleção única (coordenadas do canvas)
FlowAnimator.prototype._selectionHandles = function() {
    const items = this.getSelectedItems().filter((it) => it.kind !== 'audio' && it.kind !== 'marker');
    if (items.length !== 1) return [];
    const b = this.itemBounds(items[0]);
    if (!b) return [];
    const k = 1 / this._screenScale();
    const pad = 6 * k;
    const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad;
    const handles = [
        { id: 'nw', x: x0, y: y0, ox: x1, oy: y1 },
        { id: 'ne', x: x1, y: y0, ox: x0, oy: y1 },
        { id: 'sw', x: x0, y: y1, ox: x1, oy: y0 },
        { id: 'se', x: x1, y: y1, ox: x0, oy: y0 }
    ];
    const c = items[0].kind === 'comment' ? items[0].obj : null;
    if (c && c.pointer) handles.push({ id: 'pointer', x: c.pointer.x, y: c.pointer.y });
    return handles;
};

FlowAnimator.prototype._drawEditOverlays = function(ctx, opts) {
    const k = 1 / this._screenScale();
    ctx.save();

    // Laser: rastro tracejado (não aparece no vídeo como traço — só o ponto luminoso)
    if (this._isTypeVisible('laser')) {
        for (const a of this.actions) {
            if (a.type !== 'laser' || !a.points || a.points.length < 2) continue;
            ctx.save();
            ctx.setLineDash([6 * k, 6 * k]);
            ctx.strokeStyle = Util.hexToRgba(a.color || '#ff3b30', 0.55);
            ctx.lineWidth = 2 * k;
            ctx.beginPath();
            Geometry.tracePath(ctx, a.points);
            ctx.stroke();
            ctx.restore();
        }
    }

    // Efeitos: contorno de destaque/ocultação
    if (this._isTypeVisible('effect')) {
        for (const a of this.actions) {
            if ((a.type !== 'spotlight' && a.type !== 'redact') || !a.rect) continue;
            const r = a.rect;
            ctx.save();
            ctx.setLineDash([8 * k, 5 * k]);
            ctx.lineWidth = 2 * k;
            ctx.strokeStyle = a.type === 'spotlight' ? 'rgba(167,139,250,0.95)' : 'rgba(255,255,255,0.9)';
            if (a.type === 'spotlight' && a.shape === 'ellipse') {
                ctx.beginPath();
                ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w / 2), Math.max(1, r.h / 2), 0, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.strokeRect(r.x, r.y, r.w, r.h);
            }
            ctx.restore();
        }
    }

    // Câmera: retângulos dos movimentos (o ativo na agulha em destaque)
    const showCamera = this._isTypeVisible('camera') && (this.mode === 'camera' || this.getSelectedItems().some((it) => it.kind === 'camera'));
    if (showCamera) {
        const t = this.currentTime();
        let active = null;
        for (const m of this.cameraMoves) if ((m.startTime || 0) <= t) active = m;
        this.cameraMoves.forEach((m, i) => {
            if (!m.rect) return;
            ctx.save();
            ctx.setLineDash(m === active ? [] : [10 * k, 6 * k]);
            ctx.lineWidth = (m === active ? 3 : 2) * k;
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.95)';
            ctx.strokeRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
            ctx.fillStyle = 'rgba(14, 116, 105, 0.95)';
            ctx.font = `bold ${Math.round(12 * k)}px sans-serif`;
            const label = '🎥 ' + (i + 1);
            const tw = ctx.measureText(label).width + 10 * k;
            ctx.fillRect(m.rect.x, m.rect.y - 18 * k, tw, 18 * k);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, m.rect.x + 5 * k, m.rect.y - 5 * k);
            ctx.restore();
        });
    }

    // Seleção
    const items = this.getSelectedItems();
    for (const it of items) {
        const b = this.itemBounds(it);
        if (!b) continue;
        const pad = 6 * k;
        ctx.save();
        ctx.setLineDash([5 * k, 4 * k]);
        ctx.lineWidth = 1.5 * k;
        ctx.strokeStyle = '#4c8dff';
        ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        ctx.restore();
    }
    for (const h of this._selectionHandles()) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2f6fe4';
        ctx.lineWidth = 1.5 * k;
        if (h.id === 'pointer') {
            ctx.beginPath();
            ctx.arc(h.x, h.y, 6 * k, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else {
            const s = 9 * k;
            ctx.fillRect(h.x - s / 2, h.y - s / 2, s, s);
            ctx.strokeRect(h.x - s / 2, h.y - s / 2, s, s);
        }
        ctx.restore();
    }

    // Prévias de gestos em andamento
    if (this._livePreview) this._drawActionInk(ctx, this._livePreview, 1);
    if (this._rectPreview) {
        const r = this._rectPreview;
        ctx.save();
        ctx.setLineDash([8 * k, 5 * k]);
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = { spotlight: '#a78bfa', redact: '#ffffff', camera: '#2dd4bf' }[r.kind] || '#4c8dff';
        if (r.kind === 'redact') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }
    if (this._marquee) {
        const r = this._marquee;
        ctx.save();
        ctx.fillStyle = 'rgba(76,141,255,0.12)';
        ctx.strokeStyle = '#4c8dff';
        ctx.lineWidth = 1 * k;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }
    ctx.restore();
};

// ─── Miniaturas ────────────────────────────────────────────────────────────

// Miniatura (dataURL) de uma cena na visão de edição
FlowAnimator.prototype.renderSceneThumbnail = function(scene, w, h) {
    const tw = w || 160;
    const th = h || Math.round(tw * scene.height / scene.width);
    if (scene._thumb && scene._thumb.w === tw) return scene._thumb.url;
    const isCurrent = scene === this._scene();
    const view = isCurrent
        ? Object.assign(this._makeView(Object.assign({}, scene, { state: this._liveState() }), tw / scene.width), { bg: this._bgCanvas })
        : this._makeView(scene, tw / scene.width);
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d');
    ctx.setTransform(tw / scene.width, 0, 0, th / scene.height, 0, 0);
    this._composite(ctx, view, null);
    const url = c.toDataURL('image/jpeg', 0.75);
    scene._thumb = { w: tw, url };
    return url;
};

// Miniatura de um item da timeline (traço/forma reduzido ao tamanho do chip)
FlowAnimator.prototype.drawItemThumb = function(canvas, kind, obj) {
    const dpr = window.devicePixelRatio || 1;
    const W = 34, H = 24;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const pad = 3;
    let b = null;
    if (kind === 'action' && obj.points && obj.points.length) b = Geometry.bbox(obj.points);
    else if (obj.rect) b = obj.rect;
    if (kind === 'comment') {
        ctx.fillStyle = obj.kind === 'badge' ? (obj.bgColor || '#e74c3c') : '#ffffff';
        ctx.strokeStyle = obj.borderColor || '#f39c12';
        ctx.lineWidth = 2;
        if (obj.kind === 'badge') {
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = obj.textColor || '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(obj.text).slice(0, 3), W / 2, H / 2 + 0.5);
        } else {
            ctx.beginPath();
            ctx.roundRect(4, 4, W - 8, H - 8, 3);
            ctx.fill();
            ctx.stroke();
        }
        return;
    }
    if (!b) return;
    const s = Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h));
    const ox = (W - b.w * s) / 2 - b.x * s;
    const oy = (H - b.h * s) / 2 - b.y * s;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 / s;
    if (kind === 'camera' || obj.type === 'spotlight' || obj.type === 'redact') {
        ctx.strokeStyle = kind === 'camera' ? '#0e7469' : obj.type === 'spotlight' ? '#7445d6' : '#333';
        ctx.setLineDash([4 / s, 3 / s]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
    } else if (obj.shape) {
        ctx.strokeStyle = obj.color || '#000';
        for (const path of Geometry.shapeSubpaths(obj)) {
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
            ctx.stroke();
        }
    } else {
        ctx.strokeStyle = obj.type === 'erase' ? '#c93a3f' : (obj.color || '#000');
        if (obj.type === 'erase' || obj.type === 'laser') ctx.setLineDash([3 / s, 3 / s]);
        if (obj.tool === 'highlighter') { ctx.globalAlpha = 0.6; ctx.lineWidth = 5 / s; }
        ctx.beginPath();
        Geometry.tracePath(ctx, obj.points);
        ctx.stroke();
    }
    ctx.restore();
};
