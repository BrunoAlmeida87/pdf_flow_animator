// TimelinePro — timeline multi-track.
// Itens referenciam os objetos reais (item.data é a própria action/comentário/clipe) — edição
// e deleção agem por referência/id estável, nunca por índice. Cada camada de itens que se
// sobrepõem no tempo ganha sua própria lane (sem cobrir uns aos outros).
// Eventos usam delegação no container (o DOM dos itens é recriado a cada refresh).

class TimelinePro {
    constructor(flowAnimator) {
        this.animator = flowAnimator;
        this.zoom = 1.0;
        this.pixelsPerSecond = 100;
        // Tracks fixas; as opcionais só aparecem quando têm itens ou a ferramenta delas está ativa
        this.tracks = [
            { id: 'draw', type: 'draw', icon: 'i-pen', items: [], locked: false, visible: true },
            { id: 'erase', type: 'erase', icon: 'i-eraser', items: [], locked: false, visible: true },
            { id: 'laser', type: 'laser', icon: 'i-laser', items: [], locked: false, visible: true, optional: ['laser'] },
            { id: 'comment', type: 'comment', icon: 'i-comment', items: [], locked: false, visible: true },
            { id: 'effect', type: 'effect', icon: 'i-spotlight', items: [], locked: false, visible: true, optional: ['spotlight', 'redact'] },
            { id: 'camera', type: 'camera', icon: 'i-camera', items: [], locked: false, visible: true, optional: ['camera'] },
            { id: 'audio', type: 'audio', icon: 'i-volume', items: [], locked: false, visible: true, optional: [] }
        ];
        this.isDragging = false;
        this.isResizing = false;
        this._itemById = new Map();
        this._peaksCache = new Map();

        this.setupTimeline();
        this.bindEvents();
    }

    // ─── Montagem ──────────────────────────────────────────────────────────

    setupTimeline(force) {
        // updateTrackItems PRIMEIRO: os headers dependem dos itens atualizados (contagem,
        // badge de paralelo) — já houve bug com os headers uma rodada atrasados.
        this.updateTrackItems();
        this.renderTrackHeaders();
        this.renderRuler();
        this.renderTracks(force);
        this.updatePlayhead(true);
    }

    refresh(force) {
        this.setupTimeline(force);
    }

    trackName(track) {
        return t('track_' + track.type);
    }

    // Track exibida? (opcionais: só com itens, ferramenta ativa ou narração em andamento)
    _isTrackShown(track) {
        if (!track.optional) return true;
        if (track.items.length) return true;
        if (track.type === 'audio') return !!(this.animator._narration || this.animator._micSession);
        return track.optional.includes(this.animator.mode);
    }

    _shownTracks() {
        return this.tracks.filter((tr) => this._isTrackShown(tr));
    }

    isTypeVisible(type) {
        const track = this.tracks.find((tr) => tr.type === type);
        return !track || track.visible !== false;
    }

    isTrackLocked(type) {
        const track = this.tracks.find((tr) => tr.type === type);
        return !!(track && track.locked);
    }

    updateTrackItems() {
        this.tracks.forEach((tr) => { tr.items = []; });
        this._itemById = new Map();
        const a = this.animator;
        a._ensureIds();
        const add = (kind, data, index) => {
            const type = a._trackTypeOf(kind, data);
            const track = this.tracks.find((tr) => tr.type === type);
            if (!track) return;
            const item = {
                id: data.id,
                kind,
                type,
                startTime: FlowAnimator.itemStart(kind, data),
                duration: FlowAnimator.itemDuration(kind, data),
                data,
                index
            };
            track.items.push(item);
            this._itemById.set(item.id, item);
        };
        a.actions.forEach((d, i) => add('action', d, i));
        a.comments.forEach((d, i) => add('comment', d, i));
        a.cameraMoves.forEach((d, i) => add('camera', d, i));
        a.audioClips.forEach((d, i) => add('audio', d, i));
        this.tracks.forEach((tr) => tr.items.sort((x, y) => x.startTime - y.startTime));
    }

    // Sweep-line: há sobreposição temporal real entre itens desta track?
    // (fins ordenados antes de inícios em empates, para não contar "encostado" como paralelo)
    checkParallelActions(track) {
        return this.getParallelActionsCount(track) > 1;
    }

    getParallelActionsCount(track) {
        const pts = [];
        for (const it of track.items) {
            pts.push({ time: it.startTime, d: 1 });
            pts.push({ time: it.startTime + it.duration, d: -1 });
        }
        pts.sort((x, y) => x.time - y.time || x.d - y.d);
        let cur = 0, max = 0;
        for (const p of pts) {
            cur += p.d;
            if (cur > max) max = cur;
        }
        return max;
    }

    organizeItemsInLayers(items) {
        const layers = [];
        const sorted = [...items].sort((x, y) => x.startTime - y.startTime);
        for (const item of sorted) {
            let placed = false;
            for (const layer of layers) {
                if (!layer.some((other) => this.itemsOverlap(item, other))) {
                    layer.push(item);
                    placed = true;
                    break;
                }
            }
            if (!placed) layers.push([item]);
        }
        return layers;
    }

