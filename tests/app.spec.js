// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAIN_HTML_URL = 'file://' + path.resolve(__dirname, '..', 'main.html');

// PDF.js é vendorizado em vendor/pdfjs/ (carregado localmente, sem CDN), então os testes
// rodam offline/determinísticos e podem até importar um PDF real (tests/fixtures/sample.pdf).

async function gotoApp(page) {
    await page.goto(MAIN_HTML_URL);
    await page.waitForTimeout(300);
    // Fecha o cartão de boas-vindas (estado vazio) para os cliques chegarem ao canvas
    const blank = page.locator('#emptyStartBlank');
    if (await blank.isVisible()) await blank.click();
}

// Clica num item de menu da topbar (Arquivo / Editar / Exportar)
async function clickMenuItem(page, menuId, itemId) {
    await page.click(`#${menuId} > button`);
    await page.click(`#${itemId}`);
}

// Seleciona a ferramenta de comentário (o painel do comentário só aparece com ela ativa)
async function useCommentTool(page) {
    await page.click('[data-mode="comment"]');
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

    await useCommentTool(page);
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

    await useCommentTool(page);
    await page.fill('#commentText', 'Comentário de teste');
    await page.click('#addCommentBtn');
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(300);
    await expect(page.locator('#commentCount')).toHaveText('1');

    await page.evaluate(() => document.activeElement && document.activeElement.blur());
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

test('Esc num modal de confirmação não vaza para os atalhos globais do app (regressão)', async ({ page }) => {
    await gotoApp(page);

    // "Limpar Tudo" só mostra o modal de confirmação se houver algo para limpar.
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Avança o playhead manualmente para um valor não-zero, sem usar play() (evita depender de timing).
    await page.evaluate(() => {
        window.flowAnimator.animationProgress = 0.5;
        window.flowAnimator.renderAnimationFrame();
    });

    // Abre o modal de confirmação (Editar ▸ Limpar cena) e confirma que apareceu.
    await clickMenuItem(page, 'editMenu', 'clearBtn');
    await expect(page.locator('.app-modal-overlay')).toBeVisible();

    // Esc deveria só cancelar o modal — não disparar o atalho global de Esc (que chama reset()
    // e zeraria animationProgress). Se vazasse, o valor abaixo seria 0 em vez de 0.5.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    const progressAfterEsc = await page.evaluate(() => window.flowAnimator.animationProgress);
    expect(progressAfterEsc).toBe(0.5);
});

test('trocar idioma com um arquivo carregado não reseta o nome do arquivo (regressão)', async ({ page }) => {
    await gotoApp(page);

    // Simula um arquivo carregado sem depender de PDF.js real (stubado neste ambiente de teste).
    await page.evaluate(() => {
        window.flowAnimator.isImage = true;
        document.getElementById('fileName').textContent = 'diagrama-exemplo.png';
    });

    await page.selectOption('#langSelect', 'en');
    await page.waitForTimeout(100);
    await expect(page.locator('#fileName')).toHaveText('diagrama-exemplo.png');

    await page.selectOption('#langSelect', 'pt-BR');
    await page.waitForTimeout(100);
    await expect(page.locator('#fileName')).toHaveText('diagrama-exemplo.png');
});

// ─── Regressões do lote de melhorias profundas ─────────────────────────────

test('badge PARALELO só aparece com sobreposição temporal real', async ({ page }) => {
    await gotoApp(page);

    // Dois desenhos NÃO sobrepostos (0-1s e 2-3s) → sem badge
    await page.evaluate(() => {
        window.flowAnimator.actions.push(
            { type: 'draw', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }], color: '#f00', width: 3, startTime: 0, duration: 1 },
            { type: 'draw', points: [{ x: 60, y: 60 }, { x: 90, y: 90 }], color: '#0f0', width: 3, startTime: 2, duration: 1 }
        );
        window.flowAnimator.timeline.refresh();
    });
    let headerHtml = await page.locator('#trackHeaders').innerHTML();
    expect(headerHtml).not.toContain('PARALELO');

    // Agora com sobreposição real (0-1s e 0.5-1.5s) → badge aparece
    await page.evaluate(() => {
        window.flowAnimator.actions[1].startTime = 0.5;
        window.flowAnimator.timeline.refresh();
    });
    headerHtml = await page.locator('#trackHeaders').innerHTML();
    expect(headerHtml).toContain('PARALELO');
});

