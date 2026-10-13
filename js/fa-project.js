// Projeto do FlowAnimator: formato v2 (multi-cena + assets), validação de import, salvamento
// automático em IndexedDB, salvamento rápido em localStorage, diálogos de projetos/cenas,
// estado vazio e projeto de exemplo.

// ─── Esquema / validação ───────────────────────────────────────────────────
// Todo dado importado (JSON, localStorage, IndexedDB) passa por aqui: números finitos e
// limitados, enums em whitelist, cores validadas, strings com tamanho máximo, ids únicos.
// Um JSON malformado não pode mais quebrar a renderização a cada frame.

const ProjectSchema = {
    VERSION: '2.0',
    FONTS: ['Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact'],
    ANIM_IN: ['none', 'fade', 'pop', 'slide', 'typewriter'],
    ANIM_OUT: ['none', 'fade', 'pop'],
    MAX_POINTS: 50000,

    num(v, min, max, fallback) {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        return (typeof n === 'number' && isFinite(n)) ? Util.clamp(n, min, max) : fallback;
    },

    str(v, max) {
        return v == null ? '' : String(v).slice(0, max);
    },

    oneOf(v, list, fallback) {
        return list.includes(v) ? v : fallback;
    },

    id(v, prefix, seen) {
        let id = (typeof v === 'string' && /^[\w-]{1,64}$/.test(v)) ? v : Util.uid(prefix);
        if (seen) {
            while (seen.has(id)) id = Util.uid(prefix);
            seen.add(id);
        }
        return id;
    },

    rect(r) {
        if (!r || typeof r !== 'object') return null;
        const x = this.num(r.x, -1e5, 1e5, null), y = this.num(r.y, -1e5, 1e5, null);
        const w = this.num(r.w, 0, 1e5, null), h = this.num(r.h, 0, 1e5, null);
        if (x === null || y === null || !w || !h) return null;
        return { x, y, w, h };
    },

    points(arr) {
        if (!Array.isArray(arr)) return null;
        const out = [];
        for (const p of arr.slice(0, this.MAX_POINTS)) {
            if (!p || typeof p !== 'object') continue;
            const x = this.num(p.x, -1e5, 1e5, null), y = this.num(p.y, -1e5, 1e5, null);
            if (x === null || y === null) continue;
            const q = { x, y };
            const tt = this.num(p.t, 0, 36000, null);
            if (tt !== null) q.t = tt;
            const pr = this.num(p.p, 0, 1, null);
            if (pr !== null) q.p = pr;
            out.push(q);
        }
        // Tempos precisam ser crescentes; se não forem, descarta (cai no ritmo por comprimento)
        for (let i = 1; i < out.length; i++) {
            if (out[i].t == null || out[i - 1].t == null || out[i].t < out[i - 1].t) {
                out.forEach((q) => { delete q.t; });
                break;
            }
        }
        return out.length ? out : null;
    },

    timing(o, defDuration) {
        return {
            startTime: this.num(o.startTime, 0, 36000, 0),
            duration: this.num(o.duration, 0.05, 3600, defDuration)
        };
    },

    action(a, seen) {
        if (!a || typeof a !== 'object') return null;
        const type = this.oneOf(a.type, ['draw', 'erase', 'laser', 'spotlight', 'redact'], null);
        if (!type) return null;
        const base = Object.assign({ id: this.id(a.id, 'a', seen), type }, this.timing(a, 2));
        if (a.easing && Util.EASINGS[a.easing]) base.easing = a.easing;
        if (typeof a.timestamp === 'number' && isFinite(a.timestamp)) base.timestamp = a.timestamp;
        if (type === 'spotlight' || type === 'redact') {
            const rect = this.rect(a.rect);
            if (!rect) return null;
            base.rect = rect;
            if (type === 'spotlight') {
                base.dim = this.num(a.dim, 0, 1, 0.6);
                base.shape = this.oneOf(a.shape, ['rect', 'ellipse'], 'rect');
            } else {
                base.mode = this.oneOf(a.mode, ['pixelate', 'blur', 'solid'], 'pixelate');
            }
            return base;
        }
        const pts = this.points(a.points);
        if (!pts) return null;
        base.points = pts;
        if (type === 'erase') {
            base.size = this.num(a.size, 1, 500, 20);
            return base;
        }
        base.color = Util.safeColor(a.color, type === 'laser' ? '#ff3b30' : '#4a90e2');
        if (type === 'laser') return base;
        base.width = this.num(a.width, 0.5, 200, 3);
        if (a.size != null) base.size = this.num(a.size, 1, 500, 20);
        if (a.style === 'pen') base.style = 'pen';
        if (a.tool === 'highlighter') base.tool = 'highlighter';
        if (a.pace === 'uniform') base.pace = 'uniform';
        const shape = this.oneOf(a.shape, ['arrow', 'rect', 'ellipse', 'line'], null);
        if (shape && pts.length >= 2) {
            base.shape = shape;
            base.points = [pts[0], pts[pts.length - 1]];
            if (a.fill && (shape === 'rect' || shape === 'ellipse')) base.fill = true;
        }
        return base;
    },

    comment(c, seen) {
        if (!c || typeof c !== 'object') return null;
        const x = this.num(c.x, -1e5, 1e5, null), y = this.num(c.y, -1e5, 1e5, null);
        if (x === null || y === null) return null;
        const out = {
            id: this.id(c.id, 'c', seen),
            x, y,
            text: this.str(c.text, 5000),
            time: this.num(c.time, 0, 36000, 0),
            duration: this.num(c.duration, 0.05, 36000, 3),
            textColor: Util.safeColor(c.textColor, '#222222'),
            bgColor: Util.safeColor(c.bgColor, '#ffffff'),
            borderColor: Util.safeColor(c.borderColor || c.color, '#f39c12'),
            fontFamily: this.oneOf(c.fontFamily, this.FONTS, 'Arial'),
            fontSize: this.num(c.fontSize, 6, 300, 16),
            opacity: this.num(c.opacity, 0, 1, 0.9)
        };
        if (c.kind === 'badge') out.kind = 'badge';
        if (c.animIn) out.animIn = this.oneOf(c.animIn, this.ANIM_IN, 'none');
        if (c.animOut) out.animOut = this.oneOf(c.animOut, this.ANIM_OUT, 'none');
        if (c.borderWidth != null) out.borderWidth = this.num(c.borderWidth, 0, 20, 2);
        if (c.maxWidth != null) out.maxWidth = this.num(c.maxWidth, 50, 4000, 480);
        if (c.pointer && typeof c.pointer === 'object') {
            const px = this.num(c.pointer.x, -1e5, 1e5, null), py = this.num(c.pointer.y, -1e5, 1e5, null);
            if (px !== null && py !== null) out.pointer = { x: px, y: py };
        }
        return out;
    },

    camera(m, seen) {
        if (!m || typeof m !== 'object') return null;
        const rect = this.rect(m.rect);
        if (!rect) return null;
        return Object.assign({ id: this.id(m.id, 'cam', seen), rect, easing: Util.EASINGS[m.easing] ? m.easing : 'easeInOut' }, this.timing(m, 1.5));
    },

    audioClip(c, assets, seen) {
        if (!c || typeof c !== 'object') return null;
        if (typeof c.assetId !== 'string' || !assets[c.assetId] || assets[c.assetId].kind !== 'audio') return null;
        return {
            id: this.id(c.id, 'au', seen),
            assetId: c.assetId,
            name: this.str(c.name, 120),
            startTime: this.num(c.startTime, 0, 36000, 0),
            duration: this.num(c.duration, 0.05, 36000, 1),
            offset: this.num(c.offset, 0, 36000, 0),
            volume: this.num(c.volume, 0, 2, 1)
        };
    },

    marker(m, seen) {
        if (!m || typeof m !== 'object') return null;
        const time = this.num(m.time, 0, 36000, null);
        if (time === null) return null;
        return { id: this.id(m.id, 'mk', seen), time, label: this.str(m.label, 60) };
    },

    list(arr, fn) {
        return Array.isArray(arr) ? arr.map(fn).filter(Boolean) : [];
    },

    assets(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') return out;
        let total = 0;
        for (const [id, a] of Object.entries(raw)) {
            if (!/^[\w-]{1,64}$/.test(id) || !a || typeof a !== 'object') continue;
            const kind = this.oneOf(a.kind, ['pdf', 'image', 'audio'], null);
            if (!kind) continue;
            let bytes = null, mime = typeof a.mime === 'string' ? a.mime : '';
            if (a.bytes instanceof Uint8Array) bytes = a.bytes;
            else if (typeof a.data === 'string') {
                const parsed = Util.dataUrlToBytes(a.data);
                if (parsed) { bytes = parsed.bytes; mime = mime || parsed.mime; }
            }
            if (!bytes) continue;
            const okMime = kind === 'pdf' ? /^application\/pdf$/.test(mime)
                : kind === 'image' ? /^image\/(png|jpeg|webp|gif|bmp)$/.test(mime)
                : /^audio\/[\w.+-]+/.test(mime) || /^video\/webm/.test(mime);
            if (!okMime) continue;
            total += bytes.length;
            if (total > 500 * 1024 * 1024) break;
            out[id] = { id, kind, mime, name: this.str(a.name, 200), bytes };
        }
        return out;
    },

    background(bg, assets) {
        if (!bg || typeof bg !== 'object') return { kind: 'blank', color: '#ffffff' };
        if (bg.kind === 'pdf' && assets[bg.assetId] && assets[bg.assetId].kind === 'pdf') {
            return { kind: 'pdf', assetId: bg.assetId, page: Math.round(this.num(bg.page, 1, 100000, 1)) };
        }
        if (bg.kind === 'image' && assets[bg.assetId] && assets[bg.assetId].kind === 'image') {
            return { kind: 'image', assetId: bg.assetId };
        }
        return { kind: 'blank', color: Util.safeColor(bg.color, '#ffffff') };
    },

    scene(sc, assets) {
        const seen = new Set();
        const width = Math.round(this.num(sc.width, 16, 16384, 1920));
        const height = Math.round(this.num(sc.height, 16, 16384, 1080));
        return {
            id: this.id(sc.id, 'scene'),
            name: this.str(sc.name, 80),
            width, height,
            background: this.background(sc.background, assets),
            cropRegion: this.rect(sc.cropRegion),
            state: {
                totalAnimationTime: this.num(sc.totalAnimationTime, 0.1, 3600, 10),
                actions: this.list(sc.actions, (a) => this.action(a, seen)),
                comments: this.list(sc.comments, (c) => this.comment(c, seen)),
                cameraMoves: this.list(sc.cameraMoves, (m) => this.camera(m, seen)),
                audioClips: this.list(sc.audioClips, (c) => this.audioClip(c, assets, seen)),
                markers: this.list(sc.markers, (m) => this.marker(m, seen))
            }
        };
    },

    settings(s) {
        const o = (s && typeof s === 'object') ? s : {};
        return {
            animationSpeed: this.num(o.animationSpeed, 0.1, 4, 1),
            persistPaths: o.persistPaths !== false,
            flowColor: Util.safeColor(o.flowColor, '#4a90e2'),
            lineWidth: this.num(o.lineWidth, 1, 200, 3),
            penStyle: this.oneOf(o.penStyle, ['smooth', 'pen'], 'smooth'),
            eraseSize: this.num(o.eraseSize, 1, 500, 20),
            highlightColor: Util.safeColor(o.highlightColor, '#ffd400'),
            highlightWidth: this.num(o.highlightWidth, 2, 200, 22),
            shapeFill: !!o.shapeFill,
            commentTextColor: Util.safeColor(o.commentTextColor, '#222222'),
            commentBgColor: Util.safeColor(o.commentBgColor, '#ffffff'),
            commentBorderColor: Util.safeColor(o.commentBorderColor || o.commentColor, '#f39c12'),
            commentFontFamily: this.oneOf(o.commentFontFamily, this.FONTS, 'Arial'),
            commentFontSize: this.num(o.commentFontSize, 6, 300, 24),
            commentOpacity: this.num(o.commentOpacity, 0, 1, 0.95),
            commentAnimIn: this.oneOf(o.commentAnimIn, this.ANIM_IN, 'pop'),
            commentAnimOut: this.oneOf(o.commentAnimOut, this.ANIM_OUT, 'fade'),
            badgeColor: Util.safeColor(o.badgeColor, '#e74c3c'),
            laserColor: Util.safeColor(o.laserColor, '#ff3b30'),
            spotlightDim: this.num(o.spotlightDim, 0, 1, 0.6),
            spotlightShape: this.oneOf(o.spotlightShape, ['rect', 'ellipse'], 'rect'),
            redactMode: this.oneOf(o.redactMode, ['pixelate', 'blur', 'solid'], 'pixelate')
        };
    },

    // Aceita v2 ({ scenes }) e v1 ({ actions, comments, settings, background }). Retorna o
    // projeto normalizado ou null se não for um projeto reconhecível.
    parse(data) {
        if (!data || typeof data !== 'object') return null;
        if (Array.isArray(data.scenes)) {
            const assets = this.assets(data.assets);
            const scenes = data.scenes.slice(0, 500).map((sc) => this.scene(sc || {}, assets));
            if (!scenes.length) return null;
            return {
                id: (typeof data.id === 'string' && /^[\w-]{1,64}$/.test(data.id)) ? data.id : null,
                name: this.str(data.name, 120),
                settings: this.settings(data.settings),
                assets,
                scenes,
                currentScene: Math.round(this.num(data.currentScene, 0, scenes.length - 1, 0)),
                documentAssetId: (typeof data.documentAssetId === 'string' && assets[data.documentAssetId]) ? data.documentAssetId : null,
                keepBackground: false
            };
        }
        if (!Array.isArray(data.actions) && !Array.isArray(data.comments)) return null;
        // v1.x: uma cena só
        const settings = (data.settings && typeof data.settings === 'object') ? data.settings : {};
        const assets = {};
        let background = null;
        if (data.background && typeof data.background.dataUrl === 'string') {
            const parsed = Util.dataUrlToBytes(data.background.dataUrl);
            if (parsed && /^image\//.test(parsed.mime)) {
                const id = Util.uid('asset');
                assets[id] = { id, kind: 'image', mime: parsed.mime, name: 'background.png', bytes: parsed.bytes };
                background = { kind: 'image', assetId: id };
            }
        }
        const scene = this.scene({
            width: settings.canvasWidth, height: settings.canvasHeight,
            background: background || { kind: 'blank' },
            totalAnimationTime: settings.totalAnimationTime,
            actions: data.actions, comments: data.comments
        }, assets);
        return {
            id: null,
            name: '',
            settings: this.settings(settings),
            assets,
            scenes: [scene],
            currentScene: 0,
            documentAssetId: null,
            // Arquivos antigos sem `background` mantêm o fundo atualmente carregado (e seu tamanho,
            // se o arquivo não trouxer canvasWidth/Height)
            keepBackground: !background,
            keepSize: !(settings.canvasWidth && settings.canvasHeight)
        };
    }
};

