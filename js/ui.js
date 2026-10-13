// Componentes de UI genéricos: avisos (toasts) e menus suspensos.

const Toast = {
    MAX: 3,

    _container() {
        return document.getElementById('toasts');
    },

    // Posiciona a pilha no rodapé da área do canvas (centralizada), para não cobrir o desenho
    // nem a timeline. Recalculado a cada aviso (o layout muda com redimensionamentos).
    _place() {
        const c = this._container();
        const vp = document.getElementById('canvasViewport');
        if (!c || !vp) return;
        const r = vp.getBoundingClientRect();
        c.style.left = (r.left + r.width / 2) + 'px';
        c.style.bottom = Math.max(12, window.innerHeight - r.bottom + 14) + 'px';
    },

    // show('texto', { action: { label, onClick }, duration, kind: 'error' })
    show(message, options) {
        const opts = options || {};
        const c = this._container();
        if (!c) return null;
        this._place();

        const el = document.createElement('div');
        el.className = 'toast' + (opts.kind === 'error' ? ' error' : '');
        const text = document.createElement('span');
        text.className = 'toast-text';
        text.textContent = message;
        el.appendChild(text);

        if (opts.action) {
            const btn = document.createElement('button');
            btn.className = 'toast-action';
            btn.textContent = opts.action.label;
            btn.addEventListener('click', () => {
                try { opts.action.onClick(); } finally { this.dismiss(el); }
            });
            el.appendChild(btn);
        }
        const close = document.createElement('button');
        close.className = 'toast-close';
        close.setAttribute('aria-label', t('close'));
        close.innerHTML = '<svg class="icon icon-sm"><use href="#i-x"/></svg>';
        close.addEventListener('click', () => this.dismiss(el));
        el.appendChild(close);

        c.appendChild(el);
        while (c.children.length > this.MAX) c.removeChild(c.firstChild);

        const duration = opts.duration || (opts.action ? 6000 : 3200);
        el._timer = setTimeout(() => this.dismiss(el), duration);
        return el;
    },

    dismiss(el) {
        if (!el) return;
        clearTimeout(el._timer);
        if (el.parentNode) el.parentNode.removeChild(el);
    },

    clear() {
        const c = this._container();
        if (c) c.innerHTML = '';
    }
};

// Menus: <div class="menu"><button aria-haspopup="menu">…</button><div class="menu-list" role="menu">
// com .menu-item. Abre/fecha no clique, Esc fecha, ↑/↓ navegam, clique fora fecha.
const Menus = {
    init() {
        document.querySelectorAll('.menu').forEach((menu) => {
            const trigger = menu.querySelector('[aria-haspopup="menu"]');
            const list = menu.querySelector('.menu-list');
            if (!trigger || !list) return;

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = !menu.classList.contains('open');
                Menus.closeAll();
                if (willOpen) Menus.open(menu);
            });

            list.addEventListener('click', (e) => {
                if (e.target.closest('.menu-item')) Menus.close(menu);
            });

            menu.addEventListener('keydown', (e) => {
                if (!menu.classList.contains('open')) {
                    if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && e.target === trigger) {
                        e.preventDefault();
                        e.stopPropagation();
                        Menus.open(menu);
                    }
                    return;
                }
                const items = Array.from(list.querySelectorAll('.menu-item:not([hidden]):not(:disabled)'));
                const idx = items.indexOf(document.activeElement);
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    Menus.close(menu);
                    trigger.focus();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    items[(idx + 1) % items.length].focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    items[(idx - 1 + items.length) % items.length].focus();
                } else if (e.key === 'Tab') {
                    Menus.close(menu);
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu')) Menus.closeAll();
        });
    },

    open(menu) {
        menu.classList.add('open');
        const trigger = menu.querySelector('[aria-haspopup="menu"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        const first = menu.querySelector('.menu-item:not([hidden]):not(:disabled)');
        if (first) setTimeout(() => first.focus(), 0);
    },

    close(menu) {
        menu.classList.remove('open');
        const trigger = menu.querySelector('[aria-haspopup="menu"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    },

    closeAll() {
        document.querySelectorAll('.menu.open').forEach((m) => Menus.close(m));
    },

    isOpen() {
        return !!document.querySelector('.menu.open');
    }
};

// Pequena dica flutuante junto ao cursor (feedback de arrasto na timeline/canvas) — em vez de
// disparar um aviso a cada mousemove.
const DragHint = {
    show(text, x, y) {
        let el = document.getElementById('dragHint');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dragHint';
            el.className = 'drag-hint';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.left = (x + 14) + 'px';
        el.style.top = (y - 28) + 'px';
        el.style.display = 'block';
    },
    hide() {
        const el = document.getElementById('dragHint');
        if (el) el.style.display = 'none';
    }
};

// Barra de progresso modal (exportações) com botão Cancelar
const Progress = {
    _onCancel: null,
    show(title, onCancel) {
        document.getElementById('progressTitle').textContent = title;
        document.getElementById('progressFillBar').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        const cancel = document.getElementById('progressCancelBtn');
        this._onCancel = onCancel || null;
        cancel.hidden = !onCancel;
        cancel.onclick = () => { if (this._onCancel) this._onCancel(); };
        document.getElementById('progressBar').classList.add('show');
    },
    update(fraction, text) {
        const pct = Math.round(Util.clamp(fraction, 0, 1) * 100);
        document.getElementById('progressFillBar').style.width = pct + '%';
        document.getElementById('progressText').textContent = text || (pct + '%');
    },
    hide() {
        document.getElementById('progressBar').classList.remove('show');
        this._onCancel = null;
    },
    isShown() {
        return document.getElementById('progressBar').classList.contains('show');
    }
};
