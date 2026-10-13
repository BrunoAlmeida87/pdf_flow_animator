// Inspector — painel de propriedades contextual (barra lateral direita).
// Mostra as configurações da ferramenta ativa (seções [data-panel] do main.html) e, havendo
// seleção, os campos editáveis do item selecionado (#selectionPanel, gerado aqui).
// Edição de item: snapshot de undo no início de cada "sessão" de edição de um campo (foco),
// atualização ao vivo nos eventos input.

class Inspector {
    constructor(animator) {
        this.a = animator;
        this.el = document.getElementById('inspector');
        this.selPanel = document.getElementById('selectionPanel');
        this._selectionKey = null;
        this._editing = false;
        this._populateSelects();
        this._buildSwatches();
        this._bindToolControls();
        this._bindSelectionPanel();
        this.syncFromAnimator();
        this.refresh();
    }

    static PEN_COLORS = ['#1b1f26', '#4a90e2', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#ffffff'];
    static HIGHLIGHT_COLORS = ['#ffd400', '#7cf29c', '#7ad7ff', '#ff9de2', '#ffb86b'];

    _populateSelects() {
        const fill = (id, options) => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const value = sel.value;
            sel.innerHTML = '';
            for (const [v, label] of options) {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = label;
                sel.appendChild(o);
            }
            if (value) sel.value = value;
        };
        fill('commentAnimIn', [['none', t('animNone')], ['fade', t('animFade')], ['pop', t('animPop')], ['slide', t('animSlide')], ['typewriter', t('animTypewriter')]]);
        fill('commentAnimOut', [['none', t('animNone')], ['fade', t('animFade')], ['pop', t('animPop')]]);
        fill('redactMode', [['pixelate', t('redactPixelate')], ['blur', t('redactBlur')], ['solid', t('redactSolid')]]);
    }