// ─── Serialização ──────────────────────────────────────────────────────────

FlowAnimator.prototype._cleanItem = function(o) {
    const c = Object.assign({}, o);
    delete c._layout;
    delete c._layoutKey;
    return c;
};

// Ids dos assets referenciados por alguma cena
FlowAnimator.prototype._usedAssetIds = function() {
    const ids = new Set();
    for (const s of this.scenes) {
        if (s.background && s.background.assetId) ids.add(s.background.assetId);
        for (const c of (s.state.audioClips || [])) ids.add(c.assetId);
    }
    if (this.documentAssetId) ids.add(this.documentAssetId);
    return ids;
};

// Fundo definido só como canvas (ex.: _setBackgroundFromImageData) vira um asset PNG
FlowAnimator.prototype._materializeBackgrounds = function() {
    for (const s of this.scenes) {
        if (s.background && s.background.kind === 'image' && !s.background.assetId && s._bgCanvas) {
            const parsed = Util.dataUrlToBytes(s._bgCanvas.toDataURL('image/png'));
            if (parsed) s.background = { kind: 'image', assetId: this.addAsset({ kind: 'image', mime: 'image/png', name: 'background.png', bytes: parsed.bytes }) };
        }
    }
};

// assetsMode: 'dataurl' (arquivo/localStorage: tudo embutido), 'refs' (IndexedDB: bytes à
// parte), 'none' (sem assets — fundo e áudio se perdem)
FlowAnimator.prototype._serializeProject = function(assetsMode) {
    this._captureScene();
    if (assetsMode !== 'none') this._materializeBackgrounds();
    const current = this._scene();
    if (current) current.cropRegion = this.cropRegion;
    const scenes = this.scenes.map((s) => ({
        id: s.id,
        name: s.name,
        width: s.width,
        height: s.height,
        background: Object.assign({}, s.background),
        cropRegion: s.cropRegion || null,
        totalAnimationTime: s.state.totalAnimationTime,
        actions: (s.state.actions || []).map((o) => this._cleanItem(o)),
        comments: (s.state.comments || []).map((o) => this._cleanItem(o)),
        cameraMoves: (s.state.cameraMoves || []).map((o) => this._cleanItem(o)),
        audioClips: assetsMode === 'none' ? [] : (s.state.audioClips || []).map((o) => this._cleanItem(o)),
        markers: (s.state.markers || []).map((o) => this._cleanItem(o))
    }));
    const assets = {};
    if (assetsMode !== 'none') {
        for (const id of this._usedAssetIds()) {
            const a = this.assets.get(id);
            if (!a) continue;
            assets[id] = { kind: a.kind, mime: a.mime, name: a.name };
            if (assetsMode === 'dataurl') assets[id].data = Util.bytesToDataUrl(a.bytes, a.mime);
            else assets[id].size = a.bytes.length;
        }
    } else {
        for (const s of scenes) if (s.background.kind !== 'blank') s.background = { kind: 'blank', color: '#ffffff' };
    }
    return {
        format: 'pdf-flow-animator',
        version: ProjectSchema.VERSION,
        id: this.projectId,
        name: this.projectName,
        timestamp: new Date().toISOString(),
        currentScene: this.currentSceneIndex,
        documentAssetId: this.documentAssetId,
        settings: this._settingsObject(),
        scenes,
        assets
    };
};

