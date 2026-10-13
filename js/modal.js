// Modais próprios (Promise-based) substituindo confirm()/alert()/prompt() nativos do navegador.
// Usa escapeHtml (js/util.js) e t() (js/i18n.js), ambos carregados antes deste arquivo.

function _createModalOverlay(bodyHtml, extraClass) {
    const overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.innerHTML = `<div class="app-modal ${extraClass || ''}" role="dialog" aria-modal="true">${bodyHtml}</div>`;
    document.body.appendChild(overlay);
    overlay._previousFocus = document.activeElement;
    return overlay;
}

function _removeModal(overlay) {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    const prev = overlay._previousFocus;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch (e) { /* elemento não focável */ }
    }
}

// Intercepta teclas na fase de captura do document e impede a propagação para a fase de
// bubble, onde vivem os atalhos globais do app (Espaço = play/pause, Delete, etc.) — sem isso,
// Esc/Espaço num modal aberto também acionavam esses atalhos por baixo dele.
// Também prende o Tab dentro do modal (focus trap).
function _trapKeydown(overlay, handler) {
    const onKeydown = (e) => {
        e.stopPropagation();

        if (e.key === 'Tab') {
            const focusables = overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusables.length > 0) {
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                } else if (!overlay.contains(document.activeElement)) {
                    e.preventDefault();
                    first.focus();
                }
            }
            return;
        }

        handler(e);
    };
    document.addEventListener('keydown', onKeydown, true);
    return () => document.removeEventListener('keydown', onKeydown, true);
}

function isModalOpen() {
    return !!document.querySelector('.app-modal-overlay');
}

function showConfirm(message, options) {
    const opts = options || {};
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
            ${opts.title ? `<div class="app-modal-title">${escapeHtml(opts.title)}</div>` : ''}
            <div class="app-modal-message">${escapeHtml(message)}</div>
            <div class="app-modal-actions">
                <button class="btn btn-outline" data-action="cancel">${escapeHtml(opts.cancelLabel || t('cancel'))}</button>
                <button class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" data-action="ok">${escapeHtml(opts.okLabel || t('confirm'))}</button>
            </div>
        `);

        const finish = (result) => {
            untrap();
            _removeModal(overlay);
            resolve(result);
        };

        const untrap = _trapKeydown(overlay, (e) => {
            if (e.key === 'Escape') finish(false);
            if (e.key === 'Enter') finish(true);
        });

        overlay.querySelector('[data-action="ok"]').addEventListener('click', () => finish(true));
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
        overlay.querySelector('[data-action="ok"]').focus();
    });
}

function showAlertModal(message, options) {
    const opts = options || {};
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
            ${opts.title ? `<div class="app-modal-title">${escapeHtml(opts.title)}</div>` : ''}
            <div class="app-modal-message">${escapeHtml(message)}</div>
            <div class="app-modal-actions">
                <button class="btn btn-primary" data-action="ok">OK</button>
            </div>
        `);

        const finish = () => {
            untrap();
            _removeModal(overlay);
            resolve();
        };

        const untrap = _trapKeydown(overlay, (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') finish();
        });

        overlay.querySelector('[data-action="ok"]').addEventListener('click', finish);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(); });
        overlay.querySelector('[data-action="ok"]').focus();
    });
}