    itemsOverlap(a, b) {
        const endA = a.startTime + a.duration;
        const endB = b.startTime + b.duration;
        return !(a.startTime >= endB || b.startTime >= endA);
    }

    // Altura de uma track: uma lane por camada de itens sobrepostos (headers usam a mesma)
    _trackHeight(track) {
        const layers = track.visible === false ? 1 : Math.max(1, this.organizeItemsInLayers(track.items).length);
        return TimelinePro.TRACK_PADDING * 2 + layers * TimelinePro.LANE_HEIGHT;
    }

    renderTrackHeaders() {
        const container = document.getElementById('trackHeaders');
        container.innerHTML = '';
        const corner = document.createElement('div');
        corner.className = 'track-headers-corner';
        container.appendChild(corner);

        for (const track of this._shownTracks()) {
            const parallelCount = this.getParallelActionsCount(track);
            const layerCount = this.organizeItemsInLayers(track.items).length;
            const info = t(track.items.length === 1 ? 'itemsOne' : 'itemsMany', { n: track.items.length }) +
                (parallelCount > 1 ? ' · ' + t('simultaneous', { n: parallelCount }) : '') +
                (layerCount > 1 ? ' · ' + t('layers', { n: layerCount }) : '');
            const name = this.trackName(track);

            const header = document.createElement('div');
            header.className = 'track-header';
            header.dataset.trackId = track.id;
            header.style.height = this._trackHeight(track) + 'px';
            header.innerHTML = `
                <div class="track-info">
                    <div class="track-name" style="color: var(--t-${track.type})">
                        <svg class="icon"><use href="#${track.icon}"/></svg><span class="label"></span>
                        ${parallelCount > 1 ? `<span class="track-parallel-badge" title="${escapeHtml(t('parallelBadge'))}">⚡<span class="sr-only">${escapeHtml(t('parallelBadge'))}</span></span>` : ''}
                    </div>
                    <div class="track-type"></div>
                </div>
                <div class="track-controls">
                    <button class="track-btn ${track.visible ? 'active' : ''}" data-track="${track.id}" data-action="visibility" aria-pressed="${track.visible}"><svg class="icon"><use href="#i-eye"/></svg></button>
                    <button class="track-btn ${track.locked ? 'active' : ''}" data-track="${track.id}" data-action="lock" aria-pressed="${track.locked}"><svg class="icon"><use href="#i-lock"/></svg></button>
                </div>`;
            header.querySelector('.label').textContent = name;
            const typeEl = header.querySelector('.track-type');
            typeEl.textContent = info;
            typeEl.title = info;
            const vis = header.querySelector('[data-action="visibility"]');
            vis.title = track.type === 'audio' ? t('muteTrack') : t('toggleVisibility');
            vis.setAttribute('aria-label', vis.title + ' — ' + name);
            const lock = header.querySelector('[data-action="lock"]');
            lock.title = t('lockTrack');
            lock.setAttribute('aria-label', lock.title + ' — ' + name);
            container.appendChild(header);
        }
    }

    // ─── Régua ─────────────────────────────────────────────────────────────

    _pps() {
        return this.pixelsPerSecond * this.zoom;
    }

    // Comprimento total desenhado (duração + folga para arrastar itens além do fim)
    _contentSeconds() {
        const total = this.animator.totalAnimationTime;
        const end = Math.max(total, this.animator._lastContentEnd());
        return end + Math.max(3, end * 0.2);
    }

    getTimeInterval() {
        // Intervalo de rótulo com pelo menos ~70px entre rótulos
        const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
        const pps = this._pps();
        return steps.find((s) => s * pps >= 70) || 600;
    }

    renderRuler() {
        const marks = document.getElementById('rulerMarks');
        if (!marks) return;
        const pps = this._pps();
        const seconds = this._contentSeconds();
        const width = seconds * pps;
        const major = this.getTimeInterval();
        const minor = major / (major >= 1 && major % 5 === 0 ? 5 : 2);
        const frag = document.createDocumentFragment();
        const count = Math.ceil(seconds / minor);
        for (let i = 0; i <= count; i++) {
            const time = i * minor;
            const isMajor = Math.abs(time / major - Math.round(time / major)) < 1e-6;
            const x = time * pps;
            const mark = document.createElement('div');
            mark.className = 'ruler-mark' + (isMajor ? ' major' : '');
            mark.style.left = x + 'px';
            frag.appendChild(mark);
            if (isMajor) {
                const label = document.createElement('div');
                label.className = 'ruler-time';
                label.style.left = x + 'px';
                label.textContent = major < 1 ? Util.formatTimePrecise(time) : Util.formatTime(time);
                frag.appendChild(label);
            }
        }
        // Área após o fim (sombreada)
        const end = document.createElement('div');
        end.className = 'ruler-end';
        end.style.left = (this.animator.totalAnimationTime * pps) + 'px';
        end.style.width = Math.max(0, width - this.animator.totalAnimationTime * pps) + 'px';
        frag.appendChild(end);
        // Marcadores
        for (const m of this.animator.markers) {
            const el = document.createElement('div');
            el.className = 'ruler-marker' + (this.animator.isSelected(m.id) ? ' selected' : '');
            el.dataset.markerId = m.id;
            el.style.left = (m.time * pps) + 'px';
            el.textContent = m.label;
            el.title = `${m.label} — ${Util.formatTimePrecise(m.time)}`;
            frag.appendChild(el);
        }
        marks.innerHTML = '';
        marks.style.width = width + 'px';
        marks.appendChild(frag);

        const tracks = document.getElementById('timelineTracks');
        tracks.style.width = width + 'px';
        const grid = document.getElementById('timelineGrid');
        grid.style.width = width + 'px';
        this.renderGrid();
        this.syncRulerScroll();
    }

