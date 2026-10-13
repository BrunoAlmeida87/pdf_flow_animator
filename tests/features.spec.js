// @ts-check
// Recursos da v2: entrada por caneta/toque, ferramentas novas, seleção, timeline, cenas,
// câmera, áudio/narração, exportação, persistência (IndexedDB), validação, i18n e tema.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAIN_HTML_URL = 'file://' + path.resolve(__dirname, '..', 'main.html');
const FIXTURE_PDF = path.resolve(__dirname, 'fixtures', 'sample.pdf');

async function gotoApp(page) {
    await page.goto(MAIN_HTML_URL);
    await page.waitForTimeout(300);
    const blank = page.locator('#emptyStartBlank');
    if (await blank.isVisible()) await blank.click();
}

async function drag(page, from, to, steps = 8) {
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps });
    await page.mouse.up();
    await page.waitForTimeout(80);
}

// Ponto do canvas (coordenadas internas) → coordenadas de tela
async function canvasToScreen(page, x, y) {
    return page.evaluate(([cx, cy]) => {
        const c = window.flowAnimator.canvas;
        const r = c.getBoundingClientRect();
        return { x: r.left + cx * r.width / c.width, y: r.top + cy * r.height / c.height };
    }, [x, y]);
}

// Dispara Pointer Events sintéticos no viewport do canvas
async function pointerStroke(page, pointerType, points, opts = {}) {
    await page.evaluate(([type, pts, o]) => {
        const vp = document.getElementById('canvasViewport');
        const c = window.flowAnimator.canvas;
        const r = c.getBoundingClientRect();
        const id = o.pointerId || 7;
        const ev = (kind, p) => new PointerEvent(kind, {
            pointerId: id, pointerType: type, isPrimary: true, bubbles: true, cancelable: true,
            clientX: r.left + p[0], clientY: r.top + p[1], pressure: p[2] != null ? p[2] : 0.5, button: 0, buttons: kind === 'pointerup' ? 0 : 1
        });
        vp.dispatchEvent(ev('pointerdown', pts[0]));
        for (const p of pts.slice(1)) vp.dispatchEvent(ev('pointermove', p));
        vp.dispatchEvent(ev('pointerup', pts[pts.length - 1]));
    }, [pointerType, points, opts]);
    await page.waitForTimeout(60);
}

test('caneta: Pointer Events gravam pressão e tempo de cada ponto', async ({ page }) => {
    await gotoApp(page);
    await page.click('#penStyle [data-value="pen"]');
    await pointerStroke(page, 'pen', [[40, 40, 0.2], [80, 60, 0.5], [120, 90, 0.9], [160, 100, 0.7]]);
    const a = await page.evaluate(() => window.flowAnimator.actions[0]);
    expect(a.type).toBe('draw');
    expect(a.style).toBe('pen');
    expect(a.points.map((p) => p.p)).toEqual([0.2, 0.5, 0.9, 0.7]);
    expect(a.points.every((p, i, arr) => typeof p.t === 'number' && (i === 0 || p.t >= arr[i - 1].t))).toBe(true);
});

test('toque com dois dedos faz pinça (zoom) sem desenhar', async ({ page }) => {
    await gotoApp(page);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const vp = document.getElementById('canvasViewport');
        const r = fa.canvas.getBoundingClientRect();
        const before = fa.displayScale;
        const ev = (kind, id, x, y) => vp.dispatchEvent(new PointerEvent(kind, { pointerId: id, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pressure: 0.5, button: 0 }));
        ev('pointerdown', 1, 200, 200);
        ev('pointerdown', 2, 260, 200);
        ev('pointermove', 1, 150, 200);
        ev('pointermove', 2, 310, 200);
        ev('pointerup', 1, 150, 200);
        ev('pointerup', 2, 310, 200);
        return { before, after: fa.displayScale, actions: fa.actions.length };
    });
    expect(res.actions).toBe(0);
    expect(res.after).toBeGreaterThan(res.before * 2);
});