function showPromptModal(message, defaultValue) {
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
            <div class="app-modal-message">${escapeHtml(message)}</div>
            <input type="text" class="form-control app-modal-input" value="${escapeHtml(String(defaultValue != null ? defaultValue : ''))}">
            <div class="app-modal-actions">
                <button class="btn btn-outline" data-action="cancel">${escapeHtml(t('cancel'))}</button>
                <button class="btn btn-primary" data-action="ok">OK</button>
            </div>
        `);

        const input = overlay.querySelector('.app-modal-input');

        const finish = (result) => {
            untrap();
            _removeModal(overlay);
            resolve(result);
        };

        const untrap = _trapKeydown(overlay, (e) => {
            if (e.key === 'Escape') finish(null);
            if (e.key === 'Enter') finish(input.value);
        });

        overlay.querySelector('[data-action="ok"]').addEventListener('click', () => finish(input.value));
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
        input.focus();
        input.select();
    });
}

// Formulário genérico. fields: [{ id, label, type: 'select'|'number'|'checkbox'|'text', options:
// [{value, label}], value, min, max, step, hint }]. Resolve com { id: valor } ou null (cancelado).
// Todo texto passa por escapeHtml.
function showFormModal(config) {
    return new Promise((resolve) => {
        const fieldHtml = (f) => {
            const id = 'mf_' + f.id;
            if (f.type === 'checkbox') {
                return `<div class="field"><label class="check"><input type="checkbox" id="${id}" ${f.value ? 'checked' : ''}><span>${escapeHtml(f.label)}</span></label>${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ''}</div>`;
            }
            let control;
            if (f.type === 'select') {
                control = `<select class="form-control" id="${id}">${f.options.map(o =>
                    `<option value="${escapeHtml(String(o.value))}" ${String(o.value) === String(f.value) ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
            } else {
                const attrs = [
                    f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '', f.step != null ? `step="${f.step}"` : ''
                ].join(' ');
                control = `<input class="form-control" id="${id}" type="${f.type === 'number' ? 'number' : 'text'}" value="${escapeHtml(String(f.value != null ? f.value : ''))}" ${attrs}>`;
            }
            return `<div class="field"><label class="form-label" for="${id}">${escapeHtml(f.label)}</label>${control}${f.hint ? `<p class="hint" style="margin-top:4px">${escapeHtml(f.hint)}</p>` : ''}</div>`;
        };

        const overlay = _createModalOverlay(`
            <div class="app-modal-title">${escapeHtml(config.title || '')}</div>
            ${config.description ? `<p class="hint" style="margin-bottom:12px">${escapeHtml(config.description)}</p>` : ''}
            <form class="app-modal-form" novalidate>
                ${config.fields.map(fieldHtml).join('')}
                <div class="app-modal-actions">
                    <button type="button" class="btn btn-outline" data-action="cancel">${escapeHtml(t('cancel'))}</button>
                    <button type="submit" class="btn btn-primary" data-action="ok">${escapeHtml(config.okLabel || 'OK')}</button>
                </div>
            </form>
        `);

        const collect = () => {
            const out = {};
            for (const f of config.fields) {
                const el = overlay.querySelector('#mf_' + f.id);
                if (f.type === 'checkbox') out[f.id] = el.checked;
                else if (f.type === 'number') out[f.id] = parseFloat(el.value);
                else out[f.id] = el.value;
            }
            return out;
        };

        const finish = (result) => {
            untrap();
            _removeModal(overlay);
            resolve(result);
        };

        const untrap = _trapKeydown(overlay, (e) => {
            if (e.key === 'Escape') finish(null);
        });

        if (typeof config.onChange === 'function') {
            overlay.addEventListener('change', () => config.onChange(collect(), overlay));
            config.onChange(collect(), overlay);
        }
        overlay.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(collect()); });
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
        const first = overlay.querySelector('select, input');
        (first || overlay.querySelector('[data-action="ok"]')).focus();
    });
}

// Modal com conteúdo customizado. `buildBody(container, close)` monta o DOM (o chamador é
// responsável por escapar texto de usuário). Resolve quando fechado.
function showCustomModal(title, buildBody, options) {
    const opts = options || {};
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
            <div class="app-modal-title">${escapeHtml(title)}</div>
            <div class="app-modal-body"></div>
            <div class="app-modal-actions"><button class="btn btn-primary" data-action="ok">${escapeHtml(opts.closeLabel || t('close'))}</button></div>
        `, opts.wide ? 'wide' : '');
        const finish = (value) => {
            untrap();
            _removeModal(overlay);
            resolve(value);
        };
        const untrap = _trapKeydown(overlay, (e) => {
            if (e.key === 'Escape') finish(null);
        });
        buildBody(overlay.querySelector('.app-modal-body'), finish);
        overlay.querySelector('[data-action="ok"]').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
        overlay.querySelector('[data-action="ok"]').focus();
    });
}