FlowAnimator.prototype._settingsObject = function() {
    return {
        animationSpeed: this.animationSpeed,
        persistPaths: this.persistPaths,
        flowColor: this.flowColor,
        lineWidth: this.lineWidth,
        penStyle: this.penStyle,
        eraseSize: this.eraseSize,
        highlightColor: this.highlightColor,
        highlightWidth: this.highlightWidth,
        shapeFill: this.shapeFill,
        commentTextColor: this.commentTextColor,
        commentBgColor: this.commentBgColor,
        commentBorderColor: this.commentBorderColor,
        commentFontFamily: this.commentFontFamily,
        commentFontSize: this.commentFontSize,
        commentOpacity: this.commentOpacity,
        commentAnimIn: this.commentAnimIn,
        commentAnimOut: this.commentAnimOut,
        badgeColor: this.badgeColor,
        laserColor: this.laserColor,
        spotlightDim: this.spotlightDim,
        spotlightShape: this.spotlightShape,
        redactMode: this.redactMode,
        // Compatibilidade com leitores da v1 (cena atual)
        totalAnimationTime: this.totalAnimationTime,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height
    };
};

// Compat (nome antigo): projeto serializado, com ou sem assets embutidos
FlowAnimator.prototype._buildProjectData = function(includeBackground) {
    return this._serializeProject(includeBackground ? 'dataurl' : 'none');
};

