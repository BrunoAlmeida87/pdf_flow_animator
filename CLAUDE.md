# Notas para assistentes de IA / desenvolvedores

Contexto técnico para quem (humano ou IA) for editar este repositório. Para a visão de produto/usuário, veja [README.md](./README.md).

## Estrutura do repositório

Este repositório contém **um único arquivo de aplicação**: `main.html`. Não há build step, bundler, `package.json`, testes ou linter configurados. Tudo — markup, CSS e JavaScript — está inline nesse arquivo, dentro de uma única tag `<script>`.

Ao propor mudanças, prefira edições cirúrgicas dentro de `main.html` em vez de reestruturar o arquivo, a menos que a tarefa seja explicitamente sobre modularização (ver "Melhorias propostas" no README).

## Mapa aproximado do `main.html`

| Seção | Linhas aprox. | Conteúdo |
|---|---|---|
| `<style>` | 8–1126 | CSS de toda a interface (tema escuro, timeline, botões, indicadores). |
| Markup (`<body>`) | 1128–1446 | Header com controles, área do canvas, sidebar de configurações, área da timeline, indicadores/overlays fixos. |
| `escapeHtml` / `insertEmoji` | ~1451–1469 | Utilitários usados na UI (escapar texto de comentário antes de `innerHTML`, inserir emoji no textarea). |
| `class TimelinePro` | ~1470 em diante | Timeline multi-track: renderização de tracks/régua, detecção de sobreposição, drag/resize, zoom, playhead. |
| `function FlowAnimator` + `FlowAnimator.prototype.*` | ~2350 em diante | Núcleo do app: canvas, desenho/apagador, comentários, motor de animação, undo/redo, crop, exportação de vídeo/frames, PDF/imagem, `localStorage`/JSON. |
| `DOMContentLoaded` (final do arquivo) | perto do fim | Instancia `FlowAnimator`, liga botões que não fazem parte do `bindEvents` principal (modo timeline, crop). |

Os números de linha mudam a cada edição — use os nomes de função/classe acima com `grep`/busca para se orientar, não confie nos números como fixos.

## Convenções observadas (não normativas, apenas descritivas do estado atual)

- `FlowAnimator` é uma função construtora clássica com métodos em `FlowAnimator.prototype.*` (pré-ES6). `TimelinePro` já usa `class` (ES6). Não há um padrão único — ao adicionar métodos novos, siga o estilo da estrutura em que está mexendo.
- Toda a UI (labels, tooltips, mensagens) está em português (pt-BR). Nomes de função/variável estão em inglês. Mantenha essa mistura ao editar (não traduza um sem o outro sem que seja essa a tarefa).
- Duas telas de canvas coexistem sempre: `this.canvas`/`this.ctx` (visível, fundo + composição final) e `this.drawingCanvas`/`this.drawingCtx` (somente traços do usuário). O apagador (`destination-out`) atua **apenas** no `drawingCtx`, nunca diretamente no canvas principal — isso é o que permite apagar sem destruir o PDF/imagem de fundo. Ao mexer em lógica de desenho/apagador, preserve essa separação.
- Cada ação (`draw`/`erase`) e cada comentário carrega um **tempo absoluto** (`startTime`/`time`) e uma `duration`, não uma posição sequencial — isso é o que permite ações paralelas na timeline. Não assuma que `actions[i]` é renderizado antes de `actions[i+1]`; sempre considere `startTime`.
- Existe uma função utilitária `escapeHtml()` (perto do topo do `<script>`) que deve ser usada sempre que texto vindo de dados do usuário/importação (ex.: `comment.text`) for inserido via `innerHTML`. Texto de comentário já é uma superfície de risco de XSS confirmada (ver histórico de commits) — qualquer novo trecho que interpole `comment.text`/`item.data.text` em `innerHTML` precisa passar por `escapeHtml()`.

## Cuidados ao editar

- **Não reintroduza definições duplicadas de método.** Em `class TimelinePro`/`FlowAnimator.prototype`, uma segunda definição do mesmo nome sobrescreve a primeira silenciosamente (sem erro, sem warning) — já houve dois casos assim no histórico (`createTimelineItem` e `eraseAnimatedPathOnCanvas`), removidos por serem código morto. Ao copiar/colar blocos de função como base para uma nova versão, sempre remova a versão antiga.
- Antes de commitar, valide a sintaxe do JS embutido (não há CI de build para isso, apenas o workflow de `html-validate`):
  ```bash
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('main.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const s of scripts) new Function(s);
  console.log('OK');
  "
  ```
- Teste manualmente no navegador (não há suíte automatizada): abrir `main.html`, importar um PDF/imagem, desenhar, apagar, comentar, dar play/pause, undo/redo, e exportar (vídeo ou frames) antes de considerar uma mudança pronta.
