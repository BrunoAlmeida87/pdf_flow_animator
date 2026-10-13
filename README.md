# PDF Flow Animator

Ferramenta client-side (roda inteiramente no navegador, sem servidor e sem instalação) para transformar um PDF ou imagem num **vídeo explicativo desenhado à mão**: você desenha, aponta, destaca e comenta por cima, grava a narração, e exporta como vídeo, GIF ou frames.

Abra **[`main.html`](./main.html)** num navegador moderno para usar — funciona até offline e direto do disco (`file://`).

🔗 **Demo publicada:** https://brunoalmeida87.github.io/pdf_flow_animator/

## Funcionalidades

**Importar**
- PDF (uma **cena por página**, renderizada pelo [PDF.js](https://mozilla.github.io/pdf.js/) vendorizado), imagem (PNG/JPEG/WebP/GIF) ou quadro branco.
- Botão, **arrastar-e-soltar** em qualquer lugar da janela ou **Ctrl+V** para colar uma imagem.
- Importar áudio (música/narração pronta) direto na timeline.

**Desenhar e anotar** (barra de ferramentas à esquerda; atalho entre parênteses)
- Caneta (D) com traço **suave** ou com **pressão** (caneta/stylus, via [perfect-freehand](https://github.com/steveruizok/perfect-freehand)); linha reta livre (`Alt`) ou com snap a 45° (`Shift`).
- Marca-texto (H), apagador (E) — apaga só os seus traços, nunca o fundo —, seta (A), retângulo (R), elipse (O).
- Comentário/texto (C): clique no canvas e digite; várias linhas, balão com seta apontando, animações de entrada (esmaecer, pop, deslizar, máquina de escrever) e de saída.
- Números de passo (N) que se incrementam sozinhos; ponteiro laser (Z) com rastro que some; destaque/spotlight (S) que escurece o resto; ocultar dados sensíveis (X) por pixelização/desfoque/tarja.
- Movimentos de **câmera** (F): zoom/pan animados até um retângulo, com pré-visualização.
- Ferramenta **Selecionar** (V): clique, `Shift`+clique, retângulo de seleção; mover, redimensionar pelo canto, editar cor/espessura/texto/tempos no painel de propriedades; duplicar (`Ctrl+D`), copiar/colar na agulha (`Ctrl+C`/`Ctrl+V`).
- **Pointer Events**: mouse, caneta (pressão e todos os pontos do movimento) e toque (pinça para zoom; depois de usar a caneta, o dedo só move a visão — rejeição da palma).

**Gravar**
- **● Gravar** (modo sequencial): cada traço entra na timeline logo após o anterior, com o tempo real de desenho — pausas para pensar não viram espaço vazio.
- Com o **microfone** ligado: contagem 3-2-1 e gravação em tempo real *com a sua voz*; os traços ficam sincronizados com a narração.
- **Narrar** (voice-over): reproduz a cena e grava a voz por cima.
- Os traços guardam o **tempo de cada ponto**, e a reprodução segue o ritmo real da mão (ou uniforme, se preferir).

**Timeline**
- Tracks de desenhos, apagamentos, ponteiro, comentários, efeitos, câmera e áudio (as opcionais aparecem quando usadas); ocultar 👁 (some também do vídeo) e travar 🔒.
- Itens que acontecem ao mesmo tempo ganham **linhas próprias**; miniatura e cor de cada item; forma de onda nos clipes de áudio.
- Arrastar (vários itens de uma vez), redimensionar (inclusive cortar áudio), snap às bordas de qualquer item/agulha/marcadores com guia visual (`Shift` desliga), seleção por retângulo, scrub na régua, marcadores (`M`), zoom com `Ctrl`+roda.
- Teclado: `Espaço`/`K` play/pause, `J`/`L` ∓1s, `←`/`→` por quadro, `Home`/`End`; com um item focado, `←`/`→` movem ±0,1s e `Delete` exclui.
- Excluir não pede confirmação: o aviso traz **Desfazer**. Desfazer/refazer (`Ctrl+Z`/`Ctrl+Y`) cobre tudo, inclusive "Limpar cena".

**Exportar**
- **Vídeo** MP4 ou WebM renderizado **quadro a quadro** via WebCodecs + [Mediabunny](https://mediabunny.dev) — mais rápido que o tempo real, sem engasgos, pode trocar de aba —, com áudio (narração/música mixadas). Navegadores sem WebCodecs usam `MediaRecorder` em tempo real.
- Resoluções automáticas (mantém proporção, até 1080p/4K), 720p/1080p/4K 16:9, **vertical 9:16** e quadrado; 24/30/60 fps; enquadramento com barras ou preenchendo; uma cena ou **todas em sequência**.
- **GIF** animado, frames PNG num ZIP, frame atual em PNG, **legendas** `.srt`/`.vtt` geradas dos comentários.
- Região de gravação (crop) fixa, como base da câmera.

**Projetos**
- **Salvamento automático** no navegador (IndexedDB — sem o limite de ~5 MB do localStorage), com restauração ao reabrir e lista de projetos (abrir, renomear, excluir).
- "Salvar como arquivo" gera um `.json` autocontido (PDF, imagens e áudio embutidos); abrir arquivo reimporta. Arquivos da v1 continuam abrindo.
- Todo projeto importado é **validado e sanitizado** (números, cores, enums, tamanhos), então um arquivo malformado não quebra o app.

**Interface**
- Tema escuro/claro (segue o sistema), contraste AA verificado, ícones SVG próprios, respeita `prefers-reduced-motion`.
- Português e inglês em toda a UI, inclusive avisos; detecta o idioma do navegador.
- Funciona em tablet (painel de propriedades vira gaveta) e até no telefone.
- Atalhos: `?` mostra a lista completa.

## Como usar

1. Baixe/clone o repositório e abra `main.html` no navegador (duplo clique serve) — ou use a demo publicada.
2. Importe um PDF/imagem (ou comece num quadro branco, ou clique em **Ver exemplo**).
3. Desenhe e anote; use **● Gravar** para montar a sequência rapidamente, ou posicione os itens na timeline.
4. **Exportar ▸ Vídeo**.

**Navegadores**: Chrome, Edge, Firefox e Safari recentes. Exportação rápida exige WebCodecs (Chrome/Edge; Firefox 130+; Safari 26+); nos demais a exportação é em tempo real. H.264/AAC dependem do navegador: o Chromium de código aberto (Linux) só codifica VP9/AV1 + Opus — o MP4 sai com VP9 e o app avisa.

(Node/npm só são necessários para **desenvolver/testar** — veja [Contribuindo](#contribuindo).)

## Arquitetura

Sem bundler nem build step: HTML/CSS/JS em arquivos separados, carregados por `<link>`/`<script src>` clássico (nunca `type="module"`, que é bloqueado por CORS em `file://`). Bibliotecas de terceiros ficam vendorizadas em `vendor/` (com a licença ao lado).

| Arquivo | Conteúdo |
|---|---|
| `main.html` | Markup, sprite de ícones SVG e as tags que carregam o resto. |
| `css/styles.css` | Design system (tokens claro/escuro) e todo o CSS. |
| `js/i18n.js` | Dicionário pt-BR/en, `t(chave, params)` e `applyI18n()`. |
| `js/util.js` | `Util` (tempo, cores, base64, download, `loadScript`…), `escapeHtml`, `insertEmoji`. |
| `js/modal.js` | Modais próprios: confirmar, alerta, prompt, formulário e customizado (focus trap). |
| `js/ui.js` | Avisos (`Toast`, com ação "Desfazer"), menus acessíveis, `DragHint`, `Progress`. |
| `js/zip.js` / `js/gif.js` | `ZipBuilder` (frames) e `GifEncoder` (median-cut + LZW), sem dependências. |
| `js/storage.js` | `ProjectStore` — IndexedDB (projetos + assets como Blob). |
| `js/audio.js` | `AudioEngine` — decodificação, reprodução sincronizada, microfone, mixagem offline. |
| `js/geometry.js` | `Geometry` — prefixo por comprimento/tempo, formas, hit-test, transformações. |
| `js/timeline-pro.js` | `class TimelinePro` — tracks, lanes, régua, marcadores, seleção, arrasto/resize/snap. |
| `js/flow-animator.js` | `FlowAnimator` — estado do projeto e das cenas, seleção, undo/redo, reprodução, gravação. |
| `js/fa-render.js` | Motor de render único (edição, reprodução, miniaturas e exportação) + câmera. |
| `js/fa-input.js` | Pointer Events, ferramentas, zoom/pan, crop, teclado, arrastar-e-soltar/colar. |
| `js/fa-media.js` | PDF/imagem/áudio, fundos das cenas e assets. |
| `js/fa-project.js` | Formato v2, validação (`ProjectSchema`), autosave, projetos, exemplo. |
| `js/fa-export.js` | Vídeo (WebCodecs/MediaRecorder), GIF, frames, PNG, legendas. |
| `js/inspector.js` | `class Inspector` — painel de propriedades contextual. |
| `js/main.js` | Inicialização e ligação da interface. |

A ordem de carregamento está no fim de `main.html` (`i18n` → `util` → … → `inspector` → `main`). Detalhes de comportamento e invariantes estão em [CLAUDE.md](./CLAUDE.md).

### Formato do projeto (v2)

```jsonc
{
  "format": "pdf-flow-animator", "version": "2.0",
  "id": "proj_…", "name": "Meu explicativo",
  "currentScene": 0,
  "settings": { "animationSpeed": 1, "persistPaths": true, "flowColor": "#4a90e2", "lineWidth": 3, "…": "…" },
  "scenes": [{
    "id": "scene_…", "name": "", "width": 2400, "height": 1703,
    "background": { "kind": "pdf", "assetId": "asset_…", "page": 1 },   // ou { kind: "image", assetId } / { kind: "blank", color }
    "totalAnimationTime": 12,
    "actions": [
      { "id": "a_…", "type": "draw", "points": [{ "x": 100, "y": 200, "t": 0, "p": 0.5 }], "color": "#4a90e2", "width": 3,
        "startTime": 1.5, "duration": 2, "style": "pen", "easing": "linear" },
      { "id": "a_…", "type": "draw", "shape": "arrow", "points": [{ "x": 0, "y": 0 }, { "x": 200, "y": 0 }], "…": "…" },
      { "id": "a_…", "type": "erase", "points": ["…"], "size": 20, "startTime": 3, "duration": 1 },
      { "id": "a_…", "type": "laser", "points": ["…com t…"], "color": "#ff3b30", "startTime": 4, "duration": 1.8 },
      { "id": "a_…", "type": "spotlight", "rect": { "x": 0, "y": 0, "w": 400, "h": 300 }, "dim": 0.6, "startTime": 6, "duration": 3 },
      { "id": "a_…", "type": "redact", "rect": { "…": "…" }, "mode": "pixelate", "startTime": 0, "duration": 12 }
    ],
    "comments": [{ "id": "c_…", "x": 400, "y": 300, "text": "Texto", "time": 3, "duration": 3, "animIn": "pop", "animOut": "fade",
                   "pointer": { "x": 520, "y": 410 }, "kind": "badge?", "textColor": "#222222", "bgColor": "#ffffff", "…": "…" }],
    "cameraMoves": [{ "id": "cam_…", "startTime": 5, "duration": 1.5, "rect": { "…": "…" }, "easing": "easeInOut" }],
    "audioClips": [{ "id": "au_…", "assetId": "asset_…", "startTime": 0, "duration": 8.2, "offset": 0, "volume": 1 }],
    "markers": [{ "id": "mk_…", "time": 4, "label": "Capítulo 1" }],
    "cropRegion": null
  }],
  "assets": { "asset_…": { "kind": "pdf", "mime": "application/pdf", "name": "doc.pdf", "data": "data:application/pdf;base64,…" } }
}
```

Projetos v1 (`{ actions, comments, settings, background }`) são migrados automaticamente para uma cena.

## Testes

Suíte [Playwright](https://playwright.dev/) com ~70 testes em `tests/`: desenho, ferramentas, caneta/toque, seleção, timeline, cenas, câmera, áudio/narração (microfone falso do Chromium), exportação (vídeo, GIF, frames, legendas), autosave/restauração, validação de import, i18n, tema, layout e regressões de bugs/segurança (XSS via JSON, CVE-2024-4367). Veja [Contribuindo](#contribuindo).

## Limitações conhecidas

- **PDF.js 3.11.174** (vendorizado em `vendor/pdfjs/`) com `isEvalSupported: false` para fechar a [CVE-2024-4367](https://security-tracker.debian.org/tracker/CVE-2024-4367). Migrar para o PDF.js 4+ exige ES modules, incompatível com `file://`. Em `file://` os cMaps (fontes CJK) vêm da CDN, porque o Chrome bloqueia `fetch` local; servido por HTTP(S) usa a cópia local.
- **Codecs**: H.264/AAC não existem em todos os navegadores (ver acima). O app escolhe o primeiro codec disponível e avisa.
- **Projetos ficam no navegador** (IndexedDB) — limpar os dados do site apaga-os. Use "Salvar como arquivo" para backup ou para levar a outro computador.
- **Microfone** exige permissão do navegador; em `file://` alguns navegadores pedem a permissão a cada sessão.

## Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licença

MIT — veja [LICENSE](./LICENSE). Bibliotecas vendorizadas: PDF.js (Apache-2.0), perfect-freehand (MIT), Mediabunny (MPL-2.0); licenças em `vendor/*/LICENSE`.
