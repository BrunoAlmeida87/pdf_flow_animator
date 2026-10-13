// Service worker do PDF Flow Animator — só é registrado quando o app é servido por http(s)
// (ex.: GitHub Pages); aberto via file:// o app não usa service worker.
//
// Estratégia: network-first para tudo da própria origem. Online, o usuário sempre recebe a
// versão publicada mais recente (sem misturar HTML novo com JS antigo) e o cache é atualizado
// de carona; offline, tudo sai do cache. A lista PRECACHE garante que o app inteiro funcione
// offline já depois da primeira visita — inclusive o que é carregado sob demanda (Mediabunny).
// Ao adicionar/renomear arquivos carregados pelo app, atualize PRECACHE (o teste tests/pwa.spec.js
// confere que todo <script>/<link> do main.html está aqui) e incremente VERSION.

const VERSION = 'v2.0.0';
const CACHE = 'flow-animator-' + VERSION;

const PRECACHE = [
    './',
    'main.html',
    'index.html',
    'manifest.webmanifest',
    'css/styles.css',
    'js/i18n.js',
    'js/util.js',
    'js/modal.js',
    'js/ui.js',
    'js/zip.js',
    'js/gif.js',
    'js/storage.js',
    'js/audio.js',
    'js/geometry.js',
    'js/timeline-pro.js',
    'js/flow-animator.js',
    'js/fa-render.js',
    'js/fa-input.js',
    'js/fa-media.js',
    'js/fa-project.js',
    'js/fa-export.js',
    'js/inspector.js',
    'js/main.js',
    'vendor/pdfjs/pdf.min.js',
    'vendor/pdfjs/pdf.worker.min.js',
    'vendor/perfect-freehand/perfect-freehand.js',
    'vendor/mediabunny/mediabunny.min.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // cache: 'reload' evita gravar no cache novo uma cópia velha do cache HTTP
            .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((key) => key.startsWith('flow-animator-') && key !== CACHE)
                .map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        try {
            const response = await fetch(request);
            // Só respostas completas e bem-sucedidas vão para o cache (nada de 206/opaque/erro)
            if (response.ok && response.status === 200 && response.type === 'basic') {
                cache.put(request, response.clone()).catch(() => { /* cota cheia: segue sem cache */ });
            }
            return response;
        } catch (err) {
            const cached = await cache.match(request, { ignoreSearch: true });
            if (cached) return cached;
            // Navegação offline para uma URL não cacheada (ex.: ?query nova): abre o app
            if (request.mode === 'navigate') {
                const shell = await cache.match('main.html');
                if (shell) return shell;
            }
            throw err;
        }
    })());
});