// ─── Carregar ──────────────────────────────────────────────────────────────

FlowAnimator.prototype.loadDataFromObject = function(data) {
    const project = ProjectSchema.parse(data);
    if (!project) throw new Error(t('invalidProject'));
    if (this.isPlaying) this.pause();
    if (this.timelineMode) this.exitTimelineMode();
    this._applyProject(project);
};

FlowAnimator.prototype._applyProject = function(project) {
    const keep = project.keepBackground ? {
        background: this._scene() ? this._scene().background : { kind: 'blank' },
        canvas: this._bgCanvas,
        width: this.canvas.width,
        height: this.canvas.height
    } : null;

    const assets = new Map();
    for (const [id, a] of Object.entries(project.assets)) assets.set(id, a);
    if (keep && keep.background.assetId && this.assets.has(keep.background.assetId)) {
        assets.set(keep.background.assetId, this.assets.get(keep.background.assetId));
    }
    if (keep && keep.background.kind === 'pdf' && this.documentAssetId && this.assets.has(this.documentAssetId)) {
        assets.set(this.documentAssetId, this.assets.get(this.documentAssetId));
    }
    const keptDoc = keep && keep.background.kind === 'pdf' ? this.documentAssetId : null;
    this.assets = assets;
    this._audioBuffers = new Map();
    if (!keep) this._pdfDocs = new Map();

    this.scenes = project.scenes.map((sc) => {
        const s = this._newScene({ id: sc.id, name: sc.name, width: sc.width, height: sc.height, background: sc.background, state: sc.state });
        s.cropRegion = sc.cropRegion;
        return s;
    });
    if (keep) {
        const s0 = this.scenes[0];
        s0.background = keep.background;
        s0._bgCanvas = keep.canvas;
        if (project.keepSize) { s0.width = keep.width; s0.height = keep.height; }
    }

    if (project.id) this.projectId = project.id;
    if (project.name) {
        this.projectName = project.name;
        const input = document.getElementById('projectName');
        if (input) input.value = project.name;
    }
    this.documentAssetId = project.documentAssetId || keptDoc ||
        (Array.from(this.assets.values()).find((a) => a.kind === 'pdf') || {}).id || null;
    if (!this.documentAssetId) this.pdfDoc = null;
    else this._getPdfDoc(this.documentAssetId).then((d) => { this.pdfDoc = d; this._setFileLabel(); }).catch(() => {});

    Object.assign(this, project.settings);
    this.updateUIFromSettings();

    this._applyScene(project.currentScene);
    this.cropRegion = this._scene().cropRegion || null;
    this.drawCropOverlay();
    this.updateCropIndicator();
    this._emptyDismissed = true;
    this._afterSceneChange();
    this._setFileLabel();
    this._decodeAllAudio();
};

