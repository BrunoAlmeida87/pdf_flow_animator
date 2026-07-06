# Contribuindo

Obrigado por contribuir com o PDF Flow Animator! Este é um projeto pequeno e sem build — o processo de contribuição reflete isso.

## Como testar localmente

Não há dependências para instalar nem passo de build:

1. Faça um fork/clone do repositório.
2. Abra `main.html` diretamente no navegador (Chrome, Edge ou Firefox recomendados).
3. Teste manualmente o fluxo afetado pela sua mudança: importar PDF/imagem, desenhar, apagar, comentar, play/pause, undo/redo, exportar vídeo/frames/JSON — conforme relevante.

Como não há suíte de testes automatizada, valide a sintaxe do JavaScript embutido antes de abrir o PR:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('main.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const s of scripts) new Function(s);
console.log('OK');
"
```

O workflow de CI (`.github/workflows/validate-html.yml`) também roda `html-validate` automaticamente em cada PR, usando a configuração em `.htmlvalidate.json`. Algumas regras estilísticas do preset padrão (`no-inline-style`, `no-implicit-button-type`, `no-trailing-whitespace`, `no-redundant-for`) foram desativadas porque conflitam com o estilo já existente em todo o `main.html` (estilos inline extensivos, botões sem `type` explícito) — corrigir isso em massa é uma reestruturação grande demais para ser feita incidentalmente; ficou registrado como possível melhoria futura. As regras que continuam ativas pegam problemas reais de markup (tags não fechadas, atributos inválidos, ids duplicados, etc.).

## Antes de editar

- Leia [CLAUDE.md](./CLAUDE.md) — tem um mapa de onde cada responsabilidade vive dentro do `main.html` e convenções observadas no código.
- O projeto é **um único arquivo de ~5.000 linhas** (HTML + CSS + JS inline). Prefira mudanças pequenas e cirúrgicas. Reestruturações maiores (ex.: modularizar em arquivos separados) devem ser discutidas em uma issue antes de um PR grande, para alinhar expectativas.
- Ao adicionar/editar métodos em `FlowAnimator.prototype` ou na `class TimelinePro`, confira se já não existe um método com o mesmo nome — nomes duplicados são sobrescritos silenciosamente pelo JavaScript, sem erro (já houve casos assim corrigidos no histórico).
- Texto vindo de dados do usuário ou de arquivos JSON importados (ex.: `comment.text`) deve passar pela função `escapeHtml()` antes de ser inserido via `innerHTML`, para evitar XSS.

## Processo de contribuição

1. Abra uma issue descrevendo o problema/melhoria antes de mudanças grandes (bugs pequenos e ajustes pontuais podem ir direto para um PR).
2. Crie um branch a partir de `main`.
3. Faça a mudança, testando manualmente conforme acima.
4. Abra um Pull Request preenchendo o template — descreva o que mudou, como testou, e inclua screenshot/GIF se for uma mudança visual.

## Estilo de código

- Mensagens de UI, tooltips e comentários voltados ao usuário final: em português (pt-BR), consistente com o restante da aplicação.
- Nomes de função/variável/classe: em inglês.
- Sem dependências externas além do PDF.js já carregado via CDN — evite adicionar novas bibliotecas sem discutir antes, dado que o projeto é intencionalmente zero-build.