    renderGrid() {
        const grid = document.getElementById('timelineGrid');
        const pps = this._pps();
        const interval = this.getTimeInterval();
        const seconds = this._contentSeconds();
        const frag = document.createDocumentFragment();
        for (let time = 0; time <= seconds; time += interval) {
            const line = document.createElement('div');
            line.className = 'grid-line';
            line.style.left = (time * pps) + 'px';
            frag.appendChild(line);
        }
        const overflow = document.createElement('div');
        overflow.className = 'timeline-overflow';
        overflow.style.left = (this.animator.totalAnimationTime * pps) + 'px';
        overflow.style.width = Math.max(0, (seconds - this.animator.totalAnimationTime) * pps) + 'px';
        frag.appendChild(overflow);
        grid.innerHTML = '';
        grid.appendChild(frag);
    }

    // ─── Tracks e itens ────────────────────────────────────────────────────

    _signature() {
        const parts = [this.zoom, this.animator.totalAnimationTime, this.animator.mode];
        for (const tr of this._shownTracks()) {
            parts.push(`${tr.id}:${tr.visible}:${tr.locked}`);
            for (const i of tr.items) {
                const d = i.data;
                parts.push(`${i.id},${i.startTime},${i.duration},${d.text || ''},${d.color || ''},${d.name || ''},${d.points ? d.points.length : 0},${d.offset || 0}`);
            }
        }
        parts.push(this.animator._audioBuffers.size);
        return parts.join('|');
    }

    renderTracks(force) {
        const container = document.getElementById('timelineTracks');
        // Além da assinatura textual, compara a IDENTIDADE dos objetos: import/undo SUBSTITUEM
        // os objetos — com a mesma assinatura, o DOM antigo ficaria apontando para objetos velhos.
        const signature = this._signature();
        const datas = [];
        for (const tr of this.tracks) for (const i of tr.items) datas.push(i.data);
        const sameRefs = this._lastItemDatas && datas.length === this._lastItemDatas.length &&
            datas.every((d, idx) => d === this._lastItemDatas[idx]);
        if (!force && signature === this._lastTracksSignature && sameRefs) {
            this.updateSelectionClasses();
            return;
        }
        this._lastTracksSignature = signature;
        this._lastItemDatas = datas;

        const focusedId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.itemId : null;
        container.innerHTML = '';
        const pps = this._pps();

        for (const track of this._shownTracks()) {
            const trackEl = document.createElement('div');
            trackEl.className = 'timeline-track';
            trackEl.dataset.trackId = track.id;
            trackEl.style.height = this._trackHeight(track) + 'px';
            if (track.visible === false) {
                trackEl.classList.add('hidden-track');
                container.appendChild(trackEl);
                continue;
            }
            const layers = this.organizeItemsInLayers(track.items);
            if (layers.length > 1) trackEl.classList.add('has-parallels');
            layers.forEach((layerItems, li) => {
                const layerEl = document.createElement('div');
                layerEl.className = `timeline-layer layer-${li}`;
                layerEl.style.top = (TimelinePro.TRACK_PADDING + li * TimelinePro.LANE_HEIGHT) + 'px';
                layerEl.style.height = TimelinePro.LANE_HEIGHT + 'px';
                for (const item of layerItems) layerEl.appendChild(this.createTimelineItem(item, track, track.items.indexOf(item)));
                trackEl.appendChild(layerEl);
            });
            container.appendChild(trackEl);
        }

        const line = document.createElement('div');
        line.className = 'timeline-playhead-line';
        line.id = 'playheadLine';
        container.appendChild(line);
        container.style.width = (this._contentSeconds() * pps) + 'px';

        this.updateSelectionClasses();
        this.updatePlayhead(true);
        if (focusedId) {
            const el = container.querySelector(`[data-item-id="${CSS.escape(focusedId)}"]`);
            if (el) el.focus({ preventScroll: true });
        }
    }

    _itemTitle(item, index) {
        const d = item.data;
        const n = index + 1;
        if (item.kind === 'comment') {
            if (d.kind === 'badge') return '#' + d.text;
            const text = String(d.text || '').replace(/\s+/g, ' ');
            return text.length > 24 ? text.slice(0, 24) + '…' : text;
        }
        if (item.kind === 'camera') return t('cameraN', { n });
        if (item.kind === 'audio') return d.name || t('audio');
        if (d.type === 'erase') return t('eraseN', { n });
        if (d.type === 'laser') return t('laserN', { n });
        if (d.type === 'spotlight') return t('spotlightN', { n });
        if (d.type === 'redact') return t('redactN', { n });
        if (d.shape) return t('shape_' + d.shape) + ' ' + n;
        if (d.tool === 'highlighter') return t('highlighterN', { n });
        return t('strokeN', { n });
    }