FlowAnimator.prototype.updateUIFromSettings = function() {
    if (this.inspector) this.inspector.syncFromAnimator();
    this._syncQuickColor();
};

// ─── Salvamento rápido (localStorage) e arquivo ────────────────────────────

FlowAnimator.prototype.checkLocalStorage = function() {
    let ok = true;
    try {
        localStorage.setItem('__fa_test', '1');
        localStorage.removeItem('__fa_test');
    } catch (e) {
        ok = false;
    }
    this._hasLocalStorage = ok;
    const loadBtn = document.getElementById('loadBtn');
    if (loadBtn) loadBtn.hidden = !ok;
    if (!ok && !ProjectStore.isAvailable()) {
        document.getElementById('sandboxNotice').style.display = 'block';
    }
    return ok;
};

FlowAnimator.prototype.saveToLocalStorage = function() {
    try {
        localStorage.setItem('flowAnimatorData', JSON.stringify(this._serializeProject('dataurl')));
        this.showTooltip(t('quickSaved'));
        return true;
    } catch (error) {
        // Cota do localStorage estourada (PDF/imagem/áudio podem ter vários MB) — salva sem assets
        try {
            localStorage.setItem('flowAnimatorData', JSON.stringify(this._serializeProject('none')));
            Toast.show(t('quickSavedNoBg'), { duration: 6000 });
            return true;
        } catch (retryError) {
            this.handleError(t('errSave'), retryError);
            Toast.show(t('errSave'), { kind: 'error' });
            return false;
        }
    }
};

FlowAnimator.prototype.loadFromLocalStorage = function() {
    try {
        const dataStr = localStorage.getItem('flowAnimatorData');
        if (!dataStr) {
            this.showTooltip(t('nothingSaved'));
            return;
        }
        this.loadDataFromObject(JSON.parse(dataStr));
        this.showTooltip(t('loadedOk'));
    } catch (error) {
        this.handleError(t('errLoad'), error);
        Toast.show(t('errLoad'), { kind: 'error' });
    }
};

// "Salvar como arquivo": File System Access quando disponível (Chrome/Edge), senão download
FlowAnimator.prototype.exportJSON = async function() {
    try {
        const json = JSON.stringify(this._serializeProject('dataurl'));
        const blob = new Blob([json], { type: 'application/json' });
        const name = `${Util.slug(this.projectName, 'flow_animation')}.flowanim.json`;
        if (window.showSaveFilePicker && !navigator.webdriver) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: name,
                    types: [{ description: 'Flow Animator', accept: { 'application/json': ['.json'] } }]
                });
                const w = await handle.createWritable();
                await w.write(blob);
                await w.close();
                this.showTooltip(t('fileSaved'));
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
        }
        Util.downloadBlob(blob, name);
        this.showTooltip(t('fileSaved'));
    } catch (error) {
        this.handleError(t('errExport'), error);
        Toast.show(t('errExport'), { kind: 'error' });
    }
};

FlowAnimator.prototype.importJSON = function(file) {
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || (!data.actions && !data.comments && !data.scenes)) throw new Error(t('invalidProject'));
                this.loadDataFromObject(data);
                this.showTooltip(t('importedOk'));
            } catch (error) {
                this.handleError(t('errImport'), error);
                Toast.show(t('errImport') + ': ' + (error.message || error), { kind: 'error' });
            }
            resolve();
        };
        reader.onerror = () => {
            this.handleError(t('errReadFile'), reader.error);
            Toast.show(t('errReadFile'), { kind: 'error' });
            resolve();
        };
        reader.readAsText(file);
    });
};

// ─── Salvamento automático (IndexedDB) ─────────────────────────────────────

FlowAnimator.AUTOSAVE_DELAY = 1500;

FlowAnimator.prototype.markDirty = function() {
    this._dirty = true;
    this._changeVersion = (this._changeVersion || 0) + 1;
    if (this._suspendAutosave) return;
    this._setSaveState('dirty');
    if (!this._autosave) this._autosave = Util.debounce(() => this.saveProject({ auto: true }), FlowAnimator.AUTOSAVE_DELAY);
    this._autosave();
};

FlowAnimator.prototype._setSaveState = function(state) {
    const el = document.getElementById('saveState');
    if (!el) return;
    const labels = { dirty: t('saveDirty'), saving: t('saveSaving'), saved: t('saveSaved'), error: t('saveError'), off: '' };
    el.textContent = labels[state] || '';
    el.dataset.state = state;
};

FlowAnimator.prototype._projectThumbnail = function() {
    try {
        const first = this.scenes[0];
        return first ? this.renderSceneThumbnail(first, 160) : null;
    } catch (e) {
        return null;
    }
};