test('depois de usar a caneta, um dedo só move a visão (rejeição da palma)', async ({ page }) => {
    await gotoApp(page);
    await pointerStroke(page, 'pen', [[40, 40], [100, 100]]);
    const before = await page.evaluate(() => ({ n: window.flowAnimator.actions.length, panX: window.flowAnimator.panX }));
    await pointerStroke(page, 'touch', [[300, 300], [360, 320], [420, 340]], { pointerId: 11 });
    const after = await page.evaluate(() => ({ n: window.flowAnimator.actions.length, panX: window.flowAnimator.panX }));
    expect(after.n).toBe(before.n);
    expect(after.panX).not.toBe(before.panX);
});

test('ferramentas de forma: seta, retângulo e elipse viram ações com shape', async ({ page }) => {
    await gotoApp(page);
    for (const [key, shape] of [['a', 'arrow'], ['r', 'rect'], ['o', 'ellipse']]) {
        await page.keyboard.press(key);
        await drag(page, [100, 100], [300, 220]);
        const last = await page.evaluate(() => window.flowAnimator.actions[window.flowAnimator.actions.length - 1]);
        expect(last.shape).toBe(shape);
        expect(last.points).toHaveLength(2);
    }
    await expect(page.locator('.timeline-item.draw')).toHaveCount(3);
});

test('laser: grava o caminho com tempo e não deixa marca depois que termina', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('z');
    await drag(page, [100, 300], [500, 300], 12);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const a = fa.actions[0];
        const mid = a.points[Math.floor(a.points.length / 2)];
        const read = () => Array.from(fa.ctx.getImageData(Math.round(mid.x), Math.round(mid.y), 1, 1).data.slice(0, 3));
        fa.seekTo(a.startTime + a.duration + 0.5);
        const after = read();
        return { type: a.type, timed: a.points.every((p) => typeof p.t === 'number'), after };
    });
    expect(res.type).toBe('laser');
    expect(res.timed).toBe(true);
    expect(res.after).toEqual([255, 255, 255]); // sem tinta persistente
    await expect(page.locator('.timeline-item.laser')).toHaveCount(1);
});

test('números de passo incrementam automaticamente', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('n');
    const box = await page.locator('#canvas').boundingBox();
    for (let i = 0; i < 3; i++) {
        await page.mouse.click(box.x + 100 + i * 80, box.y + 100);
        await page.waitForTimeout(50);
    }
    const texts = await page.evaluate(() => window.flowAnimator.comments.filter((c) => c.kind === 'badge').map((c) => c.text));
    expect(texts).toEqual(['1', '2', '3']);
});

test('destaque escurece fora da área só durante o item', async ({ page }) => {
    await gotoApp(page);
    const px = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions.push({ id: 'sp1', type: 'spotlight', rect: { x: 100, y: 100, w: 300, h: 200 }, dim: 0.6, startTime: 1, duration: 3 });
        const read = (x, y) => fa.ctx.getImageData(x, y, 1, 1).data[0];
        fa.seekTo(2);
        const inside = read(200, 200), outside = read(800, 600);
        fa.seekTo(5);
        return { inside, outside, outsideAfter: read(800, 600) };
    });
    expect(px.inside).toBe(255);
    expect(px.outside).toBeLessThan(140);
    expect(px.outsideAfter).toBe(255);
});

test('ocultar (redact) pixeliza a área na edição e na saída', async ({ page }) => {
    await gotoApp(page);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        // Fundo listrado fino (1px) — pixelizado vira blocos uniformes
        const bg = document.createElement('canvas');
        bg.width = fa.canvas.width; bg.height = fa.canvas.height;
        const b = bg.getContext('2d');
        b.fillStyle = '#fff'; b.fillRect(0, 0, bg.width, bg.height);
        b.fillStyle = '#000';
        for (let x = 0; x < 600; x += 2) b.fillRect(x, 0, 1, 600);
        fa._setBackgroundFromImageData(b.getImageData(0, 0, bg.width, bg.height));
        fa.actions.push({ id: 'rd1', type: 'redact', rect: { x: 100, y: 100, w: 320, h: 160 }, mode: 'pixelate', startTime: 0, duration: 10 });
        fa.rebuildDrawingCanvas();
        fa.redrawMainCanvas();
        const row = fa.ctx.getImageData(150, 150, 8, 1).data;
        const vals = []; for (let i = 0; i < 8; i++) vals.push(row[i * 4]);
        const outside = fa.ctx.getImageData(500, 400, 2, 1).data;
        return { vals, outsideA: outside[0], outsideB: outside[4] };
    });
    expect(new Set(res.vals).size).toBe(1); // bloco uniforme (listras sumiram)
    expect(res.outsideA).not.toBe(res.outsideB); // fora da área continua listrado
});

