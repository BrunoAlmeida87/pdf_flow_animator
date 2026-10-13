// @ts-check
// PWA: manifest + service worker quando o app é servido por http(s) (GitHub Pages), e nada
// disso via file://. O servidor estático abaixo tem um "modo offline" que derruba as conexões,
// simulando a rede caída para o service worker (que precisa então servir tudo do cache).
const { test, expect } = require('@playwright/test');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
    '.bcmap': 'application/octet-stream'
};

function startServer() {
    const state = { offline: false, requests: [] };
    const server = http.createServer((req, res) => {
        if (state.offline) { req.socket.destroy(); return; }
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        state.requests.push(urlPath);
        let file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = /** @type {import('net').AddressInfo} */ (server.address());
            resolve({ server, state, base: `http://127.0.0.1:${port}/` });
        });
    });
}

// Extrai a lista PRECACHE do sw.js (sem executá-lo)
function precacheList() {
    const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const block = /const PRECACHE = \[([\s\S]*?)\];/.exec(src);
    if (!block) throw new Error('PRECACHE não encontrado em sw.js');
    return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('PRECACHE do service worker cobre tudo que o app carrega', () => {
    const list = new Set(precacheList());
    const html = fs.readFileSync(path.join(ROOT, 'main.html'), 'utf8');
    const local = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((u) => !/^(data:|https?:|#)/.test(u));
    // Carregados sob demanda via Util.loadScript (ex.: Mediabunny na exportação de vídeo)
    const lazy = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
        const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        for (const m of src.matchAll(/loadScript\('([^']+)'\)/g)) lazy.push(m[1]);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    const icons = manifest.icons.map((i) => i.src);
    const workerSrc = /workerSrc = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'));

    const needed = [...local, ...lazy, ...icons, 'manifest.webmanifest', workerSrc && workerSrc[1]].filter(Boolean);
    expect(lazy.length).toBeGreaterThan(0);
    for (const url of needed) expect(list, `${url} precisa estar no PRECACHE do sw.js`).toContain(url);
    // E tudo o que está no PRECACHE existe (cache.addAll falha inteiro se um arquivo faltar)
    for (const url of list) {
        if (url === './') continue;
        expect(fs.existsSync(path.join(ROOT, url)), `${url} listado no PRECACHE não existe`).toBe(true);
    }
});

test('manifest é válido e aponta para ícones e file handlers existentes', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('./main.html');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    for (const icon of manifest.icons) expect(fs.existsSync(path.join(ROOT, icon.src))).toBe(true);
    const accept = manifest.file_handlers[0].accept;
    expect(Object.keys(accept)).toEqual(expect.arrayContaining(['application/pdf', 'application/json']));
});

test('via file:// não injeta manifest nem registra service worker', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    // Em file:// o Chromium recusa service workers com SecurityError — o app nem deve tentar
    await page.addInitScript(() => {
        window.__swRegisterCalls = 0;
        if (navigator.serviceWorker) {
            navigator.serviceWorker.register = () => { window.__swRegisterCalls++; return Promise.reject(new Error('não deveria registrar')); };
        }
    });
    await page.goto('file://' + path.join(ROOT, 'main.html'));
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
    expect(await page.evaluate(() => window.__swRegisterCalls)).toBe(0);
    expect(errors).toEqual([]);
});

test('servido por http: instala o service worker e funciona offline', async ({ page }) => {
    const { server, state, base } = await startServer();
    try {
        const errors = [];
        page.on('pageerror', (err) => errors.push(err.message));
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

        await page.goto(base + 'main.html');
        await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
        // Espera o SW ativar e assumir a página (clients.claim)
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        // Precache completo, inclusive o que só é carregado sob demanda
        const cached = await page.evaluate(async () => {
            const keys = await caches.keys();
            const cache = await caches.open(keys.find((k) => k.startsWith('flow-animator-')));
            return (await cache.keys()).map((r) => new URL(r.url).pathname);
        });
        expect(cached).toEqual(expect.arrayContaining(['/main.html', '/js/main.js', '/vendor/pdfjs/pdf.worker.min.js', '/vendor/mediabunny/mediabunny.min.js']));
        expect(errors).toEqual([]);

        // O Chromium considera o app instalável (o único aviso aceito é o do contexto anônimo
        // que o Playwright usa) e lê o manifest sem erros
        const cdp = await page.context().newCDPSession(page);
        const manifest = await cdp.send('Page.getAppManifest');
        expect(manifest.errors).toEqual([]);
        await expect.poll(async () => {
            const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
            return installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito');
        }).toEqual([]);
        await cdp.detach();

        // Rede caída: o app inteiro tem de vir do cache
        state.offline = true;
        await page.reload();
        await expect(page.locator('#canvas')).toBeVisible();
        expect(await page.evaluate(() => typeof window.FlowAnimator === 'function' && !!window.flowAnimator)).toBe(true);
        expect(await page.evaluate(() => getComputedStyle(document.querySelector('.app')).display)).toBe('grid');

        // Importar um PDF offline (o worker do PDF.js vem do cache) gera uma cena por página
        const blank = page.locator('#emptyStartBlank');
        if (await blank.isVisible()) await blank.click();
        await page.setInputFiles('#pdfInput', path.join(__dirname, 'fixtures', 'sample.pdf'));
        await expect.poll(() => page.evaluate(() => window.flowAnimator.scenes.length)).toBeGreaterThan(1);
        expect(await page.evaluate(() => window.flowAnimator._scene().background.kind)).toBe('pdf');

        // A exportação de vídeo carrega o Mediabunny sob demanda — também offline
        // (Util é um const global de script clássico — não fica em window; avalia como string)
        await page.evaluate("Util.loadScript('vendor/mediabunny/mediabunny.min.js')");
        expect(await page.evaluate(() => typeof window.Mediabunny)).toBe('object');
        expect(errors).toEqual([]);

        // Navegação offline para uma URL não cacheada cai no app (main.html do cache)
        await page.goto(base + 'main.html?from=homescreen');
        await expect(page.locator('#canvas')).toBeVisible();
    } finally {
        state.offline = false;
        server.closeAllConnections();
        server.close();
    }
});