FlowAnimator.prototype.saveProject = async function(options) {
    const opts = options || {};
    if (this.isExporting && opts.auto) return false;
    if (!ProjectStore.isAvailable()) {
        if (opts.manual) return this.saveToLocalStorage();
        return false;
    }
    if (this._saving) { this._saveAgain = true; return false; }
    this._saving = true;
    this._setSaveState('saving');
    const version = this._changeVersion;
    try {
        const data = this._serializeProject('refs');
        const record = { id: this.projectId, name: this.projectName, updatedAt: Date.now(), thumbnail: this._projectThumbnail(), data };
        const assets = Object.keys(data.assets).map((id) => this.assets.get(id)).filter(Boolean);
        if (!this._savedAssetIds || this._savedAssetsProject !== this.projectId) {
            this._savedAssetIds = new Set();
            this._savedAssetsProject = this.projectId;
        }
        await ProjectStore.saveProject(record, assets, this._savedAssetIds);
        for (const a of assets) this._savedAssetIds.add(a.id);
        if (this._changeVersion === version) this._dirty = false;
        this._setSaveState(this._dirty ? 'dirty' : 'saved');
        if (opts.manual) this.showTooltip(t('projectSaved'));
        return true;
    } catch (error) {
        this.handleError(t('errSave'), error);
        this._setSaveState('error');
        if (opts.manual) {
            Toast.show(t('errSaveIdb'), { kind: 'error' });
            this.saveToLocalStorage();
        }
        return false;
    } finally {
        this._saving = false;
        if (this._saveAgain) {
            this._saveAgain = false;
            if (this._autosave) this._autosave();
        }
    }
};

// guardVersion: se o usuário alterou algo enquanto o projeto carregava (restauração automática
// na inicialização é assíncrona), não sobrescreve o trabalho — devolve 'skipped'.
FlowAnimator.prototype.openProject = async function(id, guardVersion) {
    try {
        const res = await ProjectStore.loadProject(id);
        if (!res) { this.showTooltip(t('projectNotFound')); return false; }
        if (guardVersion != null && (this._changeVersion || 0) !== guardVersion) return 'skipped';
        const data = Object.assign({}, res.record.data);
        data.assets = {};
        for (const a of res.assets) data.assets[a.id] = { kind: a.kind, mime: a.mime, name: a.name, bytes: a.bytes };
        data.id = res.record.id;
        data.name = res.record.name;
        this._suspendAutosave = true;
        try {
            this.loadDataFromObject(data);
        } finally {
            this._suspendAutosave = false;
        }
        this._savedAssetIds = new Set(res.assets.map((a) => a.id));
        this._savedAssetsProject = this.projectId;
        this._dirty = false;
        this._setSaveState('saved');
        await ProjectStore.setMeta('lastProjectId', id);
        return true;
    } catch (error) {
        this.handleError(t('errLoad'), error);
        Toast.show(t('errLoad'), { kind: 'error' });
        return false;
    }
};

FlowAnimator.prototype.newProject = async function() {
    if (this._autosave) this._autosave.flush();
    if (this._saving) await new Promise((r) => setTimeout(r, 200));
    if (this.isPlaying) this.pause();
    if (this.timelineMode) this.exitTimelineMode();
    this.projectId = Util.uid('proj');
    this.projectName = t('untitledProject');
    document.getElementById('projectName').value = this.projectName;
    this.assets = new Map();
    this._audioBuffers = new Map();
    this._pdfDocs = new Map();
    this.documentAssetId = null;
    this.pdfDoc = null;
    this.isImage = false;
    this._initScenes();
    this.currentSceneIndex = 0;
    this._applyScene(0);
    this.cropRegion = null;
    this.drawCropOverlay();
    this.updateCropIndicator();
    this._emptyDismissed = false;
    this._afterSceneChange();
    this._setFileLabel();
    this._dirty = false;
    this._setSaveState('off');
    this.renderRecentList();
};

// Na inicialização: reabre o último projeto salvo automaticamente
FlowAnimator.prototype.restoreLastProject = async function() {
    if (!ProjectStore.isAvailable()) return false;
    const v0 = this._changeVersion || 0;
    const id = await ProjectStore.getMeta('lastProjectId');
    if (!id) { this.renderRecentList(); return false; }
    const ok = await this.openProject(id, v0);
    if (ok === 'skipped') {
        Toast.show(t('restoreOffer'), { action: { label: t('open'), onClick: () => this.openProject(id) }, duration: 8000 });
        return false;
    }
    if (ok) {
        Toast.show(t('projectRestored', { name: this.projectName }), {
            action: { label: t('newProject'), onClick: () => this.newProject() },
            duration: 6000
        });
    }
    return ok;
};

