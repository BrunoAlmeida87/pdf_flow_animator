# Contribuindo

Obrigado por contribuir com o PDF Flow Animator! O app em si continua zero-build (basta abrir `main.html`); as ferramentas de desenvolvimento (testes, lint) usam Node só para quem for contribuir.

## Como testar localmente

**Usar o app** não requer nada além de um navegador:

1. Faça um fork/clone do repositório.
2. Abra `main.html` diretamente no navegador (Chrome, Edge ou Firefox recomendados).
3. Teste manualmente o fluxo afetado pela sua mudança: importar PDF/imagem, desenhar, apagar, comentar, play/pause, undo/redo, trocar idioma, navegar a timeline só com teclado, exportar vídeo/frames/JSON — conforme relevante.

**Rodar a suíte automatizada** (Playwright) requer Node 22+:

```bash
npm ci
npx playwright install --with-deps chromium   # só na primeira vez / se os browsers não estiverem instalados
npx playwright test
```

Os testes ficam em `tests/app.spec.js` e cobrem: carregamento sem erros, desenhar, apagar, adicionar comentário, undo/redo, e uma regressão do fix de XSS via importação de JSON. Eles interceptam as URLs do PDF.js (CDN) com um stub, então rodam offline/determinísticos em qualquer ambiente.

Antes de abrir o PR, valide também a sintaxe de cada arquivo `.js` e o markup:

```bash
node -e "
const fs = require('fs');
for (const f of fs.readdirSync('js').filter(f => f.endsWith('.js'))) {
  new Function(fs.readFileSync('js/' + f, 'utf8'));
}
console.log('OK');
"
npx html-validate main.html index.html
```

O workflow de CI (`.github/workflows/validate-html.yml`) roda tudo isso automaticamente em cada PR (`html-validate`, checagem de sintaxe dos módulos, e a suíte Playwright), usando a configuração em `.htmlvalidate.json`. Algumas regras estilísticas do preset padrão do `html-validate` (`no-inline-style`, `no-implicit-button-type`, `no-trailing-whitespace`, `no-redundant-for`) foram desativadas porque conflitam com o estilo já existente no markup (estilos inline extensivos, botões sem `type` explícito) — corrigir isso em massa é uma reestruturação grande demais para ser feita incidentalmente. As regras que continuam ativas pegam problemas reais de markup (tags não fechadas, atributos inválidos, ids duplicados, etc.).

## Antes de editar

- Leia [CLAUDE.md](./CLAUDE.md) — tem o mapa de arquivos (`js/timeline-pro.js`, `js/flow-animator.js`, etc.), ordem de carregamento e convenções observadas no código.
- Prefira mudanças pequenas e cirúrgicas no arquivo relevante. Reestruturações maiores devem ser discutidas em uma issue antes de um PR grande, para alinhar expectativas.
- Ao adicionar/editar métodos em `FlowAnimator.prototype` ou na `class TimelinePro`, confira se já não existe um método com o mesmo nome — nomes duplicados são sobrescritos silenciosamente pelo JavaScript, sem erro (já houve casos assim corrigidos no histórico).
- Texto vindo de dados do usuário ou de arquivos JSON importados (ex.: `comment.text`) deve passar pela função `escapeHtml()` (`js/main.js`) antes de ser inserido via `innerHTML`, para evitar XSS — há um teste de regressão para isso em `tests/app.spec.js`.
- Use `showConfirm`/`showAlertModal`/`showPromptModal` (`js/modal.js`) em vez de `confirm()`/`alert()`/`prompt()` nativos.
- Textos de UI estática nova (botões, labels, headers de seção) devem ganhar uma entrada em `js/i18n.js` (pt-BR e en) e um atributo `data-i18n` no elemento, seguindo o padrão já usado no `main.html`.

## Processo de contribuição

1. Abra uma issue descrevendo o problema/melhoria antes de mudanças grandes (bugs pequenos e ajustes pontuais podem ir direto para um PR).
2. Crie um branch a partir de `main`.
3. Faça a mudança, testando manualmente e rodando a suíte automatizada conforme acima.
4. Abra um Pull Request preenchendo o template — descreva o que mudou, como testou, e inclua screenshot/GIF se for uma mudança visual.

## Estilo de código

- Mensagens de UI, tooltips e comentários voltados ao usuário final: em português (pt-BR) por padrão; strings de UI estática também devem ganhar tradução em inglês via `js/i18n.js` quando fizer sentido.
- Nomes de função/variável/classe: em inglês.
- Sem dependências externas de runtime além do PDF.js já carregado via CDN — evite adicionar novas bibliotecas de runtime sem discutir antes. Dependências de desenvolvimento (`devDependencies` em `package.json`, ex. Playwright) são aceitáveis desde que não afetem o uso do app em si.
