// Utilitários compartilhados (sem dependências). Carrega logo após i18n.js.

// Escapa texto de origem externa (ex: comentários importados de JSON) antes de inserir via
// innerHTML. Texto de comentário é uma superfície de XSS confirmada no histórico do projeto.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

// Insere um emoji no textarea de comentário, na posição do cursor
function insertEmoji(emoji, textarea) {
    const ta = textarea || document.getElementById('commentText');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + emoji + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + emoji.length;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const Util = {
    // ID curto e estável (não depende de índice): usado por ações, comentários, cenas, assets
    uid(prefix) {
        const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
            ? Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
            : Math.random().toString(16).slice(2, 14);
        return (prefix || 'id') + '_' + rnd;
    },

    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); },

    // Easing usado por itens da timeline (progresso 0..1 → 0..1)
    EASINGS: {
        linear: (t) => t,
        easeIn: (t) => t * t * t,
        easeOut: (t) => 1 - Math.pow(1 - t, 3),
        easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    },
    ease(name, t) {
        const f = Util.EASINGS[name] || Util.EASINGS.linear;
        return f(Util.clamp(t, 0, 1));
    },

    // MM:SS (sem décimos) — usado na régua
    formatTime(seconds) {
        const s = Math.max(0, seconds || 0);
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    // MM:SS.d — usado no display de tempo do transporte
    formatTimePrecise(seconds) {
        const s = Math.max(0, seconds || 0);
        const mins = Math.floor(s / 60);
        const secs = s - mins * 60;
        return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
    },

    // HH:MM:SS,mmm (SRT) / HH:MM:SS.mmm (VTT)
    formatTimestamp(seconds, sep) {
        const ms = Math.round(Math.max(0, seconds) * 1000);
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const r = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
    },

    isHexColor(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); },
    safeColor(v, fallback) {
        if (Util.isHexColor(v)) return v.toLowerCase();
        if (typeof v === 'string' && /^#[0-9a-f]{3}$/i.test(v)) {
            return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
        }
        return fallback;
    },
    hexToRgba(hex, alpha) {
        const h = Util.safeColor(hex, '#000000');
        const r = parseInt(h.slice(1, 3), 16);
        const g = parseInt(h.slice(3, 5), 16);
        const b = parseInt(h.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    debounce(fn, ms) {
        let timer = null;
        const wrapped = function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => { timer = null; fn.apply(this, args); }, ms);
        };
        wrapped.cancel = () => { clearTimeout(timer); timer = null; };
        wrapped.flush = function(...args) { if (timer) { clearTimeout(timer); timer = null; fn.apply(this, args); } };
        return wrapped;
    },

    // Dispara o download de um blob. O revoke é adiado: revogar imediatamente após o click()
    // pode abortar o download em alguns navegadores.
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    // Nome de arquivo seguro a partir do nome do projeto
    slug(name, fallback) {
        const s = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
        return s || fallback || 'projeto';
    },

    // Carrega um script clássico sob demanda (vendors pesados, ex.: Mediabunny só na exportação).
    // Funciona em file://, ao contrário de import() dinâmico.
    loadScript(src) {
        Util._scriptPromises = Util._scriptPromises || {};
        if (!Util._scriptPromises[src]) {
            Util._scriptPromises[src] = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => resolve();
                s.onerror = () => { delete Util._scriptPromises[src]; reject(new Error('Falha ao carregar ' + src)); };
                document.head.appendChild(s);
            });
        }
        return Util._scriptPromises[src];
    },

    // Base64 síncrono (o salvamento rápido em localStorage precisa ser síncrono)
    bytesToBase64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    },
    base64ToBytes(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },
    dataUrlToBytes(dataUrl) {
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
        if (!m || !m[2]) return null;
        return { mime: m[1] || 'application/octet-stream', bytes: Util.base64ToBytes(m[3]) };
    },
    bytesToDataUrl(bytes, mime) {
        return `data:${mime || 'application/octet-stream'};base64,${Util.bytesToBase64(bytes)}`;
    },

    async blobToBytes(blob) {
        return new Uint8Array(await blob.arrayBuffer());
    },

    // Decodifica bytes de imagem num HTMLImageElement
    bytesToImage(bytes, mime) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/png' }));
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
            img.src = url;
        });
    },

    // "há 5 min" / "5 min ago"
    relativeTime(ts) {
        const diff = Math.max(0, Date.now() - ts) / 1000;
        if (diff < 60) return t('justNow');
        if (diff < 3600) return t('minutesAgo', { n: Math.round(diff / 60) });
        if (diff < 86400) return t('hoursAgo', { n: Math.round(diff / 3600) });
        return new Date(ts).toLocaleDateString(getLang());
    },

    // Número formatado no idioma atual (1,5 em pt-BR / 1.5 em en)
    num(v, digits) {
        try {
            return new Intl.NumberFormat(getLang(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
        } catch (e) {
            return Number(v).toFixed(digits);
        }
    },

    isTextField(el) {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag === 'SELECT') return true;
        if (tag === 'INPUT') {
            const type = (el.type || 'text').toLowerCase();
            return !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'file'].includes(type);
        }
        return !!el.isContentEditable;
    }
};
