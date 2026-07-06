// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAIN_HTML_URL = 'file://' + path.resolve(__dirname, '..', 'main.html');

// PDF.js é carregado via CDN (cdnjs.cloudflare.com). Alguns ambientes de CI/sandbox bloqueiam
// esse domínio; nenhum teste aqui exercita carregamento real de PDF, então interceptamos as
// duas URLs com um stub mínimo para manter os testes determinísticos em qualquer ambiente.
async function stubPdfJs(page) {
    await page.route('**cdnjs.cloudflare.com/**pdf.min.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("stub: sem PDF.js real nos testes")) }) };'
    }));
    await page.route('**cdnjs.cloudflare.com/**pdf.worker.min.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: '// stub worker'
    }));
}

async function gotoApp(page) {
    await stubPdfJs(page);
    await page.goto(MAIN_HTML_URL);
    await page.waitForTimeout(300);
}

test('carrega sem erros de console ou de página', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    await gotoApp(page);

    expect(errors).toEqual([]);
    await expect(page.locator('#canvas')).toBeVisible();
});

test('desenhar um traço registra a ação e aparece na timeline', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    await expect(page.locator('#drawCount')).toHaveText('1');
    await expect(page.locator('.timeline-item.draw')).toHaveCount(1);
});

test('apagar registra a ação separadamente do desenho', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    await page.click('[data-mode="erase"]');
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    await expect(page.locator('#eraseCount')).toHaveText('1');
});

test('adicionar comentário via UI atualiza contador e dados internos', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    await page.fill('#commentText', 'Comentário de teste');
    await page.click('#addCommentBtn');
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(300);

    await expect(page.locator('#commentCount')).toHaveText('1');
    const comments = await page.evaluate(() => window.flowAnimator.comments);
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('Comentário de teste');
});

test('undo/redo restauram o estado de comentários corretamente', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    await page.fill('#commentText', 'Comentário de teste');
    await page.click('#addCommentBtn');
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(300);
    await expect(page.locator('#commentCount')).toHaveText('1');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    await expect(page.locator('#commentCount')).toHaveText('0');

    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
    await expect(page.locator('#commentCount')).toHaveText('1');
});

test('importar JSON com comentário malicioso não executa script (regressão do fix de XSS)', async ({ page }) => {
    let xssFired = false;
    let dialogFired = false;
    page.on('dialog', async (dialog) => { dialogFired = true; await dialog.dismiss(); });

    await gotoApp(page);

    const maliciousJson = JSON.stringify({
        actions: [],
        comments: [{
            x: 200, y: 200,
            text: '<img src=x onerror="window.__xss=true">',
            time: 0, duration: 5,
            textColor: '#333333', bgColor: '#ffffff', borderColor: '#f39c12',
            fontFamily: 'Arial', fontSize: 16, opacity: 0.9
        }],
        settings: { animationSpeed: 1, totalAnimationTime: 10, persistPaths: true },
        timestamp: new Date().toISOString(), version: '1.1'
    });

    const jsonPath = path.join(os.tmpdir(), `malicious-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, maliciousJson);

    await page.click('#importBtn');
    await page.locator('#jsonInput').setInputFiles(jsonPath);
    await page.waitForTimeout(500);

    xssFired = await page.evaluate(() => window.__xss === true);
    expect(xssFired).toBe(false);
    expect(dialogFired).toBe(false);

    const titleEl = page.locator('.timeline-item-title').first();
    await expect(titleEl).toBeVisible();
    const innerHtml = await titleEl.innerHTML();
    expect(innerHtml).toContain('&lt;img');
    expect(innerHtml).not.toContain('<img src=x');

    fs.unlinkSync(jsonPath);
});