test('comentário com animação "pop" cresce na entrada', async ({ page }) => {
    await gotoApp(page);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.comments.push({ id: 'c1', x: 600, y: 400, text: 'Olá mundo', time: 1, duration: 4, fontSize: 40, animIn: 'pop', animOut: 'fade', bgColor: '#000000', opacity: 1, textColor: '#ffffff', borderColor: '#000000' });
        const box = fa._getCommentBox(fa.comments[0]);
        const edgeX = Math.round(box.x + 4), edgeY = Math.round(box.y + box.h / 2);
        const at = (time) => { fa.seekTo(time); return fa.ctx.getImageData(edgeX, edgeY, 1, 1).data[0]; };
        return { early: at(1.05), full: at(2.5), gone: at(5.5) };
    });
    expect(res.early).toBeGreaterThan(200); // borda ainda fora da caixa (escala pequena)
    expect(res.full).toBeLessThan(60);     // caixa preta completa
    expect(res.gone).toBe(255);
});

test('selecionar: clique seleciona, arrastar move e Ctrl+Z desfaz', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [300, 100], 10);
    await page.keyboard.press('v');
    const start = await page.evaluate(() => window.flowAnimator.actions[0].points[0].x);
    // Meio do traço (em coordenadas do canvas) → tela
    const mid = await page.evaluate(() => { const pts = window.flowAnimator.actions[0].points; return pts[Math.floor(pts.length / 2)]; });
    const p = await canvasToScreen(page, mid.x, mid.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 60, p.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const moved = await page.evaluate(() => window.flowAnimator.actions[0].points[0].x);
    expect(moved - start).toBeGreaterThan(40);
    expect(await page.evaluate(() => window.flowAnimator.selection.size)).toBe(1);
    await expect(page.locator('#selectionPanel')).toBeVisible();
    await page.keyboard.press('Control+z');
    const restored = await page.evaluate(() => window.flowAnimator.actions[0].points[0].x);
    expect(restored).toBeCloseTo(start, 3);
});

test('Delete exclui a seleção com aviso "Desfazer" que restaura', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [300, 200]);
    await drag(page, [100, 300], [300, 400]);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect(page.locator('#drawCount')).toHaveText('0');
    await page.click('.toast .toast-action');
    await expect(page.locator('#drawCount')).toHaveText('2');
});

test('Ctrl+D duplica e Ctrl+C / Ctrl+V cola na agulha', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [300, 200]);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+d');
    await expect(page.locator('#drawCount')).toHaveText('2');
    await page.evaluate(() => window.flowAnimator.seekTo(4));
    await page.keyboard.press('Control+c');
    await page.evaluate(() => document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true })));
    await expect(page.locator('#drawCount')).toHaveText('3');
    const last = await page.evaluate(() => window.flowAnimator.actions[2].startTime);
    expect(last).toBeCloseTo(4, 3);
});

test('timeline: seleção por retângulo e arrastar move todos os selecionados', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions.push(
            { id: 'a1', type: 'draw', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], color: '#000', width: 3, startTime: 1, duration: 1 },
            { id: 'a2', type: 'draw', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], color: '#000', width: 3, startTime: 3, duration: 1 }
        );
        fa.timeline.refresh(true);
    });
    const track = await page.locator('.timeline-track[data-track-id="draw"]').boundingBox();
    const scroll = await page.locator('#timelineScrollable').boundingBox();
    // Retângulo de 0,5s a 4,5s sobre a track de desenhos
    await page.mouse.move(scroll.x + 50, track.y + 2);
    await page.mouse.down();
    await page.mouse.move(scroll.x + 450, track.y + track.height - 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => Array.from(window.flowAnimator.selection).sort())).toEqual(['a1', 'a2']);

    const item = await page.locator('[data-item-id="a1"]').boundingBox();
    await page.keyboard.down('Shift'); // sem snap
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
    await page.mouse.down();
    await page.mouse.move(item.x + item.width / 2 + 100, item.y + item.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const starts = await page.evaluate(() => window.flowAnimator.actions.map((a) => Math.round(a.startTime * 10) / 10));
    expect(starts).toEqual([2, 4]);
});