test('animação não clipa traços abaixo de 1080px após redimensionar canvas (PDF retrato)', async ({ page }) => {
    await gotoApp(page);

    const pixel = await page.evaluate(() => {
        const fa = window.flowAnimator;
        // Simula o efeito de renderPage num A4 retrato em scale 2 (1190×1684)
        fa._syncCanvasSizes(1190, 1684);
        // Traço na região que antes era clipada (y > 1080)
        fa.actions.push({
            type: 'draw',
            points: [{ x: 100, y: 1400 }, { x: 400, y: 1400 }],
            color: '#ff0000', width: 20, startTime: 0, duration: 1
        });
        // Render num tempo em que a ação já terminou (persistPaths mantém visível)
        fa.animationProgress = 0.5; // 5s de 10s — bem depois do fim da ação
        fa.renderAnimationFrame();
        const d = fa.ctx.getImageData(250, 1400, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
    });

    // O pixel no meio do traço deve ser vermelho (antes: branco, clipado pelo offscreen 1080p)
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeLessThan(100);
});

test('Ctrl+Z dentro do textarea não dispara o undo do canvas', async ({ page }) => {
    await gotoApp(page);

    // Desenha um traço (vira 1 ação)
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    await expect(page.locator('#drawCount')).toHaveText('1');

    // Ctrl+Z com o foco no textarea de comentário: NÃO deve desfazer a ação do canvas
    await useCommentTool(page);
    await page.locator('#commentText').focus();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    await expect(page.locator('#drawCount')).toHaveText('1');

    // Fora do textarea (foco devolvido ao body), Ctrl+Z continua desfazendo normalmente
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    await expect(page.locator('#drawCount')).toHaveText('0');
});

test('mudar velocidade durante playback não faz o playhead saltar', async ({ page }) => {
    await gotoApp(page);

    const progressAfter = await page.evaluate(async () => {
        const fa = window.flowAnimator;
        fa.actions.push({ type: 'draw', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#000', width: 3, startTime: 0, duration: 9 });
        fa.animationProgress = 0.5;
        fa.play(); // inicia em 50%
        // Muda a velocidade para 2x em pleno playback
        const speed = document.getElementById('animSpeed');
        speed.value = '2';
        speed.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 100));
        const p = fa.animationProgress;
        fa.pause();
        return p;
    });

    // Sem o fix: elapsed reescalado → progresso saltaria para ~1.0.
    // Com o fix: 100ms a 2x sobre 10s ≈ +0.02 → fica perto de 0.5.
    expect(progressAfter).toBeGreaterThan(0.49);
    expect(progressAfter).toBeLessThan(0.6);
});

test('play() duplo não deixa a Promise do export pendurada', async ({ page }) => {
    await gotoApp(page);

    const resolved = await page.evaluate(async () => {
        const fa = window.flowAnimator;
        fa.actions.push({ type: 'draw', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#000', width: 3, startTime: 0, duration: 1 });
        const first = fa.play();
        fa.play(); // segunda chamada (ex.: usuário aperta Espaço durante gravação)
        fa.reset(); // encerra o playback
        // A primeira Promise deve resolver (com timeout de guarda de 1s)
        return await Promise.race([
            first.then(() => true),
            new Promise(r => setTimeout(() => r(false), 1000))
        ]);
    });
    expect(resolved).toBe(true);
});

test('modo timeline grava traços em sequência, não empilhados no mesmo tempo (regressão)', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    // Ativa o modo gravação (a agulha passa a correr e os traços entram em sequência)
    await page.evaluate(() => window.flowAnimator.enterTimelineMode());

    // Primeiro traço
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    // Segundo traço, após uma pausa (a pausa deve ser ignorada no modo sequencial)
    await page.mouse.move(box.x + 160, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 160, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    const actions = await page.evaluate(() =>
        window.flowAnimator.actions.map(a => ({ startTime: a.startTime, duration: a.duration }))
    );
    expect(actions).toHaveLength(2);

    // Primeiro traço começa em 0
    expect(actions[0].startTime).toBe(0);
    // Segundo começa exatamente no fim do primeiro — sequencial, sem espaço vazio
    expect(actions[1].startTime).toBeCloseTo(actions[0].startTime + actions[0].duration, 5);
    // Regressão: antes do fix ambos ganhavam o mesmo startTime (agulha parada) e ficavam empilhados em 0
    expect(actions[1].startTime).toBeGreaterThan(0);

    await page.evaluate(() => window.flowAnimator.exitTimelineMode());
});

test('modo timeline: undo de um traço reposiciona o cursor de gravação (sem espaço vazio) (regressão)', async ({ page }) => {
    await gotoApp(page);

    const box = await page.locator('#canvas').boundingBox();
    await page.evaluate(() => window.flowAnimator.enterTimelineMode());

    // Grava o primeiro traço (começa em 0)
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => window.flowAnimator.actions.length)).toBe(1);

    // Desfaz ainda dentro do modo gravação (foco fora de campos de texto p/ o atalho valer)
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => window.flowAnimator.actions.length)).toBe(0);

    // Grava um segundo traço — deve recomeçar em 0, não após o traço removido
    await page.mouse.move(box.x + 160, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    const actions = await page.evaluate(() =>
        window.flowAnimator.actions.map(a => ({ startTime: a.startTime }))
    );
    expect(actions).toHaveLength(1);
    // Regressão: sem o fix, o cursor continuava após o traço apagado e deixava um vão inicial
    expect(actions[0].startTime).toBe(0);

    await page.evaluate(() => window.flowAnimator.exitTimelineMode());
});

