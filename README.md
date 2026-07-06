# PDF Flow Animator — Timeline Pro

Ferramenta client-side (roda inteiramente no navegador, sem servidor e sem instalação) para anotar um PDF ou imagem com desenhos animados à mão livre, apagador, e comentários com tempo de aparição — organizados numa timeline profissional multi-track — e exportar o resultado como vídeo HD, sequência de frames PNG ou projeto JSON reeditável.

Todo o app vive em um único arquivo: **[`main.html`](./main.html)**. Basta abrir esse arquivo em um navegador moderno.

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
- **Reprodução** com velocidade ajustável e opção de manter (ou não) os traços após a animação passar por eles.
- **Desfazer / Refazer** (`Ctrl+Z` / `Ctrl+Y`), com histórico de até 50 estados.
- **Seleção de região (crop)** do canvas para exportar apenas uma área específica em vídeo.
- **Exportação**:
  - Vídeo HD em `.webm` (via `MediaRecorder` + `canvas.captureStream`), com fallback automático para exportação de frames PNG em navegadores sem suporte a `MediaRecorder`.
  - Projeto completo em `.json` (e também salvamento rápido via `localStorage` do navegador).
- **Atalhos de teclado**: `Espaço` play/pause · `D`/`E`/`C` trocar de modo · `Ctrl+Z`/`Ctrl+Y` desfazer/refazer · `Esc` cancelar posicionamento de comentário ou seleção de região.

## Como usar

Não há build, dependências para instalar ou servidor para rodar:

1. Baixe/clone o repositório.
2. Abra `main.html` diretamente no navegador (duplo clique ou `Ctrl+O`).
3. Importe um PDF ou imagem pelo botão "📁 Importar PDF/Imagem".

**Requisitos do navegador**: qualquer navegador moderno com suporte a Canvas 2D. Para exportar vídeo é necessário suporte a `MediaRecorder` (Chrome, Edge, Firefox — quando ausente, o app oferece automaticamente a exportação por frames PNG). O carregamento de PDF depende de acesso à internet, pois a biblioteca PDF.js é carregada via CDN (veja [Limitações conhecidas](#limitações-conhecidas)).

## Arquitetura

Todo o HTML, CSS e JavaScript estão em `main.html` (sem bundler/build step). O JavaScript é organizado em duas estruturas principais, ambas definidas dentro do único bloco `<script>`:

- **`FlowAnimator`** — objeto central da aplicação (função construtora + métodos em `prototype`, estilo pré-ES6). Responsável por:
  - Dois canvases sobrepostos: um para o PDF/imagem de fundo (`ctx`) e outro só para os traços do usuário (`drawingCtx`) — assim apagar nunca destrói o fundo.
  - Captura de desenho/apagador via eventos de mouse, incluindo o modo linha reta.
  - Sistema de comentários (posicionamento, arrasto, estilo).
  - Motor de animação (`renderAnimationFrame` → `renderParallelTracks`), que calcula o progresso de cada ação a partir de um tempo absoluto (`startTime`) e não de uma ordem sequencial, permitindo ações paralelas.
  - Undo/redo, carregamento de PDF/imagem, exportação de vídeo/frames/JSON, persistência em `localStorage`.
- **`TimelinePro`** — classe (ES6) responsável pela timeline multi-track: renderização de tracks e réguas, detecção de sobreposição de ações via *sweep-line* O(n log n), organização de itens sobrepostos em camadas visuais, drag/resize de itens (conversão pixel ↔ segundo), zoom e playhead.

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

## Limitações conhecidas

- **Arquivo único de ~5.000 linhas**: não há separação em módulos, o que dificulta lint, testes e revisão de diffs.
- **Sem suíte de testes automatizados.**
- **Dependência externa via CDN sem verificação de integridade**: o PDF.js é carregado de `cdnjs.cloudflare.com` sem hash de Subresource Integrity (SRI) e sem fallback local — sem internet, a importação de PDF não funciona (imagens continuam funcionando normalmente).
- **UI inteiramente em português (pt-BR)**, sem suporte a internacionalização.
- **Uso de `confirm()`/`alert()`/`prompt()`** nativos do navegador para algumas confirmações, o que é uma UX datada e dificulta testes automatizados.
- **Exportação de vídeo apenas em WebM** (sem opção nativa de MP4/H.264).
- **Acessibilidade limitada**: vários controles da timeline só aparecem em `:hover`, sem alternativa por teclado.

## Melhorias propostas

Lista priorizada de melhorias identificadas na revisão do código, para futuras contribuições:

1. Modularizar o arquivo único em HTML/CSS/JS separados (ou ES modules), permitindo lint, testes e diffs menores.
2. Adicionar suíte de testes automatizados (ex.: Playwright cobrindo desenhar, exportar, undo/redo), já que hoje não há nenhum teste.
3. Adicionar Subresource Integrity (SRI) nos `<script>` do PDF.js e/ou vendorizar a biblioteca localmente, reduzindo o risco de supply-chain e a dependência de um CDN externo.
4. Substituir `confirm()`/`alert()`/`prompt()` por componentes de UI próprios (modais), mais acessíveis e testáveis.
5. Adicionar acessibilidade básica: ARIA labels, navegação por teclado nos itens da timeline, alternativas a affordances que hoje só aparecem no hover.
6. Internacionalização (i18n) da interface, hoje fixa em pt-BR, para ampliar o número de contribuidores.
7. Suporte a exportação em MP4/H.264 além de WebM.
8. Revisar o crescimento de memória da pilha de undo/redo em sessões longas com muitos pontos de desenho.
9. Tornar a detecção de fim da exportação de vídeo baseada em evento/Promise em vez de polling via `setInterval`.

## Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para como testar localmente e o processo de contribuição.

## Licença

Distribuído sob a licença MIT — veja [LICENSE](./LICENSE).
