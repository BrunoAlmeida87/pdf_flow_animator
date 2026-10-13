// Geometria de traços e formas — funções puras (sem estado de app).
// Pontos: { x, y, t?, p? } — t = segundos desde o início do traço (ritmo real da mão),
// p = pressão 0..1 (caneta). `points` nunca é mutado in-place (só reatribuído), então os
// caches abaixo podem usar o próprio array como chave (WeakMap).

const Geometry = {
    _cumCache: new WeakMap(),
    _shapeCache: new WeakMap(),

    cumulativeLengths(points) {
        let cum = this._cumCache.get(points);
        if (!cum || cum.length !== points.length) {
            cum = new Float64Array(points.length);
            for (let i = 1; i < points.length; i++) {
                cum[i] = cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            }
            this._cumCache.set(points, cum);
        }
        return cum;
    },

    length(points) {
        const cum = this.cumulativeLengths(points);
        return cum.length ? cum[cum.length - 1] : 0;
    },

    hasTimestamps(points) {
        return points.length > 1 && typeof points[points.length - 1].t === 'number' && points[points.length - 1].t > 0;
    },

    hasPressure(points) {
        for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 8))) {
            const p = points[i].p;
            if (typeof p === 'number' && p > 0 && p !== 0.5) return true;
        }
        return false;
    },

    // Prefixo do traço até a fração `progress` do COMPRIMENTO (velocidade constante).
    prefixByLength(points, progress) {
        if (points.length < 2 || progress >= 1) return points;
        const cum = this.cumulativeLengths(points);
        const total = cum[cum.length - 1];
        const target = total * Math.max(0, progress);
        const out = [points[0]];
        let i = 1;
        while (i < points.length && cum[i] <= target) { out.push(points[i]); i++; }
        if (i < points.length && target > cum[i - 1]) {
            const seg = cum[i] - cum[i - 1];
            const f = seg > 0 ? (target - cum[i - 1]) / seg : 0;
            out.push(this._interp(points[i - 1], points[i], f));
        }
        return out;
    },

    // Prefixo até a fração `progress` do TEMPO gravado (reproduz o ritmo real da mão).
    prefixByTime(points, progress) {
        if (points.length < 2 || progress >= 1) return points;
        const total = points[points.length - 1].t;
        const target = total * Math.max(0, progress);
        const out = [points[0]];
        let i = 1;
        while (i < points.length && points[i].t <= target) { out.push(points[i]); i++; }
        if (i < points.length) {
            const a = points[i - 1], b = points[i];
            const span = b.t - a.t;
            const f = span > 0 ? (target - a.t) / span : 0;
            if (f > 0) out.push(this._interp(a, b, f));
        }
        return out;
    },

    _interp(a, b, f) {
        const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        if (typeof a.t === 'number' && typeof b.t === 'number') p.t = a.t + (b.t - a.t) * f;
        if (typeof a.p === 'number' && typeof b.p === 'number') p.p = a.p + (b.p - a.p) * f;
        return p;
    },

    // Ponto na fração `progress` do tempo (cabeça do ponteiro laser)
    pointAtTime(points, seconds) {
        if (!points.length) return null;
        if (points.length === 1 || seconds <= 0) return points[0];
        const last = points[points.length - 1];
        if (seconds >= last.t) return last;
        let lo = 0, hi = points.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (points[mid].t <= seconds) lo = mid; else hi = mid;
        }
        const a = points[lo], b = points[hi];
        const span = b.t - a.t;
        return this._interp(a, b, span > 0 ? (seconds - a.t) / span : 0);
    },

    // Subpaths (polilinhas) de uma forma geométrica definida por dois cantos p0→p1.
    // arrow: haste + ponta; rect: perímetro; ellipse: amostrada; line: segmento.
    shapeSubpaths(action) {
        const key = action.points;
        const cached = this._shapeCache.get(key);
        const sig = action.shape + '|' + (action.width || 3);
        if (cached && cached.sig === sig) return cached.paths;
        const p0 = action.points[0];
        const p1 = action.points[action.points.length - 1];
        let paths;
        if (action.shape === 'rect') {
            const x0 = Math.min(p0.x, p1.x), y0 = Math.min(p0.y, p1.y);
            const x1 = Math.max(p0.x, p1.x), y1 = Math.max(p0.y, p1.y);
            paths = [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];
        } else if (action.shape === 'ellipse') {
            const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
            const rx = Math.abs(p1.x - p0.x) / 2, ry = Math.abs(p1.y - p0.y) / 2;
            const n = Math.max(24, Math.min(160, Math.round((rx + ry) / 4)));
            const pts = [];
            for (let i = 0; i <= n; i++) {
                // Começa no topo e desenha no sentido horário (parece "feito à mão")
                const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
                pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
            }
            paths = [pts];
        } else if (action.shape === 'arrow') {
            const w = action.width || 3;
            const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const head = Math.min(len * 0.45, Math.max(14, w * 4.5));
            const spread = Math.PI / 7;
            const left = { x: p1.x - head * Math.cos(ang - spread), y: p1.y - head * Math.sin(ang - spread) };
            const right = { x: p1.x - head * Math.cos(ang + spread), y: p1.y - head * Math.sin(ang + spread) };
            paths = [[p0, p1], [left, p1, right]];
        } else {
            paths = [[p0, p1]];
        }
        this._shapeCache.set(key, { sig, paths });
        return paths;
    },

    // Prefixo de vários subpaths em sequência (a forma "se desenha" na ordem)
    subpathsPrefix(paths, progress) {
        if (progress >= 1) return paths;
        const lens = paths.map((p) => this.length(p));
        const total = lens.reduce((a, b) => a + b, 0);
        let remaining = total * Math.max(0, progress);
        const out = [];
        for (let i = 0; i < paths.length; i++) {
            if (remaining <= 0) break;
            if (remaining >= lens[i]) {
                out.push(paths[i]);
                remaining -= lens[i];
            } else {
                out.push(this.prefixByLength(paths[i], lens[i] > 0 ? remaining / lens[i] : 1));
                remaining = 0;
            }
        }
        return out;
    },

    bbox(points) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of points) {
            if (p.x < x0) x0 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.x > x1) x1 = p.x;
            if (p.y > y1) y1 = p.y;
        }
        if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },

    rectFromPoints(a, b) {
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    },

    normalizeRect(r) {
        return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
    },

    rectsIntersect(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },

    pointInRect(p, r, pad) {
        const d = pad || 0;
        return p.x >= r.x - d && p.x <= r.x + r.w + d && p.y >= r.y - d && p.y <= r.y + r.h + d;
    },

    distToSegment(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let tt = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
        tt = Math.max(0, Math.min(1, tt));
        return Math.hypot(p.x - (a.x + tt * dx), p.y - (a.y + tt * dy));
    },

    distToPolyline(p, pts) {
        if (!pts.length) return Infinity;
        if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
        let best = Infinity;
        for (let i = 1; i < pts.length; i++) {
            const d = this.distToSegment(p, pts[i - 1], pts[i]);
            if (d < best) best = d;
        }
        return best;
    },

    // Interpolação de retângulos (câmera)
    lerpRect(a, b, f) {
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f };
    },

    // Encaixa src (w,h) em dst mantendo proporção. mode 'contain' (barras) | 'cover' (corta)
    fitRect(srcW, srcH, dstW, dstH, mode) {
        const scale = mode === 'cover' ? Math.max(dstW / srcW, dstH / srcH) : Math.min(dstW / srcW, dstH / srcH);
        const w = srcW * scale, h = srcH * scale;
        return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h, scale };
    },

    // Caminho suave por pontos médios (curvas quadráticas) — usado por caneta/apagador/marca-texto
    tracePath(ctx, pts) {
        if (!pts.length) return;
        ctx.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) { ctx.lineTo(pts[0].x + 0.01, pts[0].y); return; }
        if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2;
            const my = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
    },

    // Contorno (polígono) de traço com pressão via perfect-freehand → Path2D preenchível
    pressureOutline(pts, size, opts) {
        const pf = window.PerfectFreehand;
        if (!pf || typeof pf.getStroke !== 'function') return null;
        const real = this.hasPressure(pts);
        const input = pts.map((p) => [p.x, p.y, typeof p.p === 'number' ? p.p : 0.5]);
        const outline = pf.getStroke(input, {
            size: size * 1.6,
            thinning: 0.6,
            smoothing: 0.5,
            streamline: 0.35,
            simulatePressure: !real,
            last: !opts || opts.last !== false
        });
        if (!outline.length) return null;
        const path = new Path2D();
        path.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
            const a = outline[i];
            const b = outline[(i + 1) % outline.length];
            path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        }
        path.closePath();
        return path;
    },

    translatePoints(points, dx, dy) {
        return points.map((p) => Object.assign({}, p, { x: p.x + dx, y: p.y + dy }));
    },

    scalePoints(points, origin, sx, sy) {
        return points.map((p) => Object.assign({}, p, { x: origin.x + (p.x - origin.x) * sx, y: origin.y + (p.y - origin.y) * sy }));
    },

    // Simplificação Ramer–Douglas–Peucker preservando t/p (reduz traços enormes sem perder forma)
    simplify(points, epsilon) {
        if (points.length < 3) return points;
        const keep = new Uint8Array(points.length);
        keep[0] = keep[points.length - 1] = 1;
        const stack = [[0, points.length - 1]];
        while (stack.length) {
            const [s, e] = stack.pop();
            let maxD = 0, idx = -1;
            for (let i = s + 1; i < e; i++) {
                const d = this.distToSegment(points[i], points[s], points[e]);
                if (d > maxD) { maxD = d; idx = i; }
            }
            if (maxD > epsilon && idx > 0) {
                keep[idx] = 1;
                stack.push([s, idx], [idx, e]);
            }
        }
        return points.filter((_, i) => keep[i]);
    }
};
