# Contribuindo

Obrigado por contribuir com o PDF Flow Animator! O app em si é zero-build (basta abrir `main.html`); as ferramentas de desenvolvimento (testes, lint) usam Node só para quem for contribuir.

## Como testar localmente

**Usar o app** não requer nada além de um navegador:

1. Faça um fork/clone do repositório.
2. Abra `main.html` diretamente no navegador (Chrome, Edge ou Firefox recomendados) — ou sirva a pasta por HTTP (`npx serve .`) para testar o modo publicado.
3. Teste manualmente o fluxo afetado pela sua mudança: importar PDF/imagem, desenhar com as ferramentas, selecionar/mover, gravar, reproduzir, desfazer/refazer, trocar idioma e tema, navegar a timeline só com teclado, exportar vídeo/GIF/frames/JSON — conforme relevante.

**Rodar as verificações** requer Node 22+:

```bash
npm ci
npm run lint                                   # ESLint + métodos duplicados/inexistentes + html-validate
npx playwright install --with-deps chromium    # só na primeira vez / se os browsers não estiverem instalados
npx playwright test
```

Os testes ficam em `tests/`:

- `app.spec.js` — fluxos básicos e regressões de bugs/segurança (XSS via JSON, CVE-2024-4367, layout, ordem cronológica de apagamentos…);
- `features.spec.js` — ferramentas, caneta/toque, seleção, timeline, cenas, câmera, exportação, autosave, validação de import, i18n, tema e um smoke test de todos os botões;
- `audio.spec.js` — importação de áudio, narração e gravação com microfone (usa o microfone falso do Chromium);
- `pwa.spec.js` — manifest, lista de precache do service worker e o app servido por um servidor HTTP local: instala o SW, derruba a "rede" e confere que o app abre, importa PDF e carrega o Mediabunny offline.

O PDF.js é vendorizado, então os testes rodam offline e importam um PDF real (`tests/fixtures/sample.pdf`). Os testes rodam com locale `pt-BR` (ver `playwright.config.js`) — o app detecta o idioma do navegador.

O workflow de CI (`.github/workflows/validate-html.yml`) roda tudo isso em cada PR. Algumas regras estilísticas do preset do `html-validate` (`no-inline-style`, `no-implicit-button-type`, `no-trailing-whitespace`, `no-redundant-for`) estão desativadas em `.htmlvalidate.json`; as ativas pegam problemas reais de markup.

## Antes de editar

- Leia [CLAUDE.md](./CLAUDE.md) — tem o mapa de arquivos, a ordem de carregamento, o modelo de dados e as invariantes (render único, imutabilidade para o undo, modo gravação…).
- Prefira mudanças pequenas e cirúrgicas no arquivo relevante. Reestruturações maiores devem ser discutidas numa issue antes.
- Ao adicionar métodos em `FlowAnimator.prototype` (vários arquivos) ou numa `class`, confira se o nome já não existe — o CI falha com duplicatas (`scripts/check-duplicates.js`) e com chamadas a métodos que não existem (`scripts/check-methods.js`).
- Arquivo novo carregado pelo app? Inclua-o no `PRECACHE` de `sw.js` (senão a PWA quebra offline — o `pwa.spec.js` avisa).
- Texto vindo de dados do usuário ou de arquivos importados vai para o DOM via `textContent` (ou `escapeHtml()` se precisar de `innerHTML`).
- Use `showConfirm`/`showAlertModal`/`showPromptModal`/`showFormModal` (`js/modal.js`) em vez de `confirm()`/`alert()`/`prompt()`.
- Toda string de UI nova ganha uma chave em `js/i18n.js` (pt-BR **e** en) e é usada via `t()` ou `data-i18n*`.

## Processo de contribuição

1. Abra uma issue descrevendo o problema/melhoria antes de mudanças grandes (bugs pequenos podem ir direto para um PR).
2. Crie um branch a partir de `main`.
3. Faça a mudança, testando manualmente e rodando `npm run lint` e `npx playwright test`.
4. Abra um Pull Request preenchendo o template — o que mudou, como testou, e screenshot/GIF se for visual.

## Estilo de código

- Mensagens de UI: chaves em `js/i18n.js`; comentários de código em português; nomes de função/variável/classe em inglês.
- `FlowAnimator` usa função construtora + `prototype` (pré-ES6); `TimelinePro`, `Inspector`, `AudioEngine`, `GifEncoder` usam `class`. Siga o estilo do arquivo em que está mexendo.
- Dependências de runtime ficam **vendorizadas** em `vendor/` (com a licença ao lado) e carregadas por `<script>` clássico — nunca via CDN nem `type="module"`. Evite adicionar novas sem discutir antes. Dependências de desenvolvimento (`devDependencies`) são aceitáveis.
