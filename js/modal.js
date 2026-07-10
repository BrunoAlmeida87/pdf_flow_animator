// Modais próprios (Promise-based) substituindo confirm()/alert()/prompt() nativos do navegador.
// Usa o mesmo visual escuro do resto da UI (ver .progress-bar/.tooltip em css/styles.css).

function _createModalOverlay(bodyHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.innerHTML = `<div class="app-modal">${bodyHtml}</div>`;
    document.body.appendChild(overlay);
    return overlay;
}

function _removeModal(overlay) {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

// Intercepta teclas na fase de captura do document e impede a propagação para a fase de
// bubble, onde vivem os atalhos globais do app (Espaço = play/pause, Esc = reset, etc.) —
// sem isso, Esc/Espaço num modal aberto também acionavam esses atalhos por baixo dele.
// Também prende o Tab dentro do modal (focus trap): sem isso o foco escapava para os
// controles atrás do overlay.
function _trapKeydown(overlay, handler) {
    const onKeydown = (e) => {
        e.stopPropagation();

        if (e.key === 'Tab') {
            const focusables = overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
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

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
            <div class="app-modal-message">${escapeHtml(message)}</div>
            <div class="app-modal-actions">
                <button class="btn btn-primary" data-action="cancel">Cancelar</button>
                <button class="btn btn-danger" data-action="ok">Confirmar</button>
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

function showAlertModal(message) {
    return new Promise((resolve) => {
        const overlay = _createModalOverlay(`
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
                <button class="btn btn-primary" data-action="cancel">Cancelar</button>
                <button class="btn btn-success" data-action="ok">OK</button>
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