    createTimelineItem(item, track, index) {
        const pps = this._pps();
        const el = document.createElement('div');
        el.className = 'timeline-item ' + item.type;
        el.dataset.itemId = item.id;
        el.dataset.trackId = track.id;
        el.dataset.index = index;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.style.left = (item.startTime * pps) + 'px';
        el.style.width = Math.max(6, item.duration * pps) + 'px';
        if (item.duration * pps < 64) el.classList.add('narrow');
        const d = item.data;
        if (item.kind === 'action' && d.color && d.type !== 'erase') el.style.borderLeftColor = d.color;
        if (item.kind === 'comment' && d.borderColor) el.style.borderLeftColor = d.borderColor;

        const title = this._itemTitle(item, index);
        const dur = Util.num(item.duration, 1) + 's';
        el.setAttribute('aria-label', `${title} — ${Util.num(item.startTime, 1)}s, ${dur}`);
        el.title = `${title}\n${t('starts')}: ${Util.formatTimePrecise(item.startTime)} · ${t('duration')}: ${dur}`;

        if (item.kind === 'audio') {
            const wave = document.createElement('canvas');
            wave.className = 'timeline-item-wave';
            el.appendChild(wave);
            requestAnimationFrame(() => this._drawWaveform(wave, d, Math.max(6, item.duration * pps)));
        } else {
            const thumb = document.createElement('canvas');
            thumb.className = 'timeline-item-thumb';
            this.animator.drawItemThumb(thumb, item.kind, d);
            el.appendChild(thumb);
        }
        const content = document.createElement('div');
        content.className = 'timeline-item-content';
        const titleEl = document.createElement('div');
        titleEl.className = 'timeline-item-title';
        titleEl.textContent = title; // textContent: texto de comentário nunca vira HTML (XSS)
        const durEl = document.createElement('div');
        durEl.className = 'timeline-item-duration';
        durEl.textContent = dur;
        content.append(titleEl, durEl);
        el.appendChild(content);

        const left = document.createElement('div');
        left.className = 'timeline-item-resize left';
        const right = document.createElement('div');
        right.className = 'timeline-item-resize right';
        const del = document.createElement('button');
        del.className = 'timeline-item-delete';
        del.tabIndex = -1;
        del.textContent = '×';
        del.title = t('deleteItem');
        del.setAttribute('aria-label', t('deleteItem'));
        el.append(left, right, del);
        return el;
    }

