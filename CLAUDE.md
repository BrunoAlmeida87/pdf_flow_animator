# Notas para assistentes de IA / desenvolvedores

Contexto técnico para quem (humano ou IA) for editar este repositório. Para a visão de produto/usuário, veja [README.md](./README.md).

## Estrutura do repositório

O app é modular, mas **sem bundler/build step** — tudo é carregado via `<link>`/`<script src>` clássico (nunca `type="module"`: ES modules são bloqueados por CORS quando `main.html` é aberto via `file://`, que é um modo de uso documentado). Bibliotecas de terceiros ficam **vendorizadas** em `vendor/` (licença ao lado) — nunca via CDN.

| Arquivo | Conteúdo |
|---|---|
| `main.html` | Markup, sprite de ícones SVG (`<symbol id="i-…">`) e as tags de CSS/JS. |
| `css/styles.css` | Design system: tokens em custom properties (escuro padrão; claro via `prefers-color-scheme` ou `[data-theme]`), layout em grid, responsivo. |
| `js/i18n.js` | `I18N` (pt-BR/en), `t(chave, params)`, `getLang()`, `applyI18n()`. Carrega primeiro. |
| `js/util.js` | `Util.*`, `escapeHtml`, `insertEmoji`. |
| `js/modal.js` | `showConfirm`/`showAlertModal`/`showPromptModal`/`showFormModal`/`showCustomModal`, `isModalOpen` — Promise-based, capturam keydown e prendem o Tab. |
| `js/ui.js` | `Toast` (avisos com ação), `Menus`, `DragHint`, `Progress`. |
| `js/zip.js`, `js/gif.js` | `ZipBuilder`, `GifEncoder`. |
| `js/storage.js` | `ProjectStore` (IndexedDB). |
| `js/audio.js` | `class AudioEngine`. |
| `js/geometry.js` | `Geometry` (funções puras de traço/forma/hit-test). |
| `js/timeline-pro.js` | `class TimelinePro`. |
| `js/flow-animator.js` | `function FlowAnimator` + núcleo (estado, cenas, seleção, undo, reprodução, gravação). |
| `js/fa-render.js`, `fa-input.js`, `fa-media.js`, `fa-project.js`, `fa-export.js` | Mais `FlowAnimator.prototype.*` (render, entrada, mídia, projeto/autosave, exportação). |
| `js/inspector.js` | `class Inspector` (painel de propriedades). |
| `js/main.js` | `Theme`, `wireApp()` e o `DOMContentLoaded` que cria `flowAnimator` e `flowAnimator.inspector`. |
| `vendor/pdfjs/` | PDF.js 3.11.174 (`pdf.min.js`, worker, cmaps). |
| `vendor/perfect-freehand/` | Traço com pressão (`window.PerfectFreehand`), carregado no `<head>`. |
| `vendor/mediabunny/` | Muxer MP4/WebM (`window.Mediabunny`), carregado **sob demanda** via `Util.loadScript` na exportação. |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA. `Pwa.init()` (fim de `js/main.js`) só age em http(s): injeta o `<link rel="manifest">` (no HTML estático ele gera erro de CORS no console em `file://`), registra o `sw.js` e consome o `launchQueue` (*file handlers* → `loadFile`). |

**Ordem de carregamento importa** (fim de `main.html`): `i18n` → `util` → `modal` → `ui` → `zip` → `gif` → `storage` → `audio` → `geometry` → `timeline-pro` → `flow-animator` → `fa-*` → `inspector` → `main`. O construtor do `FlowAnimator` chama `bindEvents()` (fa-input) e `new TimelinePro(this)`; ele só roda no `DOMContentLoaded`, quando todos os arquivos já carregaram.

Os vendors CJS foram envolvidos num IIFE que expõe um global (ver o comentário no topo de cada arquivo); para atualizar, repita o wrap com o `dist` oficial da nova versão.

Ao propor mudanças, prefira edições cirúrgicas no arquivo relevante.

## Modelo de dados

