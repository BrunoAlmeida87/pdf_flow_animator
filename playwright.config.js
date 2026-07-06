// @ts-check
const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

// Alguns ambientes (ex.: sandboxes de desenvolvimento) pré-instalam o Chromium em um caminho
// fixo em vez de deixar o Playwright resolver a versão pinada automaticamente. Se existir,
// usamos esse executável; caso contrário (CI normal, após `npx playwright install`), deixamos
// o Playwright resolver a versão certa sozinho.
const sandboxChromePath = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
    : null;
const launchOptions = (sandboxChromePath && fs.existsSync(sandboxChromePath))
    ? { executablePath: sandboxChromePath }
    : {};

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 1000 },
        launchOptions
    }
});
