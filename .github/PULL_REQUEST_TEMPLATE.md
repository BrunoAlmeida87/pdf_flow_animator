## Descrição

Descreva o que este PR muda e por quê.

## Como testei

- [ ] Abri `main.html` no navegador e testei manualmente o fluxo afetado
- [ ] Rodei `npm run lint` e `npx playwright test` (ver [CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] Testei em pelo menos um navegador baseado em Chromium e um baseado em Firefox (se a mudança afeta compatibilidade)

## Screenshots / GIF

Inclua se a mudança for visual.

## Checklist

- [ ] A mudança não introduz métodos/funções com nome duplicado dentro da mesma classe/prototype
- [ ] Texto vindo de dados do usuário/importação vai para o DOM via `textContent` (ou `escapeHtml()` antes de `innerHTML`)
- [ ] Strings novas de UI têm tradução pt-BR e en em `js/i18n.js`
- [ ] Atualizei o README/CLAUDE.md se a mudança afeta a arquitetura ou o comportamento documentado
