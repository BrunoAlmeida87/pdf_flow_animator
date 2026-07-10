# Notas para assistentes de IA / desenvolvedores

Contexto técnico para quem (humano ou IA) for editar este repositório. Para a visão de produto/usuário, veja [README.md](./README.md).

## Estrutura do repositório

O app é modular (HTML/CSS/JS em arquivos separados), mas **sem bundler/build step** — tudo é carregado via `<link>`/`<script src>` clássico (nunca `type="module"`: ES modules são bloqueados por CORS quando `main.html` é aberto via `file://`, e esse é o modo de uso principal documentado no README).

| Arquivo | Conteúdo |
|---|---|
| `main.html` | Só markup + as tags que carregam CSS/JS. |
| `css/styles.css` | Todo o CSS. |
| `js/i18n.js` | Dicionário pt-BR/en (`I18N`) + `applyI18n(lang)`. Carrega primeiro; não depende de mais nada. |
| `js/modal.js` | `showConfirm`/`showAlertModal`/`showPromptModal` (Promise-based) — substituem `confirm()`/`alert()`/`prompt()` nativos. Interceptam keydown na fase de captura (bloqueiam atalhos globais enquanto abertos) e prendem o Tab (focus trap). Depende de `escapeHtml` (definido em `js/main.js`, carregado depois — funciona porque essas funções só são *chamadas* depois do DOM pronto, não no load do script). |
| `js/zip.js` | `class ZipBuilder` — ZIP mínimo (STORE + CRC32) para a exportação de frames num único download. Sem dependências. |
| `js/timeline-pro.js` | `class TimelinePro` — timeline multi-track: renderização de tracks/régua, detecção de sobreposição via *sweep-line* O(n log n), organização de itens sobrepostos em camadas, drag/resize (pixel ↔ segundo), zoom, playhead. |
| `js/flow-animator.js` | `function FlowAnimator` + `FlowAnimator.prototype.*` — núcleo do app: canvas duplo, desenho/apagador, comentários, motor de animação, undo/redo, crop, exportação de vídeo/frames, PDF/imagem, `localStorage`/JSON. |
| `js/main.js` | `escapeHtml`/`insertEmoji`, configuração do `pdfjsLib.GlobalWorkerOptions`, e o bloco `DOMContentLoaded` que instancia `new FlowAnimator()`. |

**Ordem de carregamento importa** (ver `<script src>` no fim de `main.html`): `i18n.js` → `modal.js` → `zip.js` → `timeline-pro.js` → `flow-animator.js` → `main.js`. `FlowAnimator` instancia `new TimelinePro(this)` no construtor, então `TimelinePro` precisa já existir; `modal.js`/`i18n.js` chamam `escapeHtml` só dentro de handlers de evento (não no top-level do script), por isso podem carregar antes de `main.js` definir essa função.

Ao propor mudanças, prefira edições cirúrgicas no arquivo relevante em vez de reestruturar tudo de novo.

## Convenções observadas (não normativas, apenas descritivas do estado atual)

- `FlowAnimator` é uma função construtora clássica com métodos em `FlowAnimator.prototype.*` (pré-ES6). `TimelinePro` já usa `class` (ES6). Não há um padrão único — ao adicionar métodos novos, siga o estilo do arquivo em que está mexendo.
- Toda a UI (labels, tooltips, mensagens) tem texto-base em português (pt-BR); parte da UI estática (botões, headers de seção, labels de formulário) também tem tradução em inglês via `data-i18n` + `js/i18n.js` — strings dinâmicas interpoladas (tooltips com valores, mensagens de status) continuam só em pt-BR. Nomes de função/variável estão em inglês.
- Duas telas de canvas coexistem sempre: `this.canvas`/`this.ctx` (visível, fundo + composição final) e `this.drawingCanvas`/`this.drawingCtx` (somente traços do usuário). O apagador (`destination-out`) atua **apenas** no `drawingCtx`, nunca diretamente no canvas principal — isso é o que permite apagar sem destruir o PDF/imagem de fundo. Ao mexer em lógica de desenho/apagador, preserve essa separação.
- Cada ação (`draw`/`erase`) e cada comentário carrega um **tempo absoluto** (`startTime`/`time`) e uma `duration`, não uma posição sequencial — isso é o que permite ações paralelas na timeline. Não assuma que `actions[i]` é renderizado antes de `actions[i+1]`; sempre considere `startTime`.
- O **Modo Timeline** (`timelineMode`, botão 🎬) é um **modo de gravação**: enquanto ativo, um relógio de rAF (`_startRecordClock`/`_stopRecordClock`) faz a agulha correr em tempo real. Esse relógio **só** chama `updatePlayhead`/`updateTimeDisplay` (via `_seekNeedle`) — nunca re-renderiza o canvas —, por isso convive sem conflito com o desenho ao vivo. O posicionamento dos traços é **sequencial** (não usa a posição livre da agulha): `stopDrawing` grava cada traço em `startTime = this._recordCursor` (fim do traço anterior) com `duration` = tempo real de desenho (sem o ×0.5 do modo normal), e avança `_recordCursor`; `startDrawing` "prende" a agulha de volta ao cursor ao começar o próximo traço. `_recordCursor` inicia em `max(agulha, _lastContentEnd())` para não sobrescrever conteúdo existente, e `totalAnimationTime` é estendido automaticamente se o cursor passar do fim. Ao mexer no fluxo de desenho, preserve o ramo `if (this.timelineMode)` nesses três pontos; ao adicionar novos jeitos de sair do modo, chame `_stopRecordClock()` para não deixar o rAF rodando.
- Existe uma função utilitária `escapeHtml()` (em `js/main.js`) que deve ser usada sempre que texto vindo de dados do usuário/importação (ex.: `comment.text`) for inserido via `innerHTML`. Texto de comentário já é uma superfície de risco de XSS confirmada (ver histórico de commits) — qualquer novo trecho que interpole `comment.text`/`item.data.text` em `innerHTML` precisa passar por `escapeHtml()`.
- `confirm()`/`alert()`/`prompt()` nativos **não devem ser usados** — use `showConfirm`/`showAlertModal`/`showPromptModal` de `js/modal.js` (todas retornam Promise; o call site precisa ser `async`).
- `FlowAnimator.prototype.play()` retorna uma Promise que resolve quando a reprodução para (fim natural, `pause()` ou `reset()`) — usado por `exportVideoHD` para aguardar o fim da gravação sem polling. Se adicionar novos jeitos de parar a reprodução, chame `this._resolvePlaybackEnd()` para não deixar a Promise pendurada.
- O undo/redo (`saveUndoState`/`undo`/`redo`) compartilha os arrays `points` de cada ação por referência entre snapshots (não clona) — isso só é seguro porque `points` nunca é mutado in-place em nenhum lugar do código (só reatribuído, ex. em `optimizePerformance`). Se algum dia `points` passar a ser mutado in-place, essa otimização de memória vira um bug de corrupção de histórico — volte a clonar (`a.points.slice()`) nesse caso.