    _drawWaveform(canvas, clip, widthPx) {
        const buffer = this.animator._audioBuffers.get(clip.assetId);
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(widthPx));
        const h = Math.max(1, canvas.clientHeight || 30);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        if (!buffer) return;
        const buckets = Math.max(1, Math.floor(w / 2));
        const key = `${clip.assetId}|${clip.offset}|${clip.duration}|${buckets}`;
        let peaks = this._peaksCache.get(key);
        if (!peaks) {
            const rate = buffer.sampleRate;
            const start = Math.floor((clip.offset || 0) * rate);
            const end = Math.min(buffer.length, Math.floor(((clip.offset || 0) + clip.duration) * rate));
            const data = buffer.getChannelData(0);
            peaks = new Float32Array(buckets);
            const size = Math.max(1, (end - start) / buckets);
            for (let i = 0; i < buckets; i++) {
                const s = start + Math.floor(i * size), e = Math.min(end, start + Math.floor((i + 1) * size));
                let max = 0;
                const stride = Math.max(1, Math.floor((e - s) / 64));
                for (let j = s; j < e; j += stride) { const v = Math.abs(data[j]); if (v > max) max = v; }
                peaks[i] = max;
            }
            if (this._peaksCache.size > 200) this._peaksCache.clear();
            this._peaksCache.set(key, peaks);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < peaks.length; i++) {
            const bh = Math.max(1, peaks[i] * h);
            ctx.fillRect(i * 2, (h - bh) / 2, 1.4, bh);
        }
    }

    updateSelectionClasses() {
        const sel = this.animator.selection;
        document.querySelectorAll('#timelineTracks .timeline-item').forEach((el) => {
            el.classList.toggle('selected', sel.has(el.dataset.itemId));
        });
        document.querySelectorAll('#rulerMarks .ruler-marker').forEach((el) => {
            el.classList.toggle('selected', sel.has(el.dataset.markerId));
        });
    }

    getItemData(itemId) {
        return this._itemById.get(itemId) || null;
    }

    // ─── Playhead e scroll ─────────────────────────────────────────────────

    updatePlayhead(noAutoScroll) {
        const playhead = document.getElementById('playhead');
        const scrollable = document.getElementById('timelineScrollable');
        if (!playhead || !scrollable) return;
        const x = this.animator.currentTime() * this._pps();

        // Auto-scroll — suprimido por alguns segundos após o usuário rolar manualmente
        const userScrolling = this._userScrollUntil && Date.now() < this._userScrollUntil;
        if (!noAutoScroll && !userScrolling && !this._scrubbing) {
            const viewWidth = scrollable.clientWidth;
            if (x > scrollable.scrollLeft + viewWidth - 60) scrollable.scrollLeft = x - viewWidth * 0.25;
            else if (x < scrollable.scrollLeft) scrollable.scrollLeft = Math.max(0, x - 40);
        }
        // O playhead da régua não rola com as tracks — compensa o scroll
        playhead.style.left = (x - scrollable.scrollLeft) + 'px';
        const line = document.getElementById('playheadLine');
        if (line) line.style.left = x + 'px';
    }

    // Mantém as marcas da régua alinhadas com o scroll horizontal das tracks
    syncRulerScroll() {
        const scrollable = document.getElementById('timelineScrollable');
        const marks = document.getElementById('rulerMarks');
        if (!scrollable || !marks) return;
        marks.style.transform = `translateX(${-scrollable.scrollLeft}px)`;
        const playhead = document.getElementById('playhead');
        playhead.style.left = (this.animator.currentTime() * this._pps() - scrollable.scrollLeft) + 'px';
    }

    formatTime(seconds) {
        return this.animator.formatTime(seconds);
    }

    // ─── Zoom ──────────────────────────────────────────────────────────────

    setZoom(z, anchorClientX) {
        const scrollable = document.getElementById('timelineScrollable');
        const rect = scrollable.getBoundingClientRect();
        const ax = anchorClientX != null ? anchorClientX - rect.left : rect.width / 2;
        const timeAtAnchor = (scrollable.scrollLeft + ax) / this._pps();
        this.zoom = Util.clamp(z, 0.05, 20);
        this.updateZoom();
        scrollable.scrollLeft = Math.max(0, timeAtAnchor * this._pps() - ax);
        this.syncRulerScroll();
    }

    zoomIn() { this.setZoom(this.zoom * 1.25); }
    zoomOut() { this.setZoom(this.zoom / 1.25); }

    fitToContent() {
        const scrollable = document.getElementById('timelineScrollable');
        const seconds = Math.max(1, Math.max(this.animator.totalAnimationTime, this.animator._lastContentEnd()));
        this.zoom = Util.clamp((scrollable.clientWidth - 30) / (seconds * this.pixelsPerSecond), 0.05, 20);
        this.updateZoom();
        scrollable.scrollLeft = 0;
    }

    updateZoom() {
        document.getElementById('timelineZoom').textContent = Math.round(this.zoom * 100) + '%';
        this.renderRuler();
        this.renderTracks(true);
        this.updatePlayhead(true);
    }

    // ─── Eventos ───────────────────────────────────────────────────────────

    bindEvents() {
        document.getElementById('trackHeaders').addEventListener('click', (e) => {
            const btn = e.target.closest('.track-btn');
            if (!btn) return;
            const track = this.tracks.find((tr) => tr.id === btn.dataset.track);
            if (!track) return;
            if (btn.dataset.action === 'visibility') {
                track.visible = !track.visible;
                // Ocultar de verdade: some da timeline, do canvas, da animação e do export
                this.animator.invalidateRenderCaches();
                this.animator.rebuildDrawingCanvas();
                this.animator.redrawMainCanvas();
                if (track.type === 'audio' && this.animator.isPlaying) {
                    if (track.visible) this.animator._startAudio(); else this.animator.audio.stop();
                }
                this.animator.showTooltip(track.visible ? t('trackShown', { name: this.trackName(track) }) : t('trackHidden', { name: this.trackName(track) }));
            } else if (btn.dataset.action === 'lock') {
                track.locked = !track.locked;
                this.animator.showTooltip(track.locked ? t('trackLocked', { name: this.trackName(track) }) : t('trackUnlocked', { name: this.trackName(track) }));
            }
            this.renderTrackHeaders();
            this.renderTracks(true);
        });

        // Régua: clique/arrasto posiciona a agulha (scrub com prévia ao vivo); marcadores arrastáveis
        const ruler = document.getElementById('timelineRuler');
        ruler.addEventListener('pointerdown', (e) => this._onRulerDown(e));
        ruler.addEventListener('pointermove', (e) => this._onRulerMove(e));
        ruler.addEventListener('pointerup', (e) => this._onRulerUp(e));
        ruler.addEventListener('pointercancel', (e) => this._onRulerUp(e));
        ruler.addEventListener('dblclick', (e) => {
            const mk = e.target.closest('.ruler-marker');
            if (mk) this.animator.renameMarker(mk.dataset.markerId);
        });

        const scrollable = document.getElementById('timelineScrollable');
        scrollable.addEventListener('scroll', () => {
            this.syncRulerScroll();
            document.getElementById('trackHeaders').scrollTop = scrollable.scrollTop;
        });
        scrollable.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.002), e.clientX);
                return;
            }
            this._userScrollUntil = Date.now() + 2000;
        }, { passive: false });
        document.getElementById('trackHeaders').addEventListener('wheel', (e) => {
            scrollable.scrollTop += e.deltaY;
        }, { passive: true });

        const tracks = document.getElementById('timelineTracks');
        tracks.addEventListener('pointerdown', (e) => this._onTracksDown(e));
        tracks.addEventListener('pointermove', (e) => this._onTracksMove(e));
        tracks.addEventListener('pointerup', (e) => this._onTracksUp(e));
        tracks.addEventListener('pointercancel', (e) => this._onTracksUp(e, true));
        tracks.addEventListener('click', (e) => {
            const del = e.target.closest('.timeline-item-delete');
            if (!del) return;
            e.stopPropagation();
            const item = this.getItemData(del.closest('.timeline-item').dataset.itemId);
            if (item) this.deleteTimelineItem(item);
        });
        tracks.addEventListener('dblclick', (e) => {
            const el = e.target.closest('.timeline-item');
            if (!el) return;
            const item = this.getItemData(el.dataset.itemId);
            if (item) this.focusOnItem(item);
        });
        tracks.addEventListener('keydown', (e) => {
            const el = e.target.closest('.timeline-item');
            if (!el) return;
            const item = this.getItemData(el.dataset.itemId);
            if (!item) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();
                this.deleteTimelineItem(item);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                this.nudgeItem(item, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1.0 : 0.1));
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                this.focusOnItem(item);
            }
        });
    }

    _timeAtClientX(clientX) {
        const scrollable = document.getElementById('timelineScrollable');
        const rect = scrollable.getBoundingClientRect();
        return Math.max(0, (clientX - rect.left + scrollable.scrollLeft) / this._pps());
    }

    _onRulerDown(e) {
        if (e.button !== 0) return;
        const ruler = e.currentTarget;
        ruler.setPointerCapture(e.pointerId);
        const mk = e.target.closest('.ruler-marker');
        if (mk) {
            const m = this.animator.markers.find((x) => x.id === mk.dataset.markerId);
            if (!m) return;
            this.animator.setSelection([m.id], e.shiftKey);
            this._rulerGesture = { kind: 'marker', marker: m, x0: e.clientX, t0: m.time, snapshot: false };
            return;
        }
        this._scrubbing = true;
        this._rulerGesture = { kind: 'scrub' };
        this.animator.seekTo(this._timeAtClientX(e.clientX), { noAutoScroll: true });
    }

    _onRulerMove(e) {
        const g = this._rulerGesture;
        if (!g) return;
        if (g.kind === 'scrub') {
            this.animator.seekTo(this._timeAtClientX(e.clientX), { noAutoScroll: true });
        } else if (g.kind === 'marker') {
            if (!g.snapshot && Math.abs(e.clientX - g.x0) > 2) { g.snapshot = true; this.animator.saveUndoState(); }
            if (!g.snapshot) return;
            let time = Math.max(0, g.t0 + (e.clientX - g.x0) / this._pps());
            if (!e.shiftKey) time = Math.round(time * 10) / 10;
            g.marker.time = time;
            const el = document.querySelector(`.ruler-marker[data-marker-id="${CSS.escape(g.marker.id)}"]`);
            if (el) el.style.left = (time * this._pps()) + 'px';
            DragHint.show(Util.formatTimePrecise(time), e.clientX, e.clientY);
        }
    }

    _onRulerUp() {
        const g = this._rulerGesture;
        this._rulerGesture = null;
        this._scrubbing = false;
        DragHint.hide();
        if (g && g.kind === 'marker' && g.snapshot) {
            this.animator.markers.sort((a, b) => a.time - b.time);
            this.animator._afterContentChange();
        }
    }

    // Arrastar/redimensionar itens, marquee, clique no vazio = posicionar a agulha
    _onTracksDown(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.timeline-item-delete')) return;
        const tracksEl = document.getElementById('timelineTracks');
        const el = e.target.closest('.timeline-item');
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;

        if (!el) {
            tracksEl.setPointerCapture(e.pointerId);
            const rect = tracksEl.getBoundingClientRect();
            this._trackGesture = { kind: 'marquee', x0: e.clientX - rect.left, y0: e.clientY - rect.top, cx: e.clientX, cy: e.clientY, additive, moved: false };
            return;
        }

        const item = this.getItemData(el.dataset.itemId);
        if (!item) return;
        e.preventDefault();
        el.focus({ preventScroll: true });
        if (additive) {
            this.animator.toggleSelection(item.id);
        } else if (!this.animator.isSelected(item.id)) {
            this.animator.setSelection([item.id]);
        }
        if (this.isTrackLocked(item.type)) {
            this.animator.showTooltip(t('trackLockedMove'));
            return;
        }
        tracksEl.setPointerCapture(e.pointerId);
        const isResize = e.target.classList.contains('timeline-item-resize');
        if (isResize) {
            const d = item.data;
            this.isResizing = true;
            this._trackGesture = {
                kind: 'resize', item, el, dir: e.target.classList.contains('left') ? 'left' : 'right',
                x0: e.clientX, start: item.startTime, dur: item.duration, offset: d.offset || 0, snapshot: false
            };
        } else {
            const selected = Array.from(this.animator.selection).map((id) => this._itemById.get(id))
                .filter((it) => it && !this.isTrackLocked(it.type));
            if (!selected.includes(item)) selected.push(item);
            this.isDragging = true;
            this.draggedItem = el;
            this._trackGesture = {
                kind: 'drag', item, el, x0: e.clientX, items: selected.map((it) => ({ it, start: it.startTime })), snapshot: false
            };
        }
    }

    _onTracksMove(e) {
        const g = this._trackGesture;
        if (!g) return;
        const pps = this._pps();
        if (g.kind === 'marquee') {
            if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 4) return;
            g.moved = true;
            const tracksEl = document.getElementById('timelineTracks');
            const rect = tracksEl.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            let box = document.getElementById('timelineMarquee');
            if (!box) {
                box = document.createElement('div');
                box.id = 'timelineMarquee';
                box.className = 'marquee';
                tracksEl.appendChild(box);
            }
            const r = { x: Math.min(x, g.x0), y: Math.min(y, g.y0), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
            Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
            g.rect = r;
            return;
        }

        const dxTime = (e.clientX - g.x0) / pps;
        if (!g.snapshot) {
            if (Math.abs(e.clientX - g.x0) < 2) return;
            g.snapshot = true;
            this.animator.saveUndoState(); // mover/redimensionar é desfazível
            g.el.classList.add('dragging');
        }

        if (g.kind === 'drag') {
            const main = g.items.find((x) => x.it === g.item);
            let newStart = Math.max(0, main.start + dxTime);
            let snapEdge = null;
            if (!e.shiftKey) {
                const snapped = this._snapTime(newStart, g.item.duration, g.items.map((x) => x.it.id));
                newStart = snapped.time;
                snapEdge = snapped.edge;
            }
            const delta = newStart - main.start;
            for (const { it, start } of g.items) {
                const v = Math.max(0, start + delta);
                it.startTime = v;
                FlowAnimator.setItemStart(it.kind, it.data, v);
                const node = document.querySelector(`#timelineTracks [data-item-id="${CSS.escape(it.id)}"]`);
                if (node) node.style.left = (v * pps) + 'px';
            }
            this._showSnapGuide(snapEdge);
            DragHint.show(`${Util.formatTimePrecise(newStart)}  (${delta >= 0 ? '+' : ''}${Util.num(delta, 1)}s)`, e.clientX, e.clientY);
        } else if (g.kind === 'resize') {
            const it = g.item;
            const d = it.data;
            const maxAudio = it.kind === 'audio' ? this._audioMax(d) : Infinity;
            if (g.dir === 'right') {
                let end = g.start + g.dur + dxTime;
                let edge = null;
                if (!e.shiftKey) { const s = this._snapEdge(end, [it.id]); end = s.time; edge = s.edge; }
                let dur = Math.max(0.1, end - g.start);
                if (it.kind === 'audio') dur = Math.min(dur, maxAudio - g.offset);
                d.duration = dur;
                it.duration = dur;
                this._showSnapGuide(edge);
            } else {
                const end = g.start + g.dur;
                let start = g.start + dxTime;
                let edge = null;
                if (!e.shiftKey) { const s = this._snapEdge(start, [it.id]); start = s.time; edge = s.edge; }
                start = Util.clamp(start, 0, end - 0.1);
                if (it.kind === 'audio') start = Math.max(start, g.start - g.offset);
                FlowAnimator.setItemStart(it.kind, d, start);
                d.duration = end - start;
                if (it.kind === 'audio') d.offset = Math.max(0, g.offset + (start - g.start));
                it.startTime = start;
                it.duration = d.duration;
                this._showSnapGuide(edge);
            }
            g.el.style.left = (it.startTime * pps) + 'px';
            g.el.style.width = Math.max(6, it.duration * pps) + 'px';
            DragHint.show(`${t('starts')} ${Util.formatTimePrecise(it.startTime)} · ${Util.num(it.duration, 1)}s`, e.clientX, e.clientY);
        }
    }

    _audioMax(clip) {
        const buffer = this.animator._audioBuffers.get(clip.assetId);
        return buffer ? buffer.duration : Infinity;
    }

    _onTracksUp(e, cancelled) {
        const g = this._trackGesture;
        this._trackGesture = null;
        this.isDragging = false;
        this.isResizing = false;
        this.draggedItem = null;
        DragHint.hide();
        this._showSnapGuide(null);
        if (!g) return;

        if (g.kind === 'marquee') {
            const box = document.getElementById('timelineMarquee');
            if (box) box.remove();
            if (!g.moved) {
                if (!g.additive) this.animator.clearSelection();
                this.animator.seekTo(this._timeAtClientX(e.clientX), { noAutoScroll: true });
                return;
            }
            const tracksEl = document.getElementById('timelineTracks');
            const base = tracksEl.getBoundingClientRect();
            const r = g.rect;
            const ids = [];
            tracksEl.querySelectorAll('.timeline-item').forEach((el) => {
                const b = el.getBoundingClientRect();
                const x = b.left - base.left, y = b.top - base.top;
                if (x < r.x + r.w && x + b.width > r.x && y < r.y + r.h && y + b.height > r.y) ids.push(el.dataset.itemId);
            });
            this.animator.setSelection(ids, g.additive);
            return;
        }

        if (!g.snapshot || cancelled) return;
        // Conteúdo além do fim estende a duração total automaticamente
        const end = this.animator._lastContentEnd();
        if (end > this.animator.totalAnimationTime) {
            this.animator.setTotalDuration(Math.ceil(end + 0.5), true);
            this.animator.showTooltip(t('durationExtended', { s: Util.num(this.animator.totalAnimationTime, 1) }));
        }
        this.animator._afterContentChange();
    }

    _showSnapGuide(time) {
        let guide = document.getElementById('snapGuide');
        if (time == null) { if (guide) guide.style.display = 'none'; return; }
        const tracks = document.getElementById('timelineTracks');
        if (!guide) {
            guide = document.createElement('div');
            guide.id = 'snapGuide';
            guide.className = 'snap-guide';
            tracks.appendChild(guide);
        } else if (guide.parentNode !== tracks) {
            tracks.appendChild(guide);
        }
        guide.style.display = 'block';
        guide.style.left = (time * this._pps()) + 'px';
    }

    // Candidatos de snap: bordas de outros itens (todas as tracks), agulha, marcadores, 0
    _snapCandidates(excludeIds) {
        const out = [0, this.animator.currentTime()];
        for (const [id, it] of this._itemById) {
            if (excludeIds.includes(id)) continue;
            out.push(it.startTime, it.startTime + it.duration);
        }
        for (const m of this.animator.markers) out.push(m.time);
        return out;
    }

    // Snap de um ponto no tempo (borda de resize)
    _snapEdge(time, excludeIds) {
        const threshold = 10 / this._pps();
        let best = time, bestD = threshold, edge = null;
        for (const c of this._snapCandidates(excludeIds)) {
            const d = Math.abs(c - time);
            if (d < bestD) { best = c; bestD = d; edge = c; }
        }
        if (edge === null) {
            const grid = Math.round(time * 2) / 2;
            if (Math.abs(grid - time) < threshold) best = grid;
        }
        return { time: best, edge };
    }

    // Snap do início de um item ao mover (início OU fim alinhados a bordas; senão grade de 0,5s).
    // Shift desativa. Retorna { time, edge } (edge = posição da guia, se encaixou numa borda).
    _snapTime(rawTime, itemDuration, excludeIds) {
        const threshold = 10 / this._pps();
        let best = rawTime, bestD = threshold, edge = null;
        for (const c of this._snapCandidates(Array.isArray(excludeIds) ? excludeIds : [excludeIds])) {
            for (const [cand, e] of [[c, c], [c - itemDuration, c]]) {
                const d = Math.abs(cand - rawTime);
                if (cand >= 0 && d < bestD) { best = cand; bestD = d; edge = e; }
            }
        }
        if (edge === null) {
            const g1 = Math.round(rawTime * 2) / 2;
            const g2 = Math.round((rawTime + itemDuration) * 2) / 2 - itemDuration;
            const c = Math.abs(g1 - rawTime) <= Math.abs(g2 - rawTime) ? g1 : g2;
            if (c >= 0 && Math.abs(c - rawTime) < threshold) best = c;
        }
        return { time: Math.max(0, best), edge };
    }

    // ─── Ações sobre itens ─────────────────────────────────────────────────

    // Exclui (sem confirmação: aviso com "Desfazer"); track travada bloqueia
    async deleteTimelineItem(item) {
        if (this.isTrackLocked(item.type)) {
            this.animator.showTooltip(t('trackLockedDelete'));
            return false;
        }
        return this.animator.deleteItems([{ kind: item.kind, obj: item.data }]);
    }

    // Desloca um item no tempo via teclado. Snapshot de undo só na primeira batida de uma
    // sequência (não inunda a pilha ao segurar a tecla).
    nudgeItem(item, deltaSeconds) {
        if (this.isTrackLocked(item.type)) {
            this.animator.showTooltip(t('trackLockedMove'));
            return;
        }
        const now = Date.now();
        if (!this._lastNudgeAt || now - this._lastNudgeAt > 800) this.animator.saveUndoState();
        this._lastNudgeAt = now;
        const v = Math.max(0, FlowAnimator.itemStart(item.kind, item.data) + deltaSeconds);
        FlowAnimator.setItemStart(item.kind, item.data, Math.round(v * 1000) / 1000);
        this.animator._afterContentChange();
        const el = document.querySelector(`#timelineTracks [data-item-id="${CSS.escape(item.id)}"]`);
        if (el) el.focus();
        this.animator.showTooltip(`⏰ ${Util.num(v, 1)}s`);
    }

    // Leva a agulha até o item e o seleciona
    focusOnItem(item) {
        if (!item || !item.data) return;
        this.animator.setSelection([item.id]);
        this.animator.seekTo(FlowAnimator.itemStart(item.kind, item.data));
        const el = document.querySelector(`#timelineTracks [data-item-id="${CSS.escape(item.id)}"]`);
        if (el) {
            el.classList.add('cycle-highlight');
            setTimeout(() => el.classList.remove('cycle-highlight'), 700);
        }
    }
}

// Geometria das lanes (px): cada camada de itens sobrepostos ganha sua própria linha
TimelinePro.LANE_HEIGHT = 40;
TimelinePro.TRACK_PADDING = 4;