test('régua: arrastar posiciona a agulha; M cria marcador arrastável', async ({ page }) => {
    await gotoApp(page);
    const ruler = await page.locator('#timelineRuler').boundingBox();
    await page.mouse.move(ruler.x + 100, ruler.y + 20);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 350, ruler.y + 20, { steps: 5 });
    await page.mouse.up();
    const t1 = await page.evaluate(() => window.flowAnimator.currentTime());
    expect(t1).toBeGreaterThan(3.3);
    expect(t1).toBeLessThan(3.7);

    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('m');
    await expect(page.locator('.ruler-marker')).toHaveCount(1);
    const mk = await page.locator('.ruler-marker').boundingBox();
    await page.mouse.move(mk.x + 4, mk.y + 4);
    await page.mouse.down();
    await page.mouse.move(mk.x + 104, mk.y + 4, { steps: 5 });
    await page.mouse.up();
    const mt = await page.evaluate(() => window.flowAnimator.markers[0].time);
    expect(mt).toBeGreaterThan(t1 + 0.8);
});

test('Ctrl+roda na timeline muda o zoom', async ({ page }) => {
    await gotoApp(page);
    const scroll = await page.locator('#timelineScrollable').boundingBox();
    await page.mouse.move(scroll.x + 300, scroll.y + 40);
    const before = await page.evaluate(() => window.flowAnimator.timeline.zoom);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.flowAnimator.timeline.zoom);
    expect(after).toBeGreaterThan(before * 1.3);
});

test('cenas: PDF de 2 páginas vira 2 cenas e cada cena guarda o próprio conteúdo', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#pdfInput', FIXTURE_PDF);
    await expect(page.locator('#sceneLabel')).toContainText('1/2', { timeout: 10000 });
    await drag(page, [100, 100], [300, 200]);
    await page.click('#sceneNextBtn');
    await expect(page.locator('#sceneLabel')).toContainText('2/2');
    await expect(page.locator('#drawCount')).toHaveText('0');
    await drag(page, [100, 100], [300, 200]);
    await drag(page, [100, 300], [300, 400]);
    await expect(page.locator('#drawCount')).toHaveText('2');
    await page.click('#scenePrevBtn');
    await expect(page.locator('#drawCount')).toHaveText('1');
    const bg = await page.evaluate(() => window.flowAnimator.scenes.map((s) => s.background.kind + ':' + s.background.page));
    expect(bg).toEqual(['pdf:1', 'pdf:2']);
});

test('PDF grande é renderizado com no máximo ~8 MP (escala adaptativa)', async ({ page }) => {
    await gotoApp(page);
    const size = await page.evaluate(() => window.flowAnimator._fitSize(2384, 3370, 2400, 8e6, true));
    expect(size.width * size.height).toBeLessThanOrEqual(8e6);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2400);
});

test('câmera: movimento muda o enquadramento do frame de saída', async ({ page }) => {
    await gotoApp(page);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions.push({ id: 'r1', type: 'draw', shape: 'rect', points: [{ x: 900, y: 500 }, { x: 1020, y: 580 }], color: '#ff0000', width: 30, fill: true, startTime: 0, duration: 0.1 });
        fa.cameraMoves.push({ id: 'cm1', startTime: 1, duration: 1, rect: { x: 860, y: 440, w: 200, h: 200 }, easing: 'linear' });
        fa._captureScene();
        const view = fa._exportView(fa._scene());
        const out = document.createElement('canvas'); out.width = 400; out.height = 400;
        const ctx = out.getContext('2d');
        const red = (t) => { fa.renderOutputFrame(ctx, 400, 400, view, t, 'contain'); const d = ctx.getImageData(0, 0, 400, 400).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80) n++; return n; };
        return { before: red(0.5), after: red(2.5) };
    });
    expect(res.after).toBeGreaterThan(res.before * 5); // zoom: o retângulo ocupa muito mais do frame
});

