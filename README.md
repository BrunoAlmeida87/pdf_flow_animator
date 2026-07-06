# PDF Flow Animator — Timeline Pro

Ferramenta client-side (roda inteiramente no navegador, sem servidor e sem instalação) para anotar um PDF ou imagem com desenhos animados à mão livre, apagador, e comentários com tempo de aparição — organizados numa timeline profissional multi-track — e exportar o resultado como vídeo HD, sequência de frames PNG ou projeto JSON reeditável.

Abra **[`main.html`](./main.html)** em um navegador moderno para usar.

🔗 **Demo publicada:** https://brunoalmeida87.github.io/pdf_flow_animator/

## Funcionalidades

- **Importação** de PDF (renderizado página a página via [PDF.js](https://mozilla.github.io/pdf.js/)) ou imagem (`.jpg`, `.jpeg`, `.png`).
- **Modos de edição**: Desenhar, Apagar e Comentar.
  - Linha reta livre (`Alt`) ou com snap a 0°/45°/90°/135° (`Shift`).
  - Apagador atua apenas sobre os traços do usuário, sem afetar o PDF/imagem de fundo.
  - Comentários com texto, cor de fonte/fundo/borda, fonte, tamanho, opacidade e emojis — arrastáveis em qualquer modo.
- **Timeline Pro**: tracks separadas por tipo de ação (desenho / apagar / comentário), com:
  - Detecção automática de ações simultâneas (sobrepostas no tempo) e organização visual em camadas.
  - Arrastar e redimensionar itens para reposicionar/ajustar duração diretamente na timeline.
  - Zoom, régua de tempo e playhead sincronizado com a reprodução.
  - Itens da timeline são navegáveis por teclado (`Tab` para focar, `Delete`/`Backspace` para remover).
- **Reprodução** com velocidade ajustável e opção de manter (ou não) os traços após a animação passar por eles.
- **Desfazer / Refazer** (`Ctrl+Z` / `Ctrl+Y`), com histórico de até 30 estados.
- **Seleção de região (crop)** do canvas para exportar apenas uma área específica em vídeo.
- **Exportação**:
  - Vídeo HD via `MediaRecorder` + `canvas.captureStream` — tenta MP4/H.264 primeiro e cai para WebM (VP9/VP8) quando o navegador não suporta MP4 nesse contexto, com fallback automático para exportação de frames PNG quando `MediaRecorder` não está disponível.
  - Projeto completo em `.json` (e também salvamento rápido via `localStorage` do navegador).
- **Interface em português ou inglês**, com seletor de idioma no header (persistido em `localStorage`).
- **Atalhos de teclado**: `Espaço` play/pause · `D`/`E`/`C` trocar de modo · `Ctrl+Z`/`Ctrl+Y` desfazer/refazer · `Esc` cancelar posicionamento de comentário ou seleção de região.

## Como usar

Não há build nem servidor para rodar o app em si:

1. Baixe/clone o repositório.
2. Abra `main.html` diretamente no navegador (duplo clique ou `Ctrl+O`).
3. Importe um PDF ou imagem pelo botão "📁 Importar PDF/Imagem".

**Requisitos do navegador**: qualquer navegador moderno com suporte a Canvas 2D. Para exportar vídeo é necessário suporte a `MediaRecorder` (Chrome, Edge, Firefox — quando ausente, o app oferece automaticamente a exportação por frames PNG; suporte a MP4 dentro do `MediaRecorder` varia por navegador, sem garantia universal). O carregamento de PDF depende de acesso à internet, pois a biblioteca PDF.js é carregada via CDN (veja [Limitações conhecidas](#limitações-conhecidas)).

(Instalar dependências via `npm` só é necessário para **desenvolver/testar** o projeto, não para usá-lo — veja [Contribuindo](#contribuindo).)

## Arquitetura

O projeto continua sem bundler/build step, mas agora é modular — HTML, CSS e JavaScript vivem em arquivos separados carregados via `<link>`/`<script src>` clássico (sem `type="module"`, para preservar o uso via `file://` sem servidor, já que ES modules são bloqueados por CORS nesse esquema):

| Arquivo | Conteúdo |
|---|---|
| `main.html` | Markup (estrutura da UI) e as tags `<link>`/`<script src>` que carregam o resto. |
| `css/styles.css` | Todo o CSS da interface. |
| `js/i18n.js` | Dicionário pt-BR/inglês e `applyI18n()` — precisa carregar primeiro (aplica a tradução assim que o DOM carrega). |
| `js/modal.js` | Modais próprios (`showConfirm`/`showAlertModal`/`showPromptModal`), substituindo `confirm()`/`alert()`/`prompt()` nativos. |
| `js/timeline-pro.js` | `class TimelinePro` — timeline multi-track: renderização de tracks/régua, detecção de sobreposição via *sweep-line* O(n log n), organização de itens sobrepostos em camadas, drag/resize (pixel ↔ segundo), zoom, playhead. |
| `js/flow-animator.js` | `function FlowAnimator` + `FlowAnimator.prototype.*` — núcleo do app: canvas duplo (fundo/PDF + desenho do usuário), captura de desenho/apagador, comentários, motor de animação por tempo absoluto, undo/redo, crop, exportação de vídeo/frames/JSON, PDF/imagem, `localStorage`. |
| `js/main.js` | `escapeHtml`/`insertEmoji`, configuração do PDF.js, e a inicialização (`DOMContentLoaded`) que instancia o `FlowAnimator`. |

Ordem de carregamento importa: `i18n.js` → `modal.js` → `timeline-pro.js` → `flow-animator.js` → `main.js` (o construtor de `FlowAnimator` instancia `new TimelinePro(this)`, então `TimelinePro` precisa existir primeiro).

Pontos-chave de comportamento (ver também [CLAUDE.md](./CLAUDE.md)):
- Dois canvases sobrepostos: um para o PDF/imagem de fundo (`ctx`) e outro só para os traços do usuário (`drawingCtx`) — assim apagar nunca destrói o fundo.
- O motor de animação (`renderAnimationFrame` → `renderParallelTracks`) calcula o progresso de cada ação a partir de um tempo absoluto (`startTime`), não de uma ordem sequencial, permitindo ações paralelas.

### Formato dos dados (JSON exportado / `localStorage`)

```jsonc
{
  "actions": [
    {
      "type": "draw",          // ou "erase"
      "points": [{ "x": 100, "y": 200 }, /* ... */],
      "color": "#4a90e2",      // apenas para "draw"
      "width": 3,              // espessura, apenas para "draw"
      "size": 20,              // tamanho do apagador, apenas para "erase"
      "startTime": 1.5,        // tempo absoluto (segundos) em que a ação começa a ser reproduzida
      "duration": 2.0
    }
  ],
  "comments": [
    {
      "x": 400, "y": 300,
      "text": "Exemplo de comentário",
      "time": 3.0, "duration": 3,
      "textColor": "#333333", "bgColor": "#ffffff", "borderColor": "#f39c12",
      "fontFamily": "Arial", "fontSize": 16, "opacity": 0.9
    }
  ],
  "settings": { "animationSpeed": 1, "totalAnimationTime": 10, "persistPaths": true, "canvasWidth": 1920, "canvasHeight": 1080 },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "version": "1.1"
}
```

## Testes

Há uma suíte automatizada com [Playwright](https://playwright.dev/) cobrindo desenhar, apagar, comentar, undo/redo e uma regressão do fix de XSS via importação de JSON. Ver [Contribuindo](#contribuindo) para como rodar.

## Limitações conhecidas

- **Dependência externa via CDN sem verificação de integridade**: o PDF.js é carregado de `cdnjs.cloudflare.com` sem hash de Subresource Integrity (SRI) e sem fallback local — sem internet, a importação de PDF não funciona (imagens continuam funcionando normalmente). **Não implementado nesta rodada**: o ambiente de desenvolvimento usado bloqueia rede para esse domínio, então não foi possível baixar o arquivo real para gerar um hash SRI verificado nem vendorizá-lo localmente — inventar um hash não verificado quebraria o carregamento de PDF para todo mundo caso não bata exatamente. Para completar isso: baixe `pdf.min.js`/`pdf.worker.min.js` da versão usada (3.11.174) e gere o hash com `openssl dgst -sha384 -binary pdf.min.js | openssl base64 -A`, adicionando `integrity="sha384-..."` e `crossorigin="anonymous"` na tag `<script>` em `main.html` — ou vendorize os arquivos em `vendor/pdfjs/` e aponte o `src` para lá.
- **i18n cobre a UI estática** (botões, labels, headers de seção), mas não 100% das strings dinâmicas interpoladas (tooltips com valores, mensagens de status) — essas continuam só em pt-BR.
- **Suporte a MP4 no `MediaRecorder` varia por navegador** — quando indisponível, a exportação cai automaticamente para WebM; não há transcodificação embutida (tipo ffmpeg.wasm) neste escopo.
- **`node_modules`/Playwright são só para desenvolvimento** — usar o app não requer Node/npm em nenhum momento.

## Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para como rodar os testes localmente e o processo de contribuição.

## Licença

Distribuído sob a licença MIT — veja [LICENSE](./LICENSE).