FlowAnimator.prototype.openProjectsDialog = async function() {
    if (this._autosave) this._autosave.flush();
    let projects = [];
    try { projects = await ProjectStore.listProjects(); } catch (e) { this.handleError(t('errLoad'), e); }
    showCustomModal(t('projects'), (body, close) => {
        const render = () => {
            body.innerHTML = '';
            if (!projects.length) {
                const p = document.createElement('p');
                p.className = 'hint';
                p.textContent = t('noProjects');
                body.appendChild(p);
            }
            const list = document.createElement('div');
            list.className = 'project-list';
            for (const pr of projects) {
                const row = document.createElement('div');
                row.className = 'project-row';
                const img = document.createElement('img');
                img.alt = '';
                if (pr.thumbnail && /^data:image\//.test(pr.thumbnail)) img.src = pr.thumbnail;
                const meta = document.createElement('div');
                meta.className = 'meta';
                const name = document.createElement('div');
                name.className = 'name';
                name.textContent = pr.name || t('untitledProject');
                const when = document.createElement('div');
                when.className = 'when';
                when.textContent = (pr.id === this.projectId ? t('currentProject') + ' · ' : '') + Util.relativeTime(pr.updatedAt);
                meta.append(name, when);
                const open = document.createElement('button');
                open.className = 'btn btn-outline btn-sm';
                open.textContent = t('open');
                open.addEventListener('click', async () => { close(); if (pr.id !== this.projectId) await this.openProject(pr.id); });
                const rename = document.createElement('button');
                rename.className = 'btn btn-ghost btn-icon btn-sm';
                rename.title = t('rename');
                rename.setAttribute('aria-label', t('rename'));
                rename.innerHTML = '<svg class="icon"><use href="#i-edit"/></svg>';
                rename.addEventListener('click', async () => {
                    const n = await showPromptModal(t('renameProject'), pr.name);
                    if (n == null) return;
                    pr.name = String(n).slice(0, 120);
                    await ProjectStore.renameProject(pr.id, pr.name);
                    if (pr.id === this.projectId) { this.projectName = pr.name; document.getElementById('projectName').value = pr.name; }
                    render();
                });
                const del = document.createElement('button');
                del.className = 'btn btn-ghost btn-icon btn-sm';
                del.title = t('delete');
                del.setAttribute('aria-label', t('delete'));
                del.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
                del.addEventListener('click', async () => {
                    if (!(await showConfirm(t('confirmDeleteProject', { name: pr.name || t('untitledProject') })))) return;
                    await ProjectStore.deleteProject(pr.id);
                    projects = projects.filter((x) => x.id !== pr.id);
                    if (pr.id === this.projectId) { close(); this.newProject(); return; }
                    render();
                });
                row.append(img, meta, open, rename, del);
                list.appendChild(row);
            }
            body.appendChild(list);
            const actions = document.createElement('div');
            actions.className = 'app-modal-actions';
            actions.style.justifyContent = 'flex-start';
            const nw = document.createElement('button');
            nw.className = 'btn btn-outline';
            nw.textContent = t('newProject');
            nw.addEventListener('click', () => { close(); this.newProject(); });
            actions.appendChild(nw);
            body.appendChild(actions);
        };
        render();
    }, { wide: true });
};

FlowAnimator.prototype.openScenesDialog = function() {
    this._captureScene();
    showCustomModal(t('scenesTitle'), (body, close) => {
        const render = () => {
            body.innerHTML = '';
            const list = document.createElement('div');
            list.className = 'scene-list';
            this.scenes.forEach((scene, i) => {
                const row = document.createElement('div');
                row.className = 'scene-row' + (i === this.currentSceneIndex ? ' current' : '');
                const img = document.createElement('img');
                img.alt = '';
                img.src = this.renderSceneThumbnail(scene, 160);
                if (!scene._bgCanvas && scene.background.kind !== 'blank') {
                    this._ensureSceneBackground(scene).then(() => { scene._thumb = null; img.src = this.renderSceneThumbnail(scene, 160); }).catch(() => {});
                }
                const meta = document.createElement('div');
                meta.className = 'meta';
                meta.tabIndex = 0;
                meta.setAttribute('role', 'button');
                const name = document.createElement('div');
                name.className = 'name';
                name.textContent = `${i + 1}. ${this._sceneDisplayName(scene, i)}`;
                const sub = document.createElement('div');
                sub.className = 'sub';
                const st = i === this.currentSceneIndex ? this._liveState() : scene.state;
                sub.textContent = t('sceneSummary', { s: Util.num(st.totalAnimationTime, 1), n: st.actions.length + st.comments.length });
                meta.append(name, sub);
                const go = () => { close(); this.switchScene(i); };
                meta.addEventListener('click', go);
                meta.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
                const mkBtn = (icon, label, fn, disabled) => {
                    const b = document.createElement('button');
                    b.className = 'btn btn-ghost btn-icon btn-sm';
                    b.title = label;
                    b.setAttribute('aria-label', label);
                    b.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg>`;
                    b.disabled = !!disabled;
                    b.addEventListener('click', fn);
                    return b;
                };
                row.append(img, meta,
                    mkBtn('i-arrow-up', t('moveUp'), () => { this.moveScene(i, -1); render(); }, i === 0),
                    mkBtn('i-arrow-down', t('moveDown'), () => { this.moveScene(i, 1); render(); }, i === this.scenes.length - 1),
                    mkBtn('i-edit', t('rename'), async () => {
                        const n = await showPromptModal(t('renameScene'), scene.name || this._sceneDisplayName(scene, i));
                        if (n != null) { this.renameScene(i, n); render(); }
                    }),
                    mkBtn('i-copy', t('duplicateScene'), () => { this.duplicateScene(i); render(); }),
                    mkBtn('i-trash', t('delete'), () => { this.deleteScene(i); render(); }, this.scenes.length <= 1));
                list.appendChild(row);
            });
            body.appendChild(list);
            const actions = document.createElement('div');
            actions.className = 'app-modal-actions';
            actions.style.justifyContent = 'flex-start';
            const add = document.createElement('button');
            add.className = 'btn btn-outline';
            add.textContent = t('addBlankScene');
            add.addEventListener('click', () => { this.addBlankScene(this.currentSceneIndex); render(); });
            actions.appendChild(add);
            if (this.documentAssetId) {
                const addPage = document.createElement('button');
                addPage.className = 'btn btn-outline';
                addPage.textContent = t('addPdfPage');
                addPage.addEventListener('click', async () => {
                    const n = await showPromptModal(t('whichPage'), '1');
                    const page = parseInt(n, 10);
                    if (isFinite(page)) { await this.addPdfPageScene(page); render(); }
                });
                actions.appendChild(addPage);
            }
            body.appendChild(actions);
        };
        render();
    }, { wide: true });
};

// ─── Estado vazio e projetos recentes ──────────────────────────────────────

FlowAnimator.prototype._updateEmptyState = function() {
    const el = document.getElementById('emptyState');
    if (!el) return;
    const scene = this._scene();
    const empty = this.scenes.length === 1 && scene && this._isSceneEmpty(scene);
    if (!empty) this._emptyDismissed = true;
    el.hidden = !(empty && !this._emptyDismissed);
};

FlowAnimator.prototype.dismissEmptyState = function() {
    this._emptyDismissed = true;
    this._updateEmptyState();
};

FlowAnimator.prototype.renderRecentList = async function() {
    const box = document.getElementById('recentList');
    if (!box || !ProjectStore.isAvailable()) return;
    let projects = [];
    try { projects = (await ProjectStore.listProjects()).filter((p) => p.id !== this.projectId).slice(0, 3); } catch (e) { return; }
    box.innerHTML = '';
    box.hidden = !projects.length;
    if (!projects.length) return;
    const h = document.createElement('h3');
    h.textContent = t('recentProjects');
    box.appendChild(h);
    for (const pr of projects) {
        const b = document.createElement('button');
        b.className = 'recent-item';
        const img = document.createElement('img');
        img.alt = '';
        if (pr.thumbnail && /^data:image\//.test(pr.thumbnail)) img.src = pr.thumbnail;
        const meta = document.createElement('span');
        meta.className = 'meta';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = pr.name || t('untitledProject');
        const when = document.createElement('span');
        when.className = 'when';
        when.textContent = Util.relativeTime(pr.updatedAt);
        meta.append(name, when);
        b.append(img, meta);
        b.addEventListener('click', () => this.openProject(pr.id));
        box.appendChild(b);
    }
};

// ─── Projeto de exemplo ────────────────────────────────────────────────────

FlowAnimator.prototype.loadExampleProject = function() {
    const W = 1920, H = 1080;
    const boxes = [
        { x: 230, label: t('exStep1') },
        { x: 810, label: t('exStep2') },
        { x: 1390, label: t('exStep3') }
    ];
    const bw = 300, bh = 170, by = 460;
    const actions = [];
    const comments = [];
    const tline = (pts, dur) => pts.map((p, i) => ({ x: p.x, y: p.y, t: (i / (pts.length - 1)) * dur }));
    comments.push({ x: W / 2, y: 170, text: t('exTitle'), time: 0.2, duration: 13, textColor: '#1b1f26', bgColor: '#ffffff',
        borderColor: '#ffffff', fontFamily: 'Georgia', fontSize: 58, opacity: 0, borderWidth: 0, animIn: 'typewriter', animOut: 'none' });
    boxes.forEach((b, i) => {
        const start = 1.6 + i * 2.6;
        actions.push({ type: 'draw', shape: 'rect', points: [{ x: b.x, y: by }, { x: b.x + bw, y: by + bh }], color: '#2f6fe4', width: 6, fill: true, startTime: start, duration: 1 });
        comments.push({ x: b.x + bw / 2, y: by + bh / 2, text: b.label, time: start + 0.8, duration: 13 - start, textColor: '#1b1f26', bgColor: '#ffffff',
            borderColor: '#ffffff', fontFamily: 'Arial', fontSize: 34, opacity: 0, borderWidth: 0, animIn: 'pop', animOut: 'none' });
        comments.push({ kind: 'badge', x: b.x, y: by, text: String(i + 1), time: start + 0.4, duration: 13 - start, textColor: '#ffffff', bgColor: '#e5484d',
            borderColor: '#ffffff', fontFamily: 'Arial', fontSize: 30, opacity: 1, animIn: 'pop', animOut: 'none' });
        if (i < 2) {
            actions.push({ type: 'draw', shape: 'arrow', points: [{ x: b.x + bw + 25, y: by + bh / 2 }, { x: boxes[i + 1].x - 25, y: by + bh / 2 }], color: '#1b1f26', width: 6, startTime: start + 1.4, duration: 0.8 });
        }
    });
    const under = [];
    for (let i = 0; i <= 30; i++) under.push({ x: 830 + i * 9, y: by + bh + 40 + Math.sin(i / 3) * 4 });
    actions.push({ type: 'draw', tool: 'highlighter', points: tline(under, 0.9), color: '#ffd400', width: 26, startTime: 5.2, duration: 0.9 });
    comments.push({ x: 960, y: 820, text: t('exNote'), time: 6.2, duration: 3.2, textColor: '#222222', bgColor: '#fff7d6', borderColor: '#f39c12',
        fontFamily: 'Arial', fontSize: 30, opacity: 1, animIn: 'slide', animOut: 'fade', pointer: { x: 960, y: by + bh + 50 } });
    const laser = [];
    for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        laser.push({ x: 1540 + Math.cos(a) * 190, y: by + bh / 2 + Math.sin(a) * 120 });
    }
    actions.push({ type: 'laser', points: tline(laser, 1.8), color: '#ff3b30', startTime: 9.4, duration: 1.8 });
    actions.push({ type: 'spotlight', rect: { x: 1340, y: by - 60, w: 400, h: bh + 120 }, shape: 'rect', dim: 0.6, startTime: 11.2, duration: 1.8 });
    const cameraMoves = [
        { startTime: 4.6, duration: 1.2, rect: { x: 560, y: 300, w: 800, h: 450 }, easing: 'easeInOut' },
        { startTime: 8.4, duration: 1.2, rect: { x: 0, y: 0, w: W, h: H }, easing: 'easeInOut' }
    ];
    this.loadDataFromObject({
        format: 'pdf-flow-animator',
        version: ProjectSchema.VERSION,
        name: t('exProjectName'),
        settings: this._settingsObject(),
        scenes: [{ width: W, height: H, background: { kind: 'blank', color: '#fbfaf7' }, totalAnimationTime: 14, actions, comments, cameraMoves }]
    });
    this.projectId = Util.uid('proj');
    this.markDirty();
    this.showTooltip(t('exampleLoaded'));
};