- **Projeto → cenas.** `flowAnimator.scenes[]`; a cena atual tem o estado nos campos de trabalho (`actions`, `comments`, `cameraMoves`, `audioClips`, `markers`, `totalAnimationTime`, `_undoStack`/`_redoStack`, `_bgCanvas`, `cropRegion`). As outras guardam em `scene.state`. Troca de cena: `_captureScene()` → `_applyScene(i)`. Código que lê "todas as cenas" deve chamar `_captureScene()` antes.
- **Fundo da cena**: `scene.background` = `{kind:'blank',color}` | `{kind:'pdf',assetId,page}` | `{kind:'image',assetId}`; o canvas renderizado fica em `scene._bgCanvas` (via `_ensureSceneBackground`, assíncrono).
- **Assets** (`flowAnimator.assets`: id → `{kind, mime, name, bytes}`) guardam os bytes originais (PDF, imagem, áudio). JSON exportado embute como data URL; IndexedDB guarda como Blob.
- **IDs estáveis**: todo item tem `id` (`Util.uid`). Itens criados por código antigo/testes sem id recebem um em `_ensureIds()`. Timeline e seleção usam esses ids (DOM: `data-item-id`). **Nunca** derive identidade de índice.
- **Seleção** é um `Set` de ids (sobrevive a undo/redo, que recria os objetos). Mudanças → `_onSelectionChanged()`.
- Cada ação/comentário carrega **tempo absoluto** (`startTime`/`time`) e `duration` — ações paralelas são normais. Nunca assuma que `actions[i]` toca antes de `actions[i+1]`.
- Tipos de ação: `draw` (com `shape` arrow/rect/ellipse, `tool: 'highlighter'`, `style: 'pen'`), `erase`, `laser`, `spotlight`, `redact`. Comentários com `kind: 'badge'` são números de passo. A track de cada item vem de `_trackTypeOf()`.
- Pontos: `{x, y, t?, p?}` — `t` = segundos desde o início do traço (ritmo natural), `p` = pressão.

## Invariantes (não quebre)

- **Dois canvases**: `this.canvas`/`ctx` (composição final) e `this.drawingCanvas`/`drawingCtx` (cache só de tinta da edição). O apagador (`destination-out`) atua **só** em camadas de tinta, nunca no canvas principal — é o que permite apagar sem destruir o fundo.
- **Um único motor de render** (`fa-render.js`): `_composite(ctx, view, t)` serve a edição (`t = null`), a reprodução (`renderAnimationFrame`), miniaturas e exportação (`renderOutputFrame`). Ordem: fundo → tinta → redact → comentários → laser → spotlight; câmera só na saída. Desenhos e apagamentos são aplicados **intercalados em ordem cronológica** (bug histórico: apagamentos depois de todos os desenhos "apagavam o futuro"). Novo tipo de item? Renderize-o dentro de `_composite`, não num caminho paralelo.
- **Caches de render**: `_persistedDrawsCanvas` (prefixo cronológico concluído) é invalidado por `invalidateRenderCaches()`, já chamado por `rebuildDrawingCanvas()`. Toda mutação de conteúdo deve terminar em `_afterContentChange()` (rebuild, redraw, timeline, info, inspector, autosave). Mutou `actions` sem passar por ele? Chame `invalidateRenderCaches()`.
- **Imutabilidade para o undo**: snapshots (`_snapshotState`) copiam cada item 1 nível mas **compartilham** `points` por referência. Por isso `points`, `rect` e `pointer` **nunca** são mutados in-place — sempre reatribuídos (`moveItems`, `scaleItem`, `optimizePerformance`, inspector). Se algum dia precisar mutar in-place, volte a clonar.
- **Undo**: `saveUndoState()` **antes** de mutar (é também o ponto que agenda o autosave). Gestos (arrastar na timeline/canvas) tiram o snapshot no primeiro movimento real. O inspector tira um por sessão de edição (foco no campo).
- **Redimensionar canvas** só via `_syncCanvasSizes(w, h)` — mantém `drawingCanvas`, `_offscreenCanvas` e `_persistedDrawsCanvas` no mesmo tamanho (bug histórico de clipping em PDF retrato).
- **Visibilidade de track** (👁️) via `_isTypeVisible(type)` / `timeline.isTypeVisible(type)` — vale também para a exportação; a track de áudio oculta = mudo.
- **Modo de gravação** (`timelineMode`, botão ● Gravar):
  - *Sequencial* (padrão): o relógio de rAF (`_startRecordClock`) só corre durante um gesto (`isDrawing` ou `_gestureActive`); ocioso, a agulha fica parada onde o próximo traço começa. O início vem de `_nextRecordStart()` = `max(_lastContentEnd(), _recordFloor)` — derivado do conteúdo, para undo/deleção reposicionarem o cursor; `_recordFloor` guarda **só** o offset do playhead ao entrar. A duração é o tempo real do gesto. `_syncRecordNeedle()` (chamado por `rebuildDrawingCanvas`) reancora a agulha ociosa.
  - *Contínuo* (`_recordContinuous`, com microfone): o relógio corre sempre; cada gesto começa em `_gestureRecordStart` (tempo real) e o clipe de narração entra em `_recordSessionStart`.
  - Toda criação de item passa por `_timingForNew()` + `_commitTiming()`. Novos jeitos de sair do modo: chame `exitTimelineMode()` (para o rAF e fecha a sessão do microfone).
