// @ts-check
// Áudio: importação, mixagem, narração por cima (voice-over) e gravação contínua com narração.
// Usa o microfone falso do Chromium (--use-fake-device-for-media-stream).
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAIN_HTML_URL = 'file://' + path.resolve(__dirname, '..', 'main.html');
const sandboxChrome = process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : null;

test.use({
    permissions: ['microphone'],
    launchOptions: Object.assign(
        sandboxChrome && fs.existsSync(sandboxChrome) ? { executablePath: sandboxChrome } : {},
        { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
});

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

// ─── Áudio (microfone falso do Chromium) ──────────────────────────────────

function makeToneWav(seconds) {
    const sr = 16000, n = Math.round(sr * seconds);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / sr)), 44 + i * 2);
    const file = path.join(os.tmpdir(), `tone-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    fs.writeFileSync(file, buf);
    return file;
}

test('áudio importado vira clipe com forma de onda e entra na mixagem da exportação', async ({ page }) => {
    await gotoApp(page);
    const wav = makeToneWav(2);
    await page.setInputFiles('#audioInput', wav);
    await expect(page.locator('.timeline-item.audio')).toHaveCount(1, { timeout: 5000 });
    const res = await page.evaluate(async () => {
        const fa = window.flowAnimator;
        fa._captureScene();
        const mixed = await fa._mixExportAudio([fa._scene()]);
        let peak = 0;
        const d = mixed.getChannelData(0);
        for (let i = 0; i < d.length; i += 50) peak = Math.max(peak, Math.abs(d[i]));
        return { clip: fa.audioClips[0].duration, mixedDuration: mixed.duration, peak };
    });
    expect(res.clip).toBeCloseTo(2, 1);
    expect(res.mixedDuration).toBeGreaterThanOrEqual(2);
    expect(res.peak).toBeGreaterThan(0.1);
    fs.unlinkSync(wav);
});


test('Narrar grava a voz por cima da reprodução e cria um clipe de áudio', async ({ page }) => {
    await gotoApp(page);
    await drag(page, [100, 100], [300, 200]);
    await page.evaluate(() => window.flowAnimator.setTotalDuration(1.5));
    await page.click('#narrateBtn');
    await expect(page.locator('.timeline-item.audio')).toHaveCount(1, { timeout: 8000 });
    const clip = await page.evaluate(() => window.flowAnimator.audioClips[0]);
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBeGreaterThan(1);
});

test('Gravar com narração: relógio contínuo posiciona traços no tempo real', async ({ page }) => {
    await gotoApp(page);
    await page.click('#micToggleBtn');
    await page.click('#recordBtn');
    await page.waitForTimeout(2300); // contagem 3-2-1
    await drag(page, [100, 100], [300, 200], 4);
    await page.waitForTimeout(900);  // pausa real — NÃO é removida neste modo
    await drag(page, [100, 300], [300, 400], 4);
    await page.click('#recordBtn');
    await expect(page.locator('.timeline-item.audio')).toHaveCount(1, { timeout: 8000 });
    const res = await page.evaluate(() => {
        const fa = window.flowAnimator;
        return { a: fa.actions.map((x) => ({ s: x.startTime, d: x.duration })), clip: fa.audioClips[0] };
    });
    expect(res.a).toHaveLength(2);
    const gap = res.a[1].s - (res.a[0].s + res.a[0].d);
    expect(gap).toBeGreaterThan(0.6); // a pausa ficou na timeline (sincronizada com a voz)
    expect(res.clip.duration).toBeGreaterThan(res.a[1].s);
});