test('modo timeline: limpar conteúdo pré-existente não deixa piso de gravação obsoleto (regressão)', async ({ page }) => {
    await gotoApp(page);

    // Conteúdo que termina em 5s, criado ANTES de entrar no modo; agulha fica em 0.
    await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions.push({ type: 'draw', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }], color: '#f00', width: 3, startTime: 3, duration: 2 });
        fa.timeline.refresh();
        fa.animationProgress = 0;
        fa.enterTimelineMode();
    });

    // Remove todo o conteúdo estando ainda no modo gravação.
    await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions.length = 0;
        fa.comments.length = 0;
        fa.rebuildDrawingCanvas();
        fa.timeline.refresh();
    });

    // Grava um traço — deve começar em 0, não no fim (5s) do conteúdo que foi removido.
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);

    const start = await page.evaluate(() => window.flowAnimator.actions[0].startTime);
    // Regressão: com o piso gravando o fim do conteúdo, isto seria 5 (vão em branco de 0–5s)
    expect(start).toBe(0);

    await page.evaluate(() => window.flowAnimator.exitTimelineMode());
});

test('modo timeline: a agulha não avança sozinha quando ocioso (regressão)', async ({ page }) => {
    await gotoApp(page);

    const box = await page.locator('#canvas').boundingBox();
    await page.evaluate(() => window.flowAnimator.enterTimelineMode());

    // Logo após entrar, sem desenhar nada: a agulha deve ficar parada (não correr até o fim)
    const enter1 = await page.evaluate(() => window.flowAnimator.animationProgress);
    await page.waitForTimeout(500);
    const enter2 = await page.evaluate(() => window.flowAnimator.animationProgress);
    expect(enter2).toBe(enter1);

    // Desenha um traço e fica ocioso: a agulha deve parar no fim do traço, não avançar
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const draw1 = await page.evaluate(() => window.flowAnimator.animationProgress);
    await page.waitForTimeout(500);
    const draw2 = await page.evaluate(() => window.flowAnimator.animationProgress);
    // Regressão: antes, o relógio seguia correndo na pausa e a agulha ia até o fim
    expect(draw2).toBe(draw1);

    await page.evaluate(() => window.flowAnimator.exitTimelineMode());
});

test('modo timeline: undo/deleção reancoram a agulha ociosa no próximo início (regressão)', async ({ page }) => {
    await gotoApp(page);

    const box = await page.locator('#canvas').boundingBox();
    await page.evaluate(() => window.flowAnimator.enterTimelineMode());

    // Desenha um traço → agulha para no fim dele (> 0)
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const afterDraw = await page.evaluate(() => window.flowAnimator.animationProgress);
    expect(afterDraw).toBeGreaterThan(0);

    // Undo estando OCIOSO (sem novo mousedown): a agulha deve voltar sozinha para 0,
    // pois _nextRecordStart() virou 0. Antes do fix ela ficava presa no fim do traço apagado.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.flowAnimator.actions.length)).toBe(0);
    const afterUndo = await page.evaluate(() => window.flowAnimator.animationProgress);
    expect(afterUndo).toBe(0);

    await page.evaluate(() => window.flowAnimator.exitTimelineMode());
});