- `play()` retorna uma Promise que resolve quando a reprodução para; novos jeitos de parar precisam chamar `_resolvePlaybackEnd()`. Use `seekTo()` para posicionar a agulha (funciona tocando, reinicia o áudio) e `setSpeed()` para a velocidade (preserva o progresso).
- **Entrada**: Pointer Events no `#canvasViewport` com `setPointerCapture` (soltar fora do canvas finaliza o gesto — bug histórico). Um gesto de cada vez em `this._gesture`; `_finishGesture`/`_cancelGesture` limpam. Teclado global em `_onKeyDown` — ignore campos de texto (`Util.isTextField`) e itens da timeline (tratam as próprias teclas).
- **Exportação**: sempre via `renderOutputFrame()` sobre uma `view` própria (`_exportView`) — nunca lendo `this.canvas` (que tem overlays de edição).

## Segurança / UI

- Texto de usuário/importação (`comment.text`, nomes) **nunca** vai cru para `innerHTML`: use `textContent` (preferido) ou `escapeHtml()`. Há teste de regressão de XSS via JSON.
- Todo import passa por `ProjectSchema.parse()` (whitelists, limites, cores validadas) — inclusive IndexedDB e localStorage.
- PDF.js com `isEvalSupported: false` (CVE-2024-4367) — mantenha em `_pdfOptions()`.
- `confirm()`/`alert()`/`prompt()` nativos **não** — use `js/modal.js` (Promise; o call site precisa ser `async`). Exclusões não pedem confirmação: mostram `Toast` com "Desfazer".
- **i18n**: toda string visível passa por `t()` ou `data-i18n*` — adicione a chave em `pt-BR` **e** `en` no `I18N`. `data-i18n-html` só para textos estáticos do dicionário. Cuidado: parâmetros de função chamados `t` (tempo) sombreiam a função de i18n dentro daquela função.
- Cores: use os tokens CSS (`--fg`, `--accent`…); combinações texto/fundo novas precisam de contraste ≥ 4.5:1.

## Cuidados ao editar

- **Não reintroduza definições duplicadas de método.** No `FlowAnimator.prototype` (espalhado por vários arquivos) ou numa `class`, a segunda definição sobrescreve a primeira em silêncio — o histórico já teve dois casos. `node scripts/check-duplicates.js` (no CI) pega o prototype; o ESLint (`no-dupe-class-members`) pega as classes.
- **Chamadas a métodos inexistentes** (ex.: o antigo `this.hideCursorPreviews()`, que só estourava em runtime) são pegas por `node scripts/check-methods.js` (no CI): confere `this.X(` no FlowAnimator e nas classes, e `fa.X(`/`this.animator.X(`/`.timeline.X(`/`.inspector.X(`/`this.audio.X(` contra os membros definidos ou atribuídos. Se ele reclamar de algo legítimo (ex.: método criado dinamicamente), atribua-o explicitamente em vez de enfraquecer o script.
- **Service worker**: arquivo novo carregado pelo app (`<script>`, `<link>`, `Util.loadScript`, ícone) entra na lista `PRECACHE` de `sw.js` — `tests/pwa.spec.js` falha se faltar. A estratégia é network-first (online sempre pega a versão publicada); incremente `VERSION` em `sw.js` a cada release para limpar o cache antigo.
- Antes de commitar: `npm run lint` (ESLint + duplicatas + métodos inexistentes + `html-validate`) e `npx playwright test` (veja [CONTRIBUTING.md](./CONTRIBUTING.md)).
- Novo global compartilhado entre arquivos? Declare-o em `eslint.config.js` (`appGlobals`), senão o `no-undef` falha.
- Teste manualmente no navegador também: importar PDF/imagem, desenhar com cada ferramenta, selecionar/mover, gravar (com e sem microfone), reproduzir, desfazer/refazer, trocar idioma e tema, e exportar vídeo/GIF.