- Em `TimelinePro.setupTimeline()`, `updateTrackItems()` roda **antes** de `renderTrackHeaders()` — os headers dependem dos items atualizados (contagem, badge ⚡ PARALELO). Já houve um bug em que os headers ficavam uma rodada atrasados por causa da ordem inversa.
- O motor de animação usa dois caches que precisam ser invalidados quando `actions` muda: `_bgCanvas` (fundo, recriado via `_setBackgroundFromImageData`) e `_persistedDrawsCanvas` (desenhos concluídos, invalidado via `invalidateRenderCaches()` — já chamado por `rebuildDrawingCanvas()`, que roda em todo caminho de mutação). Se criar um caminho novo que mute `actions` sem chamar `rebuildDrawingCanvas`, chame `invalidateRenderCaches()` manualmente.
- Redimensionamento de canvas deve passar por `_syncCanvasSizes(w, h)` — nunca setar `canvas.width` direto — para manter `drawingCanvas`, `_offscreenCanvas` e `_persistedDrawsCanvas` no mesmo tamanho (bug histórico: offscreen preso em 1080p clipava traços de PDFs retrato durante a animação).
- Visibilidade de track (botão 👁️) é consultada via `TimelinePro.isTypeVisible(type)` / `FlowAnimator._isTypeVisible(type)` — qualquer código novo de render deve respeitá-la.
- Itens da timeline referenciam os objetos reais (`item.data` aponta para a própria action/comment) — deleção/edição usam `indexOf(item.data)`/mutação por referência, nunca parsing de índice do ID (IDs `action_N` existem só para lookup de DOM via `_itemById`).

## Cuidados ao editar

- **Não reintroduza definições duplicadas de método.** Em `class TimelinePro`/`FlowAnimator.prototype`, uma segunda definição do mesmo nome sobrescreve a primeira silenciosamente (sem erro, sem warning) — já houve dois casos assim no histórico (`createTimelineItem` e `eraseAnimatedPathOnCanvas`), removidos por serem código morto. Ao copiar/colar blocos de função como base para uma nova versão, sempre remova a versão antiga.
- Antes de commitar, valide a sintaxe de cada arquivo `.js`:
  ```bash
  node -e "
  const fs = require('fs');
  for (const f of fs.readdirSync('js').filter(f => f.endsWith('.js'))) {
    new Function(fs.readFileSync('js/' + f, 'utf8'));
  }
  console.log('OK');
  "
  ```
  E rode `npx html-validate main.html index.html` (usa a config em `.htmlvalidate.json`).
- Rode a suíte de testes (`npm ci && npx playwright test`, ou `npx playwright install --with-deps chromium` primeiro se os browsers não estiverem instalados) — ver `tests/app.spec.js` e [CONTRIBUTING.md](./CONTRIBUTING.md).
- Teste manualmente no navegador também: abrir `main.html`, importar um PDF/imagem, desenhar, apagar, comentar, dar play/pause, undo/redo, trocar idioma, navegar a timeline só com teclado, e exportar (vídeo ou frames) antes de considerar uma mudança pronta.