test('posicionar comentário em modo apagar não cria ação-fantasma', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();

    // Posicionamento de comentário iniciado e, em seguida, troca para o apagador (E)
    await useCommentTool(page);
    await page.fill('#commentText', 'Sem fantasma');
    await page.click('#addCommentBtn');
    await page.waitForTimeout(150);
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.flowAnimator.mode)).toBe('erase');
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(200);

    await expect(page.locator('#commentCount')).toHaveText('1');
    await expect(page.locator('#eraseCount')).toHaveText('0'); // sem ação-fantasma
});

test('botão de visibilidade oculta os itens da track de verdade', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    await expect(page.locator('.timeline-item.draw')).toHaveCount(1);

    // Oculta a track de desenhos
    await page.click('[data-track="draw"][data-action="visibility"]');
    await page.waitForTimeout(150);
    await expect(page.locator('.timeline-item.draw')).toHaveCount(0);
    await expect(page.locator('.timeline-track.hidden-track')).toHaveCount(1);

    // O traço também some do canvas estático
    const visible = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const p = fa.actions[0].points[0];
        const d = fa.ctx.getImageData(Math.round(p.x) + 2, Math.round(p.y) + 2, 1, 1).data;
        return d[0] < 240 || d[1] < 240 || d[2] < 240; // não-branco = traço visível
    });
    expect(visible).toBe(false);
});

test('track travada bloqueia deleção via tecla Delete', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Trava a track de desenhos
    await page.click('[data-track="draw"][data-action="lock"]');
    await page.waitForTimeout(100);

    // Delete no item focado não deve remover nada (nem abrir modal)
    await page.locator('.timeline-item.draw').first().focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    await expect(page.locator('#drawCount')).toHaveText('1');
});

test('arrastar item na timeline é desfazível com Ctrl+Z', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const before = await page.evaluate(() => window.flowAnimator.actions[0].startTime);

    // Arrasta o item da timeline ~200px para a direita (com Shift para desativar snap)
    const item = page.locator('.timeline-item.draw').first();
    const ib = await item.boundingBox();
    await page.keyboard.down('Shift');
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(ib.x + ib.width / 2 + 200, ib.y + ib.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => window.flowAnimator.actions[0].startTime);
    expect(after).toBeGreaterThan(before + 1); // moveu de verdade (200px ≈ 2s a 100px/s)

    // Ctrl+Z restaura a posição original
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const restored = await page.evaluate(() => window.flowAnimator.actions[0].startTime);
    expect(restored).toBeCloseTo(before, 1);
});

test('exportar frames gera um único download .zip', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Duração curtinha para o teste ser rápido (6 frames a 30fps)
    await page.evaluate(() => { window.flowAnimator.totalAnimationTime = 0.2; });

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.evaluate(() => window.flowAnimator.exportAsFrames());
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^frames_\d+\.zip$/);
});

test('salvar/carregar via localStorage faz round-trip do projeto com fundo', async ({ page }) => {
    await gotoApp(page);

    const roundTrip = await page.evaluate(async () => {
        const fa = window.flowAnimator;
        // Simula um fundo carregado (imagem 100×80 vermelha)
        const bg = document.createElement('canvas');
        bg.width = fa.canvas.width; bg.height = fa.canvas.height;
        const bctx = bg.getContext('2d');
        bctx.fillStyle = '#cc2200';
        bctx.fillRect(0, 0, bg.width, bg.height);
        fa._setBackgroundFromImageData(bctx.getImageData(0, 0, bg.width, bg.height));

        fa.actions.push({ type: 'draw', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: '#00f', width: 3, startTime: 1, duration: 2 });
        fa.saveToLocalStorage();

        // Zera o estado e recarrega
        fa.actions = [];
        fa._setBackgroundFromImageData(null);
        fa.loadFromLocalStorage();
        await new Promise(r => setTimeout(r, 300)); // decodificação assíncrona do fundo

        const d = fa.ctx.getImageData(500, 500, 1, 1).data;
        return {
            actionsLen: fa.actions.length,
            startTime: fa.actions[0] && fa.actions[0].startTime,
            bgRestored: d[0] > 150 && d[1] < 100 // pixel vermelho do fundo restaurado
        };
    });

    expect(roundTrip.actionsLen).toBe(1);
    expect(roundTrip.startTime).toBe(1);
    expect(roundTrip.bgRestored).toBe(true);
});