test('exportar vídeo (WebCodecs) gera um arquivo de vídeo', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [400, 300]);
    await page.evaluate(() => window.flowAnimator.setTotalDuration(1));
    const download = page.waitForEvent('download', { timeout: 60000 });
    await page.evaluate(() => window.flowAnimator.exportVideo({ format: 'webm', preset: '720p', fps: 10, quality: 'low' }));
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/\.webm$/);
    const file = await d.path();
    const head = fs.readFileSync(file).subarray(0, 4);
    expect(Array.from(head)).toEqual([0x1a, 0x45, 0xdf, 0xa3]); // EBML (WebM)
});

test('exportar GIF gera GIF89a animado', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [400, 300]);
    await page.evaluate(() => window.flowAnimator.setTotalDuration(1));
    const download = page.waitForEvent('download', { timeout: 60000 });
    await page.evaluate(() => window.flowAnimator.exportGif({ width: 240, fps: 6 }));
    const d = await download;
    const buf = fs.readFileSync(await d.path());
    expect(buf.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    let frames = 0;
    for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9) frames++;
    expect(frames).toBeGreaterThanOrEqual(5);
});

test('legendas SRT são geradas a partir dos comentários', async ({ page }) => {
    await gotoApp(page);
    const srt = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.comments.push({ id: 'c1', x: 100, y: 100, text: 'Primeiro passo', time: 1.5, duration: 2 });
        return fa.buildSubtitles('srt');
    });
    expect(srt).toContain('00:00:01,500 --> 00:00:03,500');
    expect(srt).toContain('Primeiro passo');
});

test('salvamento automático: recarregar a página restaura o projeto (IndexedDB)', async ({ page }) => {
    await gotoApp(page);
    await page.fill('#projectName', 'Meu teste de autosave');
    await drag(page, [100, 100], [300, 200]);
    await expect(page.locator('#saveState')).toHaveText(/Salvo/, { timeout: 8000 });
    await page.reload();
    await expect(page.locator('#projectName')).toHaveValue('Meu teste de autosave', { timeout: 8000 });
    await expect(page.locator('#drawCount')).toHaveText('1');
});

test('import de JSON malformado é sanitizado sem quebrar a renderização', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoApp(page);
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.loadDataFromObject({
            actions: [
                { type: 'draw', points: 'nope', color: 'red', startTime: 0, duration: 1 },
                { type: 'draw', points: [{ x: 'a', y: 1 }, { x: 10, y: 20 }, { x: 30, y: 40 }], color: 'javascript:alert(1)', width: 1e9, startTime: -5, duration: 'x' },
                { type: 'hack', points: [{ x: 1, y: 1 }] }
            ],
            comments: [{ x: 10, y: 10, text: { toString: () => 'objeto' }, fontFamily: 'Arial; } body { display:none', fontSize: 'enorme' }],
            settings: { totalAnimationTime: 'abc', canvasWidth: -100 }
        });
        fa.seekTo(0.5);
        const a = fa.actions;
        return { n: a.length, color: a[0] && a[0].color, width: a[0] && a[0].width, start: a[0] && a[0].startTime, pts: a[0] && a[0].points.length, font: fa.comments[0].fontFamily };
    });
    expect(res.n).toBe(1);
    expect(res.color).toBe('#4a90e2');
    expect(res.width).toBeLessThanOrEqual(200);
    expect(res.start).toBe(0);
    expect(res.pts).toBe(2);
    expect(res.font).toBe('Arial');
    expect(errors).toEqual([]);
});