    _buildSwatches() {
        const build = (key, colors) => {
            const box = document.querySelector(`[data-swatches="${key}"]`);
            if (!box) return;
            box.innerHTML = '';
            for (const c of colors) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'swatch';
                b.style.background = c;
                b.dataset.color = c;
                b.title = c;
                b.setAttribute('aria-label', t('colorX', { c }));
                b.addEventListener('click', () => this._setToolValue(key, c));
                box.appendChild(b);
            }
            const custom = document.createElement('button');
            custom.type = 'button';
            custom.className = 'swatch-custom';
            custom.title = t('customColor');
            custom.setAttribute('aria-label', t('customColor'));
            custom.innerHTML = '<svg class="icon icon-sm"><use href="#i-plus"/></svg>';
            custom.addEventListener('click', () => document.getElementById(key).click());
            box.appendChild(custom);
        };
        build('flowColor', Inspector.PEN_COLORS);
        build('highlightColor', Inspector.HIGHLIGHT_COLORS);
    }

    _setToolValue(key, value) {
        this.a[key] = value;
        const input = document.getElementById(key);
        if (input && input.value !== value) input.value = value;
        this._markSwatches();
        this.a._syncQuickColor();
        this.a.updateCursorPreview();
        this.a.markDirty();
    }

    _markSwatches() {
        document.querySelectorAll('[data-swatches]').forEach((box) => {
            const key = box.dataset.swatches;
            box.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === String(this.a[key]).toLowerCase()));
        });
    }

    _bindToolControls() {
        const a = this.a;
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        const bindValue = (id, key, parse, display, fmt) => on(id, 'input', (e) => {
            const v = parse ? parse(e.target.value) : e.target.value;
            if (parse && !isFinite(v)) return;
            a[key] = v;
            if (display) document.getElementById(display).textContent = fmt ? fmt(v) : v;
            this._markSwatches();
            a._syncQuickColor();
            a.updateCursorPreview();
            a.markDirty();
        });

        bindValue('flowColor', 'flowColor');
        bindValue('lineWidth', 'lineWidth', (v) => parseInt(v, 10), 'lineWidthDisplay', (v) => v + 'px');
        bindValue('highlightColor', 'highlightColor');
        bindValue('highlightWidth', 'highlightWidth', (v) => parseInt(v, 10), 'highlightWidthDisplay', (v) => v + 'px');
        bindValue('eraseSize', 'eraseSize', (v) => parseInt(v, 10), 'eraseSizeDisplay', (v) => v + 'px');
        on('shapeFill', 'change', (e) => { a.shapeFill = e.target.checked; a.markDirty(); });

        bindValue('commentTextColor', 'commentTextColor');
        bindValue('commentBgColor', 'commentBgColor');
        bindValue('commentBorderColor', 'commentBorderColor');
        on('commentFontFamily', 'change', (e) => { a.commentFontFamily = e.target.value; a.markDirty(); });
        bindValue('commentFontSize', 'commentFontSize', (v) => parseInt(v, 10), 'fontSizeDisplay', (v) => v + 'px');
        bindValue('commentOpacity', 'commentOpacity', parseFloat, 'opacityDisplay', (v) => Math.round(v * 100) + '%');
        on('commentAnimIn', 'change', (e) => { a.commentAnimIn = e.target.value; a.markDirty(); });
        on('commentAnimOut', 'change', (e) => { a.commentAnimOut = e.target.value; a.markDirty(); });
        on('commentBalloon', 'change', (e) => { a.commentBalloon = e.target.checked; a.markDirty(); });
        on('commentTime', 'input', () => { a._commentTimeManual = true; });
        on('setCurrentTimeBtn', 'click', () => {
            a._commentTimeManual = false;
            a.updateCurrentTimeDisplay();
            a.showTooltip(t('timeSetTo', { t: Util.num(a.currentTime(), 1) }));
        });
        on('addCommentBtn', 'click', () => a.startCommentPositioning());
        const picker = document.querySelector('.emoji-picker');
        if (picker) picker.addEventListener('click', (e) => {
            const btn = e.target.closest('.emoji-btn');
            if (btn && btn.dataset.emoji) insertEmoji(btn.dataset.emoji);
        });

        bindValue('badgeColor', 'badgeColor');
        bindValue('laserColor', 'laserColor');
        bindValue('spotlightDim', 'spotlightDim', parseFloat, 'spotlightDimDisplay', (v) => Math.round(v * 100) + '%');
        on('redactMode', 'change', (e) => { a.redactMode = e.target.value; a.markDirty(); });

        const segmented = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', (e) => {
                const b = e.target.closest('button[data-value]');
                if (!b) return;
                a[key] = b.dataset.value;
                this._syncSegmented(id, key);
                a.markDirty();
            });
        };
        segmented('penStyle', 'penStyle');
        segmented('spotlightShape', 'spotlightShape');

        // Cena / animação
        on('sceneNameInput', 'input', (e) => a.renameScene(a.currentSceneIndex, e.target.value));
        const durationDebounce = Util.debounce((v) => a.setTotalDuration(v), 300);
        on('totalDuration', 'input', (e) => {
            const v = parseFloat(e.target.value);
            if (!isFinite(v) || v < 0.5) return; // ignora estados intermediários de digitação
            durationDebounce(v);
        });
        on('totalDuration', 'change', () => durationDebounce.flush());
        on('fitDurationBtn', 'click', () => a.fitDurationToContent());
        on('animSpeed', 'input', (e) => {
            a.setSpeed(e.target.value);
            document.getElementById('speedDisplay').textContent = Util.num(a.animationSpeed, 2).replace(/0$/, '') + 'x';
        });
        on('sceneBgColor', 'input', (e) => {
            const scene = a._scene();
            if (!scene || scene.background.kind !== 'blank') return;
            scene.background = { kind: 'blank', color: e.target.value };
            scene._thumb = null;
            a.redrawMainCanvas();
            a.markDirty();
        });
        on('persistPaths', 'change', (e) => {
            a.persistPaths = e.target.checked;
            a.invalidateRenderCaches();
            a.markDirty();
        });
        on('quickColor', 'input', (e) => {
            const key = a._toolColorKey();
            a[key] = e.target.value;
            const input = document.getElementById(key);
            if (input) input.value = e.target.value;
            this._markSwatches();
            a.markDirty();
        });
    }

    _syncSegmented(id, key) {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll('button[data-value]').forEach((b) => {
            const on = b.dataset.value === this.a[key];
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    // Reflete os valores do animator nos controles (após carregar projeto/configurações)
    syncFromAnimator() {
        const a = this.a;
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
        const text = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('flowColor', a.flowColor);
        set('lineWidth', a.lineWidth); text('lineWidthDisplay', a.lineWidth + 'px');
        set('highlightColor', a.highlightColor);
        set('highlightWidth', a.highlightWidth); text('highlightWidthDisplay', a.highlightWidth + 'px');
        set('eraseSize', a.eraseSize); text('eraseSizeDisplay', a.eraseSize + 'px');
        const fill = document.getElementById('shapeFill'); if (fill) fill.checked = !!a.shapeFill;
        set('commentTextColor', a.commentTextColor);
        set('commentBgColor', a.commentBgColor);
        set('commentBorderColor', a.commentBorderColor);
        set('commentFontFamily', a.commentFontFamily);
        set('commentFontSize', a.commentFontSize); text('fontSizeDisplay', a.commentFontSize + 'px');
        set('commentOpacity', a.commentOpacity); text('opacityDisplay', Math.round(a.commentOpacity * 100) + '%');
        set('commentAnimIn', a.commentAnimIn);
        set('commentAnimOut', a.commentAnimOut);
        const balloon = document.getElementById('commentBalloon'); if (balloon) balloon.checked = !!a.commentBalloon;
        set('badgeColor', a.badgeColor);
        set('laserColor', a.laserColor);
        set('spotlightDim', a.spotlightDim); text('spotlightDimDisplay', Math.round(a.spotlightDim * 100) + '%');
        set('redactMode', a.redactMode);
        set('animSpeed', a.animationSpeed); text('speedDisplay', a.animationSpeed + 'x');
        set('totalDuration', a.totalAnimationTime);
        const persist = document.getElementById('persistPaths'); if (persist) persist.checked = a.persistPaths;
        this._syncSegmented('penStyle', 'penStyle');
        this._syncSegmented('spotlightShape', 'spotlightShape');
        this._markSwatches();
    }

    // Idioma mudou: refaz opções traduzidas e o painel de seleção
    onLanguageChange() {
        this._populateSelects();
        this.syncFromAnimator();
        this._selectionKey = null;
        this.refresh();
    }

    refresh() {
        const mode = this.a.mode;
        document.querySelectorAll('.inspector [data-panel]').forEach((sec) => {
            sec.hidden = !sec.dataset.panel.split(' ').includes(mode);
        });
        document.querySelectorAll('.inspector [data-only]').forEach((row) => {
            row.hidden = !row.dataset.only.split(' ').includes(mode);
        });
        const title = document.getElementById('drawPanelTitle');
        if (title) title.textContent = mode === 'draw' ? t('sectionDraw') : t('toolName_' + mode);

        const items = this.a.getSelectedItems();
        const key = items.map((it) => it.obj.id).join(',');
        if (!items.length) {
            this.selPanel.hidden = true;
            this.selPanel.innerHTML = '';
            this._selectionKey = null;
            return;
        }
        this.selPanel.hidden = false;
        if (key === this._selectionKey) {
            this._updateSelectionValues();
            return;
        }
        this._selectionKey = key;
        this._renderSelection(items);
    }

    // ─── Painel de seleção ─────────────────────────────────────────────────

    _bindSelectionPanel() {
        // Sessão de edição: snapshot de undo ao focar um campo (antes da 1ª alteração ao vivo)
        this.selPanel.addEventListener('focusin', (e) => {
            if (e.target.matches('input, select, textarea') && !this._editing) {
                this._editing = true;
                this.a.saveUndoState();
            }
        });
        this.selPanel.addEventListener('focusout', () => { this._editing = false; });
        this.selPanel.addEventListener('pointerdown', (e) => {
            // Inputs de cor abrem um seletor nativo sem focar de forma confiável em todos os browsers
            if (e.target.matches('input[type="color"]') && !this._editing) {
                this._editing = true;
                this.a.saveUndoState();
            }
        });
    }

    _fieldsFor(it) {
        const a = this.a;
        const o = it.obj;
        const timing = [
            { label: t('starts') + ' (s)', type: 'number', step: 0.1, min: 0, get: () => FlowAnimator.itemStart(it.kind, o), set: (v) => FlowAnimator.setItemStart(it.kind, o, v) },
            { label: t('duration') + ' (s)', type: 'number', step: 0.1, min: 0.1, get: () => o.duration, set: (v) => { o.duration = Math.max(0.1, v); } }
        ];
        const easing = { label: t('easing'), type: 'select', options: [['linear', t('easeLinear')], ['easeInOut', t('easeInOut')], ['easeIn', t('easeIn')], ['easeOut', t('easeOut')]],
            get: () => o.easing || (it.kind === 'camera' ? 'easeInOut' : 'linear'), set: (v) => { o.easing = v; } };
        const color = (key, label) => ({ label: label || t('labelDrawColor'), type: 'color', get: () => o[key] || '#000000', set: (v) => { o[key] = v; } });

        if (it.kind === 'marker') {
            return [
                { label: t('markerLabel'), type: 'text', get: () => o.label, set: (v) => { o.label = String(v).slice(0, 60); } },
                { label: t('starts') + ' (s)', type: 'number', step: 0.1, min: 0, get: () => o.time, set: (v) => { o.time = Math.max(0, v); } }
            ];
        }
        if (it.kind === 'audio') {
            return [
                { label: t('name'), type: 'text', get: () => o.name, set: (v) => { o.name = String(v).slice(0, 120); } },
                { label: t('volume'), type: 'range', min: 0, max: 2, step: 0.05, fmt: (v) => Math.round(v * 100) + '%', get: () => o.volume != null ? o.volume : 1, set: (v) => { o.volume = v; } },
                ...timing,
                { label: t('trimStart') + ' (s)', type: 'number', step: 0.1, min: 0, get: () => o.offset || 0, set: (v) => { o.offset = Math.max(0, v); } }
            ];
        }
        if (it.kind === 'camera') {
            return [...timing, easing,
                { label: t('cameraUseCrop'), type: 'button', run: () => {
                    if (!a.cropRegion) { a.showTooltip(t('cameraNeedCrop')); return; }
                    a.saveUndoState();
                    o.rect = Object.assign({}, a.cropRegion);
                } }];
        }
        if (it.kind === 'comment') {
            if (o.kind === 'badge') {
                return [
                    { label: t('badgeNumber'), type: 'text', get: () => o.text, set: (v) => { o.text = String(v).slice(0, 4); } },
                    color('bgColor'),
                    { label: t('labelFontSize'), type: 'range', min: 10, max: 120, step: 1, fmt: (v) => v + 'px', get: () => o.fontSize, set: (v) => { o.fontSize = v; } },
                    { label: t('animIn'), type: 'select', options: [['none', t('animNone')], ['fade', t('animFade')], ['pop', t('animPop')]], get: () => o.animIn || 'none', set: (v) => { o.animIn = v; } },
                    ...timing
                ];
            }
            return [
                { label: t('labelCommentText'), type: 'textarea', get: () => o.text, set: (v) => { o.text = String(v).slice(0, 5000); } },
                color('textColor', t('labelTextColor')), color('bgColor', t('labelBgColor')), color('borderColor', t('labelBorderColor')),
                { label: t('labelFont'), type: 'select', options: ProjectSchema.FONTS.map((f) => [f, f]), get: () => o.fontFamily, set: (v) => { o.fontFamily = v; } },
                { label: t('labelFontSize'), type: 'range', min: 8, max: 160, step: 1, fmt: (v) => v + 'px', get: () => o.fontSize, set: (v) => { o.fontSize = v; } },
                { label: t('labelOpacity'), type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%', get: () => o.opacity, set: (v) => { o.opacity = v; } },
                { label: t('borderWidth'), type: 'range', min: 0, max: 12, step: 1, fmt: (v) => v + 'px', get: () => o.borderWidth != null ? o.borderWidth : 2, set: (v) => { o.borderWidth = v; } },
                { label: t('animIn'), type: 'select', options: [['none', t('animNone')], ['fade', t('animFade')], ['pop', t('animPop')], ['slide', t('animSlide')], ['typewriter', t('animTypewriter')]], get: () => o.animIn || 'none', set: (v) => { o.animIn = v; } },
                { label: t('animOut'), type: 'select', options: [['none', t('animNone')], ['fade', t('animFade')], ['pop', t('animPop')]], get: () => o.animOut || 'none', set: (v) => { o.animOut = v; } },
                { label: t('balloon'), type: 'checkbox', get: () => !!o.pointer, set: (v) => {
                    if (v) o.pointer = { x: o.x + 140, y: o.y + 110 };
                    else delete o.pointer;
                } },
                ...timing
            ];
        }
        // Ações
        if (o.type === 'erase') {
            return [{ label: t('labelEraseSize'), type: 'range', min: 2, max: 200, step: 1, fmt: (v) => v + 'px', get: () => o.size, set: (v) => { o.size = v; } }, ...timing, easing];
        }
        if (o.type === 'laser') return [color('color'), ...timing];
        if (o.type === 'spotlight') {
            return [
                { label: t('spotDim'), type: 'range', min: 0.1, max: 0.95, step: 0.05, fmt: (v) => Math.round(v * 100) + '%', get: () => o.dim, set: (v) => { o.dim = v; } },
                { label: t('shapeLabel'), type: 'select', options: [['rect', t('shapeRect')], ['ellipse', t('shapeEllipse')]], get: () => o.shape || 'rect', set: (v) => { o.shape = v; } },
                ...timing
            ];
        }
        if (o.type === 'redact') {
            return [{ label: t('redactMode'), type: 'select', options: [['pixelate', t('redactPixelate')], ['blur', t('redactBlur')], ['solid', t('redactSolid')]], get: () => o.mode, set: (v) => { o.mode = v; } }, ...timing];
        }
        const fields = [color('color'),
            { label: t('labelLineWidth'), type: 'range', min: 1, max: o.tool === 'highlighter' ? 80 : 60, step: 1, fmt: (v) => v + 'px', get: () => o.width, set: (v) => { o.width = v; } }];
        if (o.shape === 'rect' || o.shape === 'ellipse') fields.push({ label: t('shapeFill'), type: 'checkbox', get: () => !!o.fill, set: (v) => { if (v) o.fill = true; else delete o.fill; } });
        if (!o.shape && !o.tool) fields.push({ label: t('penStyle'), type: 'select', options: [['smooth', t('penSmooth')], ['pen', t('penPressure')]], get: () => o.style || 'smooth', set: (v) => { if (v === 'pen') o.style = 'pen'; else delete o.style; } });
        if (!o.shape && Geometry.hasTimestamps(o.points || [])) fields.push({ label: t('pace'), type: 'select', options: [['natural', t('paceNatural')], ['uniform', t('paceUniform')]], get: () => o.pace || 'natural', set: (v) => { if (v === 'uniform') o.pace = 'uniform'; else delete o.pace; } });
        return [...fields, ...timing, easing];
    }

    _itemLabel(it) {
        const o = it.obj;
        if (it.kind === 'marker') return t('marker');
        if (it.kind === 'audio') return t('audio');
        if (it.kind === 'camera') return t('toolCameraName');
        if (it.kind === 'comment') return o.kind === 'badge' ? t('toolBadgeName') : t('sectionComments');
        if (o.type === 'erase') return t('sectionErase');
        if (o.type === 'laser') return t('toolLaserName');
        if (o.type === 'spotlight') return t('toolSpotlightName');
        if (o.type === 'redact') return t('toolRedactName');
        if (o.shape) return t('shape_' + o.shape);
        if (o.tool === 'highlighter') return t('toolHighlighterName');
        return t('strokeName');
    }

    _renderSelection(items) {
        const p = this.selPanel;
        p.innerHTML = '';
        this._fields = [];
        const title = document.createElement('div');
        title.className = 'panel-title';
        title.innerHTML = '<svg class="icon"><use href="#i-select"/></svg><span></span>';
        title.querySelector('span').textContent = items.length === 1 ? this._itemLabel(items[0]) : t('nSelected', { n: items.length });
        p.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'btn-grid';
        actions.style.marginBottom = '12px';
        const mk = (label, icon, fn, danger) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-outline btn-sm' + (danger ? ' danger' : '');
            b.innerHTML = `<svg class="icon icon-sm"><use href="#${icon}"/></svg><span></span>`;
            b.querySelector('span').textContent = label;
            b.addEventListener('click', fn);
            return b;
        };
        const canDup = items.some((it) => it.kind !== 'audio' && it.kind !== 'marker');
        if (canDup) actions.appendChild(mk(t('duplicate'), 'i-copy', () => this.a.duplicateSelection()));
        actions.appendChild(mk(t('delete'), 'i-trash', () => this.a.deleteSelection(), true));
        actions.appendChild(mk(t('toPlayhead'), 'i-flag', () => this._alignToPlayhead(items)));
        actions.appendChild(mk(t('goToItem'), 'i-play', () => this.a.seekTo(Math.min(...items.map((it) => FlowAnimator.itemStart(it.kind, it.obj))))));
        p.appendChild(actions);

        if (items.length > 1) {
            const draws = items.filter((it) => it.kind === 'action' && it.obj.type === 'draw');
            if (draws.length) {
                this._renderField(p, { label: t('labelDrawColor'), type: 'color', get: () => draws[0].obj.color, set: (v) => { for (const d of draws) d.obj.color = v; } });
            }
            return;
        }
        for (const f of this._fieldsFor(items[0])) this._renderField(p, f);
    }

    _renderField(parent, f) {
        const wrap = document.createElement('div');
        wrap.className = 'field';
        if (f.type === 'button') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-outline btn-sm btn-block';
            b.textContent = f.label;
            b.addEventListener('click', () => { f.run(); this._applyEdit(); });
            wrap.appendChild(b);
            parent.appendChild(wrap);
            return;
        }
        let input;
        const label = document.createElement('label');
        label.className = f.type === 'checkbox' ? 'check' : 'form-label';
        const id = 'sel_' + Math.random().toString(36).slice(2, 9);
        if (f.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            const span = document.createElement('span');
            span.textContent = f.label;
            label.append(input, span);
            wrap.appendChild(label);
        } else {
            label.htmlFor = id;
            const text = document.createElement('span');
            text.textContent = f.label;
            label.appendChild(text);
            let valueEl = null;
            if (f.type === 'range') {
                valueEl = document.createElement('span');
                valueEl.className = 'value';
                label.appendChild(valueEl);
            }
            wrap.appendChild(label);
            if (f.type === 'select') {
                input = document.createElement('select');
                input.className = 'form-control';
                for (const [v, l] of f.options) {
                    const o = document.createElement('option');
                    o.value = v;
                    o.textContent = l;
                    input.appendChild(o);
                }
            } else if (f.type === 'textarea') {
                input = document.createElement('textarea');
                input.className = 'form-control';
                input.rows = 3;
            } else {
                input = document.createElement('input');
                input.type = f.type === 'color' ? 'color' : f.type === 'range' ? 'range' : f.type === 'number' ? 'number' : 'text';
                input.className = f.type === 'color' ? 'color-picker' : f.type === 'range' ? 'slider' : 'form-control';
                if (f.min != null) input.min = f.min;
                if (f.max != null) input.max = f.max;
                if (f.step != null) input.step = f.step;
            }
            input.id = id;
            f.valueEl = valueEl;
            wrap.appendChild(input);
        }
        f.input = input;
        this._setFieldValue(f);
        const ev = f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input';
        input.addEventListener(ev, () => {
            let v;
            if (f.type === 'checkbox') v = input.checked;
            else if (f.type === 'number' || f.type === 'range') {
                v = parseFloat(input.value);
                if (!isFinite(v)) return;
            } else v = input.value;
            if (!this._editing) { this.a.saveUndoState(); this._editing = f.type === 'select' || f.type === 'checkbox' ? false : true; }
            f.set(v);
            if (f.valueEl && f.fmt) f.valueEl.textContent = f.fmt(v);
            this._applyEdit();
        });
        this._fields.push(f);
        parent.appendChild(wrap);
    }

    _setFieldValue(f) {
        const v = f.get();
        if (f.type === 'checkbox') f.input.checked = !!v;
        else if (f.type === 'number') f.input.value = Math.round((v || 0) * 1000) / 1000;
        else f.input.value = v == null ? '' : v;
        if (f.valueEl && f.fmt) f.valueEl.textContent = f.fmt(v);
    }

    _updateSelectionValues() {
        for (const f of this._fields || []) {
            if (f.input && document.activeElement !== f.input) this._setFieldValue(f);
        }
    }

    _applyEdit() {
        // Mudanças de tempo podem estender o conteúdo além do fim
        this.a._ensureDurationCovers(this.a._lastContentEnd());
        this.a._afterContentChange();
    }

    _alignToPlayhead(items) {
        const now = this.a.currentTime();
        const min = Math.min(...items.map((it) => FlowAnimator.itemStart(it.kind, it.obj)));
        this.a.saveUndoState();
        for (const it of items) FlowAnimator.setItemStart(it.kind, it.obj, FlowAnimator.itemStart(it.kind, it.obj) - min + now);
        this._applyEdit();
    }
}