test('setas movem item focado da timeline e mantêm o foco', async ({ page }) => {
    await gotoApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const before = await page.evaluate(() => window.flowAnimator.actions[0].startTime);

    await page.locator('.timeline-item.draw').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => window.flowAnimator.actions[0].startTime);
    expect(after).toBeCloseTo(before + 0.1, 3);

    // Foco continua no item (permite apertar a seta de novo)
    const focusedIsItem = await page.evaluate(() => document.activeElement.classList.contains('timeline-item'));
    expect(focusedIsItem).toBe(true);
});

test('reimportar projeto com mesma assinatura de timeline atualiza DOM e delete funciona (regressão)', async ({ page }) => {
    await gotoApp(page);

    // Comentário "Antes" em 0s/3s — assinatura da timeline: comment_0,0,3
    const projA = {
        actions: [],
        comments: [{ x: 200, y: 200, text: 'Antes', time: 0, duration: 3,
            textColor: '#333333', bgColor: '#ffffff', borderColor: '#f39c12',
            fontFamily: 'Arial', fontSize: 16, opacity: 0.9 }],
        settings: { animationSpeed: 1, totalAnimationTime: 10, persistPaths: true },
        version: '1.2'
    };
    // Mesmo id/tempo/duração, mas OUTRO objeto com texto diferente
    const projB = JSON.parse(JSON.stringify(projA));
    projB.comments[0].text = 'Depois';

    await page.evaluate((p) => window.flowAnimator.loadDataFromObject(p), projA);
    await page.waitForTimeout(150);
    await expect(page.locator('.timeline-item-title')).toContainText('Antes');

    await page.evaluate((p) => window.flowAnimator.loadDataFromObject(p), projB);
    await page.waitForTimeout(150);
    // Sem o fix: assinatura idêntica → DOM antigo mantido → título ainda "Antes"
    await expect(page.locator('.timeline-item-title')).toContainText('Depois');

    // E o delete precisa agir sobre o objeto NOVO (indexOf(item.data) não pode virar no-op).
    // Usa foco + tecla Delete (o botão × só fica visível no hover) — mesmo caminho de código.
    await page.locator('.timeline-item.comment').first().focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    // Sem modal: a exclusão mostra um aviso com "Desfazer"
    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    await expect(page.locator('.toast .toast-action')).toBeVisible();
    await expect(page.locator('#commentCount')).toHaveText('0');
    const commentsLeft = await page.evaluate(() => window.flowAnimator.comments.length);
    expect(commentsLeft).toBe(0);
});

// ─── Etapa 1: regressões dos bugs confirmados na auditoria ─────────────────

const FIXTURE_PDF = path.resolve(__dirname, 'fixtures', 'sample.pdf');

async function drawStroke(page, from, to, steps = 6) {
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + from[0], box.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0], box.y + to[1], { steps });
    await page.mouse.up();
    await page.waitForTimeout(120);
}

test('layout inicial: sidebar e botões de zoom cabem na tela em 1366×768 (regressão)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoApp(page);
    const m = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { sidebarRight: r('.inspector').right, sidebarLeft: r('.inspector').left, fitRight: r('#fitBtn').right, vw: innerWidth, docW: document.documentElement.scrollWidth };
    });
    // Antes: o canvas de 1920px empurrava a sidebar para x=1920 (fora da tela)
    expect(m.sidebarLeft).toBeLessThan(m.vw);
    expect(m.sidebarRight).toBeLessThanOrEqual(m.vw + 1);
    expect(m.fitRight).toBeLessThanOrEqual(m.vw);
    expect(m.docW).toBeLessThanOrEqual(m.vw); // sem rolagem horizontal da página
});

test('timeline cabe inteira na viewport, sem nada fixo por cima (regressão)', async ({ page }) => {
    await gotoApp(page);
    const m = await page.evaluate(() => {
        const r = document.querySelector('.timeline-area').getBoundingClientRect();
        const probe = document.elementFromPoint(r.left + r.width / 2, r.bottom - 4);
        return { bottom: r.bottom, vh: innerHeight, insideTimeline: !!(probe && probe.closest('.timeline-area')) };
    });
    expect(m.bottom).toBeLessThanOrEqual(m.vh + 0.5);
    expect(m.insideTimeline).toBe(true); // antes a barra de status fixa cobria o rodapé da timeline
});