test('projeto v2 exportado e reimportado preserva cenas e assets', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#pdfInput', FIXTURE_PDF);
    await expect(page.locator('#sceneLabel')).toContainText('1/2', { timeout: 10000 });
    await drag(page, [100, 100], [300, 200]);
    const data = await page.evaluate(() => JSON.stringify(window.flowAnimator._serializeProject('dataurl')));
    const parsed = JSON.parse(data);
    expect(parsed.version).toBe('2.0');
    expect(Object.values(parsed.assets).some((a) => a.kind === 'pdf' && a.data.startsWith('data:application/pdf;base64,'))).toBe(true);

    await page.evaluate(() => window.flowAnimator.newProject());
    await expect(page.locator('#sceneLabel')).toContainText('1/1');
    const jsonPath = path.join(os.tmpdir(), `proj-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, data);
    await page.locator('#jsonInput').setInputFiles(jsonPath);
    await expect(page.locator('#sceneLabel')).toContainText('1/2', { timeout: 10000 });
    await expect(page.locator('#drawCount')).toHaveText('1');
    // O fundo (página do PDF) volta a ser renderizado a partir do asset embutido
    await page.waitForFunction(() => !!window.flowAnimator._bgCanvas, null, { timeout: 10000 });
    fs.unlinkSync(jsonPath);
});

test('inspector: mudar a cor do traço selecionado é desfazível', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [300, 200]);
    await page.keyboard.press('Control+a');
    const color = page.locator('#selectionPanel input[type="color"]').first();
    await color.focus();
    await color.evaluate((el) => { el.value = '#00ff00'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(await page.evaluate(() => window.flowAnimator.actions[0].color)).toBe('#00ff00');
    await color.evaluate((el) => el.blur());
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.flowAnimator.actions[0].color)).toBe('#4a90e2');
});

test('estado vazio aparece num projeto novo e some ao começar', async ({ page }) => {
    await page.goto(MAIN_HTML_URL);
    await page.waitForTimeout(300);
    await expect(page.locator('#emptyState')).toBeVisible();
    await page.click('#emptyExampleBtn');
    await expect(page.locator('#emptyState')).toBeHidden();
    expect(await page.evaluate(() => window.flowAnimator.actions.length)).toBeGreaterThan(3);
});

test('inglês: mensagens dinâmicas e timeline também são traduzidas', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#langSelect', 'en');
    await expect(page.locator('#trackHeaders')).toContainText('Drawings');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await expect(page.locator('.toast-text').last()).toHaveText('Nothing to undo.');
    await expect(page.locator('[data-mode="erase"]')).toHaveAttribute('title', 'Eraser (E)');
});

test('tema claro/escuro alterna e persiste', async ({ page }) => {
    await gotoApp(page);
    const first = await page.evaluate(() => document.documentElement.dataset.theme || '');
    await page.click('#themeBtn');
    const second = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(second).not.toBe(first);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(second);
});

test('smoke: todos os botões e itens de menu funcionam sem erro de página', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoApp(page);
    await drag(page, [100, 100], [300, 200]);
    // Ferramentas
    for (const mode of await page.$$eval('.mode-btn', (els) => els.map((e) => e.dataset.mode))) {
        await page.click(`[data-mode="${mode}"]`);
    }
    // Itens de menu que não abrem diálogo de arquivo nem baixam nada
    const items = [['editMenu', 'selectAllBtn'], ['editMenu', 'duplicateBtn'], ['editMenu', 'addMarkerMenuBtn'],
        ['editMenu', 'fitDurationMenuBtn'], ['editMenu', 'undoMenuBtn'], ['editMenu', 'redoMenuBtn'], ['exportMenu', 'cropRegionBtn']];
    for (const [menu, id] of items) {
        await page.click(`#${menu} > button`);
        await page.click(`#${id}`);
        await page.keyboard.press('Escape');
    }
    for (const id of ['undoBtn', 'redoBtn', 'zoomInBtn', 'zoomOutBtn', 'fitBtn', 'centerBtn', 'cameraPreviewBtn', 'cameraPreviewBtn',
        'zoomInTimelineBtn', 'zoomOutTimelineBtn', 'fitTimelineBtn', 'timelineResetBtn', 'addMarkerBtn', 'themeBtn', 'themeBtn']) {
        await page.click(`#${id}`);
    }
    await page.click('#helpBtn');
    await page.keyboard.press('Escape');
    await page.click('#sceneBtn');
    await page.keyboard.press('Escape');
    await page.click('#exportMenu > button');
    await page.click('#exportVideoBtn');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
});