test('importar PDF real usa isEvalSupported:false (CVE-2024-4367) e renderiza a página', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
        // As propriedades do namespace UMD do PDF.js são somente-leitura — espiona via Proxy
        const lib = window.pdfjsLib;
        window.__pdfParams = null;
        window.pdfjsLib = new Proxy(lib, {
            get(target, key) {
                if (key === 'getDocument') return (params) => { window.__pdfParams = params; return target.getDocument(params); };
                return target[key];
            }
        });
    });
    await page.setInputFiles('#pdfInput', FIXTURE_PDF);
    await expect(page.locator('#fileName')).toContainText('Página 1/2', { timeout: 10000 });
    const info = await page.evaluate(() => {
        const fa = window.flowAnimator;
        // O retângulo azul da página 1 ocupa a região (40..240, 40..160) em pontos PDF (y invertido)
        const scale = fa.canvas.width / 420;
        const d = fa.ctx.getImageData(Math.round(100 * scale), Math.round((298 - 100) * scale), 1, 1).data;
        return { isEvalSupported: window.__pdfParams && window.__pdfParams.isEvalSupported, blue: d[2] > 200 && d[0] < 60 };
    });
    expect(info.isEvalSupported).toBe(false);
    expect(info.blue).toBe(true);
});

test('botão ✂️ Região entra no modo crop sem erro de página (regressão)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await gotoApp(page);
    await clickMenuItem(page, 'exportMenu', 'cropRegionBtn');
    await page.waitForTimeout(150);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.flowAnimator.mode)).toBe('crop');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.flowAnimator.mode)).toBe('draw');
});

test('soltar o mouse fora do canvas finaliza o traço (regressão)', async ({ page }) => {
    await gotoApp(page);
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 4 });
    await page.mouse.move(box.x + 100, box.y + box.height + 40, { steps: 4 }); // sai do canvas
    await page.mouse.up();
    await page.waitForTimeout(100);
    const s1 = await page.evaluate(() => ({ drawing: window.flowAnimator.isDrawing, n: window.flowAnimator.actions.length }));
    expect(s1).toEqual({ drawing: false, n: 1 });
    // Voltar ao canvas sem botão pressionado não pode continuar desenhando
    await page.mouse.move(box.x + 300, box.y + 150, { steps: 4 });
    expect(await page.evaluate(() => window.flowAnimator.isDrawing)).toBe(false);
});

test('reprodução respeita a ordem cronológica: apagar antigo não apaga traço posterior (regressão)', async ({ page }) => {
    await gotoApp(page);
    const px = await page.evaluate(() => {
        const fa = window.flowAnimator;
        fa.actions = [
            { type: 'erase', points: [{ x: 300, y: 600 }, { x: 700, y: 600 }], size: 60, startTime: 2, duration: 1 },
            { type: 'draw', points: [{ x: 500, y: 450 }, { x: 500, y: 750 }], color: '#ff0000', width: 10, startTime: 5, duration: 1 }
        ];
        fa.totalAnimationTime = 10;
        fa.rebuildDrawingCanvas();
        fa.redrawMainCanvas();
        const read = () => Array.from(fa.ctx.getImageData(500, 600, 1, 1).data.slice(0, 3));
        const edit = read();
        fa.animationProgress = 1;
        fa.renderAnimationFrame();
        return { edit, playback: read() };
    });
    expect(px.edit).toEqual([255, 0, 0]);
    expect(px.playback).toEqual(px.edit); // antes: o fundo branco (o apagar de t=2s "apagava o futuro")
});

test('linha reta de 2 pontos anima proporcionalmente à duração (regressão)', async ({ page }) => {
    await gotoApp(page);
    const reach = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const c = document.createElement('canvas'); c.width = 200; c.height = 20;
        const ctx = c.getContext('2d');
        const at = (p) => {
            ctx.clearRect(0, 0, 200, 20);
            fa.drawAnimatedPath(ctx, [{ x: 0, y: 10 }, { x: 200, y: 10 }], '#000', 2, p);
            const d = ctx.getImageData(0, 10, 200, 1).data;
            let max = 0;
            for (let x = 0; x < 200; x++) if (d[x * 4 + 3] > 0) max = x;
            return max;
        };
        return [at(0.25), at(0.5), at(0.75)];
    });
    // Antes: [102, 199, 199] — completa na metade da duração e para
    expect(reach[0]).toBeGreaterThan(40); expect(reach[0]).toBeLessThan(60);
    expect(reach[1]).toBeGreaterThan(90); expect(reach[1]).toBeLessThan(110);
    expect(reach[2]).toBeGreaterThan(140); expect(reach[2]).toBeLessThan(160);
});

test('"Limpar Tudo" é desfazível com Ctrl+Z (regressão)', async ({ page }) => {
    await gotoApp(page);
    await drawStroke(page, [40, 40], [140, 90]);
    await drawStroke(page, [60, 140], [200, 160]);
    await drawStroke(page, [220, 40], [300, 120]);
    await expect(page.locator('#drawCount')).toHaveText('3');
    await clickMenuItem(page, 'editMenu', 'clearBtn');
    await page.click('.app-modal-overlay [data-action="ok"]');
    await expect(page.locator('#drawCount')).toHaveText('0');
    await page.keyboard.press('Control+z');
    await expect(page.locator('#drawCount')).toHaveText('3'); // antes: voltava só 2
});

test('itens paralelos ficam em lanes próprias, sem cobrir uns aos outros (regressão)', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
        const fa = window.flowAnimator;
        for (let i = 0; i < 3; i++) {
            fa.actions.push({ type: 'draw', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], color: '#000', width: 3, startTime: 1, duration: 3 });
        }
        fa.timeline.refresh();
    });
    const rects = await page.$$eval('.timeline-item.draw', els => els.map(e => {
        const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom };
    }));
    expect(rects).toHaveLength(3);
    rects.sort((a, b) => a.top - b.top);
    for (let i = 1; i < rects.length; i++) {
        expect(rects[i].top).toBeGreaterThanOrEqual(rects[i - 1].bottom); // sem sobreposição vertical
    }
    // Header da track alinhado e com a mesma altura da track (antes: 40px desalinhado)
    const align = await page.evaluate(() => {
        const header = document.querySelectorAll('#trackHeaders .track-header')[0].getBoundingClientRect();
        const track = document.querySelector('.timeline-track[data-track-id="draw"]').getBoundingClientRect();
        return { dTop: Math.abs(header.top - track.top), dH: Math.abs(header.height - track.height) };
    });
    expect(align.dTop).toBeLessThan(1.5);
    expect(align.dH).toBeLessThan(1.5);
});

test('um aviso novo não é escondido pelo timer do anterior (regressão)', async ({ page }) => {
    await gotoApp(page);
    const shown = await page.evaluate(async () => {
        const fa = window.flowAnimator;
        fa.showTooltip('primeiro');
        await new Promise(r => setTimeout(r, 2500));
        fa.showTooltip('segundo');
        await new Promise(r => setTimeout(r, 900));
        const toasts = Array.from(document.querySelectorAll('#toasts .toast-text')).map(e => e.textContent);
        return toasts.includes('segundo');
    });
    expect(shown).toBe(true);
});

test('preview do apagador acompanha o zoom de exibição (regressão)', async ({ page }) => {
    await gotoApp(page);
    await page.click('[data-mode="erase"]');
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.move(box.x + 210, box.y + 205);
    const m = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const k = fa.canvas.getBoundingClientRect().width / fa.canvas.width;
        return { previewW: parseFloat(document.getElementById('eraserPreview').style.width), expected: fa.eraseSize * k };
    });
    expect(Math.abs(m.previewW - Math.max(4, m.expected))).toBeLessThan(0.6);
});

test('comentário com Enter é desenhado em várias linhas (regressão)', async ({ page }) => {
    await gotoApp(page);
    const box = await page.evaluate(() => {
        const fa = window.flowAnimator;
        const c = { x: 400, y: 300, text: 'Linha 1\nLinha 2\nLinha 3', time: 0, duration: 3, fontSize: 20 };
        fa.comments.push(c);
        const b = fa._getCommentBox(c);
        return { lines: b.layout.lines.length, h: b.h };
    });
    expect(box.lines).toBe(3);
    expect(box.h).toBeGreaterThan(3 * 20);
});
