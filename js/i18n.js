// i18n: dicionário pt-BR / inglês para TODA a UI — estática (data-i18n*) e mensagens
// dinâmicas via t('chave', { param }). Carrega primeiro; não depende de mais nada.
//   data-i18n="k"             → textContent
//   data-i18n-title="k"       → title + aria-label
//   data-i18n-placeholder="k" → placeholder
//   data-i18n-html="k"        → innerHTML (só textos ESTÁTICOS do dicionário, com <kbd>)

const I18N = {
    'pt-BR': {
        // Topbar / menus
        projectName: 'Nome do projeto', untitledProject: 'Projeto sem título',
        menuFile: 'Arquivo', menuEdit: 'Editar', newProject: 'Novo projeto', projects: 'Meus projetos…',
        btnImport: 'Importar PDF ou imagem…', importAudio: 'Importar áudio…', btnSave: 'Salvar',
        btnExportJson: 'Salvar como arquivo (.json)…', btnImportJson: 'Abrir arquivo de projeto…', btnLoad: 'Restaurar salvamento rápido',
        undo: 'Desfazer', redo: 'Refazer', undoTitle: 'Desfazer (Ctrl+Z)', redoTitle: 'Refazer (Ctrl+Y)',
        selectAll: 'Selecionar tudo', duplicate: 'Duplicar seleção', deleteSelection: 'Excluir seleção',
        addMarker: 'Adicionar marcador', fitDuration: 'Ajustar duração ao conteúdo', btnClearAll: 'Limpar cena',
        micToggle: 'Gravar narração junto (microfone)', record: 'Gravar', stopRecording: 'Parar',
        recordTitle: 'Gravar: cada traço entra na timeline em sequência (com o microfone ligado, em tempo real com narração)',
        export: 'Exportar', btnExportVideo: 'Vídeo (MP4/WebM)…', exportGif: 'GIF animado…', btnExportFrames: 'Frames PNG (ZIP)',
        exportPng: 'Frame atual (PNG)', exportSrt: 'Legendas (.srt)', exportVtt: 'Legendas (.vtt)', cropRegion: 'Definir região de gravação',
        themeToggle: 'Alternar tema claro/escuro', shortcutsTitle: 'Atalhos de teclado', inspectorToggle: 'Propriedades',

        // Ferramentas
        toolsTitle: 'Ferramentas', toolSelect: 'Selecionar e mover (V)', toolPan: 'Mover a visão (G)', modeDraw: 'Caneta (D)',
        toolHighlighter: 'Marca-texto (H)', modeErase: 'Apagador (E)', toolArrow: 'Seta (A)', toolRect: 'Retângulo (R)',
        toolEllipse: 'Elipse (O)', modeComment: 'Comentário / texto (C)', toolBadge: 'Número de passo (N)', toolLaser: 'Ponteiro laser (Z)',
        toolSpotlight: 'Destaque / spotlight (S)', toolRedact: 'Ocultar dados sensíveis (X)', toolCamera: 'Movimento de câmera (F)', quickColor: 'Cor atual',
        toolSelectName: 'Selecionar', toolPanName: 'Mover visão', toolHighlighterName: 'Marca-texto', toolArrowName: 'Seta',
        toolBadgeName: 'Número de passo', toolLaserName: 'Ponteiro laser', toolSpotlightName: 'Destaque', toolRedactName: 'Ocultar dados', toolCameraName: 'Câmera',
        toolName_arrow: 'Seta', toolName_rect: 'Retângulo', toolName_ellipse: 'Elipse',
        shape_arrow: 'Seta', shape_rect: 'Retângulo', shape_ellipse: 'Elipse', shape_line: 'Linha',

        // Stage
        scenePrev: 'Cena anterior', sceneNext: 'Próxima cena', scenesTitle: 'Cenas', noFileLoaded: 'Quadro branco',
        cameraPreview: 'Câmera', cameraPreviewTitle: 'Ver a reprodução pelo enquadramento da câmera',
        zoomIn: 'Aumentar zoom', zoomOut: 'Diminuir zoom', fitScreen: 'Ajustar à tela', centerCanvas: 'Centralizar',
        emptyTitle: 'Comece seu vídeo explicativo',
        emptyText: 'Importe um PDF ou imagem e anime desenhos, setas e comentários por cima — ou comece num quadro branco.',
        emptyImport: 'Importar PDF ou imagem', emptyBlank: 'Quadro branco', emptyExample: 'Ver exemplo',
        emptyHint: 'ou arraste e solte um arquivo aqui · Ctrl+V cola uma imagem', dropHere: 'Solte para importar',
        recentProjects: 'Recentes',

        // Inspector
        sectionDraw: 'Caneta', labelDrawColor: 'Cor', labelLineWidth: 'Espessura', penStyle: 'Estilo do traço',
        penSmooth: 'Suave', penPressure: 'Caneta (pressão)', shapeFill: 'Preencher (translúcido)',
        hintStraight: '<kbd>Alt</kbd> linha reta livre · <kbd>Shift</kbd> snap a 45°',
        hintShape: 'Arraste no canvas. <kbd>Shift</kbd> mantém proporção / ângulos de 45°.',
        sectionErase: 'Apagador', labelEraseSize: 'Tamanho', hintErase: 'Apaga só os seus traços — o PDF/imagem de fundo nunca é afetado.',
        sectionComments: 'Comentário', labelCommentText: 'Texto',
        commentPlaceholder: 'Digite e clique no canvas — ou clique direto no canvas para escrever ali.',
        labelTextColor: 'Texto', labelBgColor: 'Fundo', labelBorderColor: 'Borda', labelFont: 'Fonte', labelFontSize: 'Tamanho',
        labelOpacity: 'Opacidade do fundo', animIn: 'Entrada', animOut: 'Saída', balloon: 'Balão com seta apontando',
        labelCommentTime: 'Aparece em (s)', labelCommentDuration: 'Duração (s)', useCurrentTime: 'Usar tempo da agulha',
        btnPositionComment: 'Posicionar no canvas', badgeNext: 'Próximo número',
        hintBadge: 'Clique no canvas para marcar a ordem dos passos (1, 2, 3…). Cada número aparece com um “pop” na agulha.',
        hintLaser: 'Aponte enquanto arrasta: no vídeo aparece um ponto luminoso com rastro que some — não deixa marca.',
        spotDim: 'Escurecer o resto', shapeLabel: 'Formato', shapeRect: 'Retângulo', shapeEllipse: 'Elipse',
        hintSpotlight: 'Arraste sobre a área a destacar. Durante o item, todo o resto escurece.',
        redactMode: 'Modo', redactPixelate: 'Pixelizar', redactBlur: 'Desfocar', redactSolid: 'Tarja sólida',
        hintRedact: 'Arraste sobre dados sensíveis (nomes, valores, e-mails). A área fica ilegível no vídeo inteiro por padrão.',
        hintCamera: 'Posicione a agulha e arraste um retângulo: a câmera faz zoom/pan até ele a partir desse momento. Use “Câmera” no topo do canvas para pré-visualizar.',
        hintSelect: 'Clique para selecionar, <kbd>Shift</kbd>+clique adiciona, arraste no vazio para selecionar vários. Arraste para mover; o canto redimensiona. <kbd>Del</kbd> exclui · <kbd>Ctrl+D</kbd> duplica.',
        hintPan: 'Arraste para mover. <kbd>Ctrl</kbd>+roda do mouse (ou pinça) dá zoom no ponto do cursor.',
        sectionAnimation: 'Cena e animação', sceneName: 'Nome da cena', labelTotalDuration: 'Duração (s)', fitDurationShort: 'Ajustar ao conteúdo',
        labelSpeed: 'Velocidade de reprodução', sceneBg: 'Fundo do quadro branco', labelPersistPaths: 'Manter desenhos após animação',
        statDraws: 'Desenhos', statErases: 'Apagadas', statComments: 'Comentários', statEnd: 'Fim do conteúdo',
        animNone: 'Nenhuma', animFade: 'Esmaecer', animPop: 'Pop', animSlide: 'Deslizar', animTypewriter: 'Máquina de escrever',
        colorX: 'Cor {c}', customColor: 'Outra cor…',
        starts: 'Início', duration: 'Duração', easing: 'Aceleração', easeLinear: 'Linear', easeInOut: 'Suave (entrada e saída)',
        easeIn: 'Acelerar', easeOut: 'Desacelerar', pace: 'Ritmo', paceNatural: 'Natural (como desenhado)', paceUniform: 'Uniforme',
        borderWidth: 'Espessura da borda', badgeNumber: 'Número', markerLabel: 'Rótulo', name: 'Nome', volume: 'Volume',
        trimStart: 'Cortar início', cameraUseCrop: 'Usar a região de gravação como enquadramento',
        cameraNeedCrop: 'Defina uma região de gravação primeiro (Exportar ▸ Definir região).',
        nSelected: '{n} itens selecionados', toPlayhead: 'Para a agulha', goToItem: 'Ir até', delete: 'Excluir', strokeName: 'Traço',
        marker: 'Marcador',

        // Timeline
        resizeTimeline: 'Arraste para redimensionar a timeline', toStart: 'Voltar ao início (Home)', playPause: 'Reproduzir / pausar',
        narrate: 'Narrar', narrateTitle: 'Narrar: reproduz a cena e grava sua voz por cima', addMarkerTitle: 'Adicionar marcador na agulha (M)',
        fitTimeline: 'Ajustar à largura',
        track_draw: 'Desenhos', track_erase: 'Apagar', track_laser: 'Ponteiro', track_comment: 'Comentários', track_effect: 'Efeitos',
        track_camera: 'Câmera', track_audio: 'Áudio',
        itemsOne: '{n} item', itemsMany: '{n} itens', simultaneous: '{n} simultâneos', layers: '{n} camadas', parallelBadge: '⚡ PARALELO',
        toggleVisibility: 'Visibilidade', muteTrack: 'Silenciar / ativar áudio', lockTrack: 'Travar',
        strokeN: 'Traço {n}', eraseN: 'Apagar {n}', laserN: 'Laser {n}', spotlightN: 'Destaque {n}', redactN: 'Ocultar {n}',
        highlighterN: 'Marca-texto {n}', cameraN: 'Câmera {n}', audio: 'Áudio', deleteItem: 'Excluir item',
        trackShown: 'Track "{name}" visível', trackHidden: 'Track "{name}" oculta', trackLocked: 'Track "{name}" travada', trackUnlocked: 'Track "{name}" destravada',
        trackLockedDelete: '🔒 Track travada — destrave para excluir.', trackLockedMove: '🔒 Track travada — destrave para mover.',
        durationExtended: 'Duração estendida para {s}s', markerN: 'Marcador {n}', markerAdded: 'Marcador em {t}s',
        markerRename: 'Nome do marcador',

        // Avisos gerais
        addActionsFirst: 'Adicione algumas ações primeiro!', nothingToUndo: 'Nada para desfazer.', nothingToRedo: 'Nada para refazer.',
        undone: '↩ Desfeito', redone: '↪ Refeito', itemDeleted: 'Item excluído', itemsDeleted: '{n} itens excluídos',
        nothingSelected: 'Nada selecionado', duplicated: '{n} item(ns) duplicado(s)', copied: '{n} item(ns) copiado(s) — Ctrl+V cola na agulha',
        confirmClear: 'Limpar todos os itens desta cena?', cleared: 'Cena limpa', confirm: 'Confirmar', cancel: 'Cancelar', close: 'Fechar',
        remove: 'Remover', open: 'Abrir', rename: 'Renomear', moveUp: 'Mover para cima', moveDown: 'Mover para baixo',
        typeCommentFirst: 'Digite o texto do comentário primeiro.', positionCommentHelp: '📍 Clique onde deseja posicionar o comentário · Esc cancela',
        commentPlaced: '💬 Comentário em {t}s', inlinePlaceholder: 'Digite… (Enter confirma, Shift+Enter quebra linha)',
        timeSetTo: '⏱️ Tempo da agulha: {t}s', durationFitted: 'Duração ajustada para {s}s',
        snap45: '📐 Snap 45°', freeLine: '📏 Linha livre', keySpace: 'Espaço', keyWheel: 'roda',
        cropHelp: '✂️ Arraste para definir a região de gravação · Esc cancela', cropSet: '✂️ Região {w}×{h}px — o vídeo enquadra só ela',
        cropRemoved: 'Região de gravação removida — exporta a cena inteira', cropActive: 'Região de gravação:',
        redactAdded: 'Área ocultada no vídeo inteiro (ajuste na timeline ▸ Efeitos)',
        cameraAdded: '🎥 Movimento de câmera em {t}s — ative “Câmera” para pré-visualizar',
        cameraPreviewEmpty: 'Sem movimentos de câmera: use a ferramenta Câmera (F) ou defina uma região de gravação.',
        recordStarted: '● Gravando em sequência — desenhe; cada traço entra logo após o anterior.', recSequential: 'SEQ',
        micOn: '🎙 Narração ligada: “Gravar” captura sua voz em tempo real', micOff: 'Narração desligada',
        micError: 'Não foi possível usar o microfone', micUnsupported: 'Este navegador não permite gravar áudio',
        narration: 'Narração', narrationStarted: '🎙 Narrando — fale enquanto a cena toca (pausar encerra)',
        narrationSaved: '🎙 Narração de {s}s adicionada', audioImported: '🎵 Áudio de {s}s adicionado na agulha',
        sceneN: 'Cena {n}', pageN: 'Página {n}', pageOf: 'Página {n}/{total}', copySuffix: '(cópia)',
        cantDeleteLastScene: 'O projeto precisa de pelo menos uma cena.', sceneDeleted: 'Cena excluída',
        sceneSummary: '{s}s · {n} itens', addBlankScene: '+ Cena em branco', addPdfPage: '+ Página do PDF', whichPage: 'Qual página do PDF?',
        duplicateScene: 'Duplicar cena', renameScene: 'Nome da cena', pageNotFound: 'Página {n} não encontrada.',
        loadingPdf: 'Carregando PDF…', pdfLoaded: '📄 PDF carregado', pdfScenesCreated: '📄 PDF com {n} páginas: uma cena por página (veja Cenas)',
        pdfTruncated: 'PDF grande: só as primeiras {n} páginas viraram cenas', imageLoaded: '🖼️ Imagem carregada',
        imageBackground: 'Imagem', pastedImage: 'imagem colada', unsupportedFile: 'Formato não suportado. Use PDF, imagem, áudio ou projeto .json.',
        justNow: 'agora há pouco', minutesAgo: 'há {n} min', hoursAgo: 'há {n} h',

        // Projeto / salvamento
        saveDirty: 'Alterações não salvas', saveSaving: 'Salvando…', saveSaved: 'Salvo neste navegador', saveError: 'Falha ao salvar',
        projectSaved: '💾 Projeto salvo neste navegador', quickSaved: 'Salvamento rápido feito',
        quickSavedNoBg: '⚠️ Salvo sem PDF/imagem/áudio (cota do navegador excedida) — use “Salvar como arquivo” para o projeto completo.',
        nothingSaved: 'Nenhum salvamento rápido encontrado', loadedOk: 'Projeto carregado', importedOk: 'Projeto importado',
        fileSaved: 'Arquivo do projeto salvo', invalidProject: 'Arquivo de projeto inválido', projectNotFound: 'Projeto não encontrado',
        projectRestored: '↺ “{name}” restaurado', currentProject: 'Aberto', restoreOffer: 'Há um projeto salvo da última sessão.', noProjects: 'Nenhum projeto salvo ainda.',
        renameProject: 'Nome do projeto', confirmDeleteProject: 'Excluir o projeto “{name}” deste navegador?',
        sandboxNotice: 'Armazenamento local indisponível — use “Salvar como arquivo”.',

        // Exportação
        exportInProgress: 'Já existe uma exportação em andamento.', exportScope: 'Cenas', exportAllScenes: 'Todas as cenas ({n}) em sequência',
        exportCurrentScene: 'Só a cena atual', exportFit: 'Enquadramento', fitContain: 'Ajustar (com barras)', fitCover: 'Preencher (corta as bordas)',
        exportGifTitle: 'Exportar GIF', exportGifDesc: 'Ideal para clipes curtos (chat, documentação). Para vídeos longos prefira MP4.',
        gifWidth: 'Largura', fps: 'Quadros por segundo', exportVideoTitle: 'Exportar vídeo',
        exportVideoDescFast: 'Renderização quadro a quadro (mais rápida que o tempo real e sem engasgos). Pode trocar de aba.',
        exportVideoDescRealtime: 'Este navegador grava em tempo real: mantenha a aba aberta e visível até terminar.',
        exportFormat: 'Formato', exportResolution: 'Resolução', exportQuality: 'Qualidade', qualityHigh: 'Alta', qualityMedium: 'Média', qualityLow: 'Baixa (arquivo menor)',
        exportIncludeAudio: 'Incluir áudio (narração/música)', presetAuto1080: 'Automática — até 1080p (mantém proporção)',
        presetAuto4k: 'Automática — até 4K (mantém proporção)', presetVertical: '1080 × 1920 (vertical 9:16 — Reels/Shorts)', presetSquare: '1080 × 1080 (quadrado)',
        exportingVideo: 'Exportando vídeo…', exportingRealtime: 'Gravando vídeo em tempo real…', exportingFrames: 'Exportando frames…', exportingGif: 'Exportando GIF…',
        exportFrameOf: 'Quadro {n} de {total}', etaSeconds: '~{s}s restantes', finalizing: 'Finalizando…', exportCancelled: 'Exportação cancelada',
        videoExported: '🎬 Vídeo exportado ({s}s)', mp4CodecNote: 'Vídeo exportado em MP4 com codec {codec} (este navegador não codifica H.264). Toca em navegadores e VLC; para editores antigos, prefira WebM ou outro navegador.',
        noAudioCodec: 'Sem codificador de áudio disponível — vídeo exportado sem som.', noVideoSupport: 'Este navegador não exporta vídeo; exportando frames PNG.',
        realtimeWarning: '⏺ Gravação em tempo real: não troque de aba até terminar.', framesExported: '📦 {n} frames exportados num ZIP',
        gifExported: '🖼️ GIF exportado', gifReduced: 'GIF limitado a {n} quadros (fps reduzido)', pngExported: '🖼️ Frame exportado',
        noCommentsForSubs: 'Sem comentários com texto para gerar legendas.', subsExported: 'Legendas exportadas',

        // Atalhos
        scGroupTools: 'Ferramentas', scGroupPlayback: 'Reprodução', scGroupEdit: 'Edição', scGroupView: 'Visualização e arquivo',
        scJumpSecond: 'Voltar / avançar 1s', scFrameStep: 'Quadro anterior / próximo (Shift = 1s)', scStartEnd: 'Início / fim',
        scCopyPaste: 'Copiar / colar na agulha', scNudge: 'Mover a seleção (Shift = 10px)', scStraight: 'Linha reta livre / com snap', scPan: 'Mover a visão',

        // Exemplo
        exProjectName: 'Exemplo — fluxo em 3 passos', exTitle: 'Como funciona o nosso processo', exStep1: 'Ideia', exStep2: 'Protótipo', exStep3: 'Lançamento',
        exNote: 'Valide cedo com usuários reais 💡', exampleLoaded: '✨ Exemplo carregado — aperte Espaço para assistir',

        // Erros
        errBackground: 'Erro ao carregar o fundo da cena', errRender: 'Erro na renderização', errLoadPdf: 'Erro ao carregar o PDF',
        errLoadImage: 'Erro ao carregar a imagem', errAudio: 'Erro ao processar o áudio', errSave: 'Erro ao salvar', errSaveIdb: 'Falha ao salvar no navegador — tentando salvamento rápido.',
        errLoad: 'Erro ao carregar o projeto', errExport: 'Erro ao exportar', errImport: 'Erro ao importar o projeto', errReadFile: 'Erro ao ler o arquivo',
        errExportVideo: 'Erro ao exportar o vídeo', errExportFrames: 'Erro ao exportar frames', errExportGif: 'Erro ao exportar GIF',
        initError: 'Erro ao inicializar a aplicação. Verifique o console para mais detalhes.'
    },

    'en': {
        projectName: 'Project name', untitledProject: 'Untitled project',
        menuFile: 'File', menuEdit: 'Edit', newProject: 'New project', projects: 'My projects…',
        btnImport: 'Import PDF or image…', importAudio: 'Import audio…', btnSave: 'Save',
        btnExportJson: 'Save as file (.json)…', btnImportJson: 'Open project file…', btnLoad: 'Restore quick save',
        undo: 'Undo', redo: 'Redo', undoTitle: 'Undo (Ctrl+Z)', redoTitle: 'Redo (Ctrl+Y)',
        selectAll: 'Select all', duplicate: 'Duplicate selection', deleteSelection: 'Delete selection',
        addMarker: 'Add marker', fitDuration: 'Fit duration to content', btnClearAll: 'Clear scene',
        micToggle: 'Record narration too (microphone)', record: 'Record', stopRecording: 'Stop',
        recordTitle: 'Record: each stroke enters the timeline in sequence (with the mic on, in real time with narration)',
        export: 'Export', btnExportVideo: 'Video (MP4/WebM)…', exportGif: 'Animated GIF…', btnExportFrames: 'PNG frames (ZIP)',
        exportPng: 'Current frame (PNG)', exportSrt: 'Subtitles (.srt)', exportVtt: 'Subtitles (.vtt)', cropRegion: 'Set recording region',
        themeToggle: 'Toggle light/dark theme', shortcutsTitle: 'Keyboard shortcuts', inspectorToggle: 'Properties',

        toolsTitle: 'Tools', toolSelect: 'Select and move (V)', toolPan: 'Pan view (G)', modeDraw: 'Pen (D)',
        toolHighlighter: 'Highlighter (H)', modeErase: 'Eraser (E)', toolArrow: 'Arrow (A)', toolRect: 'Rectangle (R)',
        toolEllipse: 'Ellipse (O)', modeComment: 'Comment / text (C)', toolBadge: 'Step number (N)', toolLaser: 'Laser pointer (Z)',
        toolSpotlight: 'Spotlight (S)', toolRedact: 'Redact sensitive data (X)', toolCamera: 'Camera move (F)', quickColor: 'Current color',
        toolSelectName: 'Select', toolPanName: 'Pan view', toolHighlighterName: 'Highlighter', toolArrowName: 'Arrow',
        toolBadgeName: 'Step number', toolLaserName: 'Laser pointer', toolSpotlightName: 'Spotlight', toolRedactName: 'Redact', toolCameraName: 'Camera',
        toolName_arrow: 'Arrow', toolName_rect: 'Rectangle', toolName_ellipse: 'Ellipse',
        shape_arrow: 'Arrow', shape_rect: 'Rectangle', shape_ellipse: 'Ellipse', shape_line: 'Line',

        scenePrev: 'Previous scene', sceneNext: 'Next scene', scenesTitle: 'Scenes', noFileLoaded: 'Whiteboard',
        cameraPreview: 'Camera', cameraPreviewTitle: 'Watch playback through the camera framing',
        zoomIn: 'Zoom in', zoomOut: 'Zoom out', fitScreen: 'Fit to screen', centerCanvas: 'Center',
        emptyTitle: 'Start your explainer video',
        emptyText: 'Import a PDF or image and animate drawings, arrows and comments on top — or start on a whiteboard.',
        emptyImport: 'Import PDF or image', emptyBlank: 'Whiteboard', emptyExample: 'See an example',
        emptyHint: 'or drag and drop a file here · Ctrl+V pastes an image', dropHere: 'Drop to import',
        recentProjects: 'Recent',

        sectionDraw: 'Pen', labelDrawColor: 'Color', labelLineWidth: 'Width', penStyle: 'Stroke style',
        penSmooth: 'Smooth', penPressure: 'Pen (pressure)', shapeFill: 'Fill (translucent)',
        hintStraight: '<kbd>Alt</kbd> free straight line · <kbd>Shift</kbd> snap to 45°',
        hintShape: 'Drag on the canvas. <kbd>Shift</kbd> keeps proportions / 45° angles.',
        sectionErase: 'Eraser', labelEraseSize: 'Size', hintErase: 'Erases only your strokes — the PDF/image background is never affected.',
        sectionComments: 'Comment', labelCommentText: 'Text',
        commentPlaceholder: 'Type and click the canvas — or click the canvas directly to write there.',
        labelTextColor: 'Text', labelBgColor: 'Background', labelBorderColor: 'Border', labelFont: 'Font', labelFontSize: 'Size',
        labelOpacity: 'Background opacity', animIn: 'Entrance', animOut: 'Exit', balloon: 'Speech bubble pointing',
        labelCommentTime: 'Appears at (s)', labelCommentDuration: 'Duration (s)', useCurrentTime: 'Use playhead time',
        btnPositionComment: 'Place on canvas', badgeNext: 'Next number',
        hintBadge: 'Click the canvas to mark the order of steps (1, 2, 3…). Each number pops in at the playhead.',
        hintLaser: 'Point while dragging: the video shows a glowing dot with a fading trail — it leaves no mark.',
        spotDim: 'Dim the rest', shapeLabel: 'Shape', shapeRect: 'Rectangle', shapeEllipse: 'Ellipse',
        hintSpotlight: 'Drag over the area to highlight. During the item, everything else dims.',
        redactMode: 'Mode', redactPixelate: 'Pixelate', redactBlur: 'Blur', redactSolid: 'Solid bar',
        hintRedact: 'Drag over sensitive data (names, amounts, e-mails). The area stays unreadable for the whole video by default.',
        hintCamera: 'Place the playhead and drag a rectangle: the camera zooms/pans to it from that moment on. Use “Camera” above the canvas to preview.',
        hintSelect: 'Click to select, <kbd>Shift</kbd>+click adds, drag on empty space to select many. Drag to move; the corner resizes. <kbd>Del</kbd> deletes · <kbd>Ctrl+D</kbd> duplicates.',
        hintPan: 'Drag to move. <kbd>Ctrl</kbd>+mouse wheel (or pinch) zooms at the cursor.',
        sectionAnimation: 'Scene & animation', sceneName: 'Scene name', labelTotalDuration: 'Duration (s)', fitDurationShort: 'Fit to content',
        labelSpeed: 'Playback speed', sceneBg: 'Whiteboard background', labelPersistPaths: 'Keep drawings after animation',
        statDraws: 'Drawings', statErases: 'Erases', statComments: 'Comments', statEnd: 'Content ends at',
        animNone: 'None', animFade: 'Fade', animPop: 'Pop', animSlide: 'Slide', animTypewriter: 'Typewriter',
        colorX: 'Color {c}', customColor: 'Other color…',
        starts: 'Start', duration: 'Duration', easing: 'Easing', easeLinear: 'Linear', easeInOut: 'Smooth (in and out)',
        easeIn: 'Accelerate', easeOut: 'Decelerate', pace: 'Pace', paceNatural: 'Natural (as drawn)', paceUniform: 'Uniform',
        borderWidth: 'Border width', badgeNumber: 'Number', markerLabel: 'Label', name: 'Name', volume: 'Volume',
        trimStart: 'Trim start', cameraUseCrop: 'Use the recording region as framing',
        cameraNeedCrop: 'Set a recording region first (Export ▸ Set recording region).',
        nSelected: '{n} items selected', toPlayhead: 'To playhead', goToItem: 'Go to', delete: 'Delete', strokeName: 'Stroke',
        marker: 'Marker',

        resizeTimeline: 'Drag to resize the timeline', toStart: 'Back to start (Home)', playPause: 'Play / pause',
        narrate: 'Narrate', narrateTitle: 'Narrate: plays the scene and records your voice over it', addMarkerTitle: 'Add marker at playhead (M)',
        fitTimeline: 'Fit to width',
        track_draw: 'Drawings', track_erase: 'Erase', track_laser: 'Pointer', track_comment: 'Comments', track_effect: 'Effects',
        track_camera: 'Camera', track_audio: 'Audio',
        itemsOne: '{n} item', itemsMany: '{n} items', simultaneous: '{n} simultaneous', layers: '{n} layers', parallelBadge: '⚡ PARALLEL',
        toggleVisibility: 'Visibility', muteTrack: 'Mute / unmute audio', lockTrack: 'Lock',
        strokeN: 'Stroke {n}', eraseN: 'Erase {n}', laserN: 'Laser {n}', spotlightN: 'Spotlight {n}', redactN: 'Redact {n}',
        highlighterN: 'Highlighter {n}', cameraN: 'Camera {n}', audio: 'Audio', deleteItem: 'Delete item',
        trackShown: 'Track "{name}" visible', trackHidden: 'Track "{name}" hidden', trackLocked: 'Track "{name}" locked', trackUnlocked: 'Track "{name}" unlocked',
        trackLockedDelete: '🔒 Track locked — unlock it to delete.', trackLockedMove: '🔒 Track locked — unlock it to move.',
        durationExtended: 'Duration extended to {s}s', markerN: 'Marker {n}', markerAdded: 'Marker at {t}s',
        markerRename: 'Marker name',

        addActionsFirst: 'Add some actions first!', nothingToUndo: 'Nothing to undo.', nothingToRedo: 'Nothing to redo.',
        undone: '↩ Undone', redone: '↪ Redone', itemDeleted: 'Item deleted', itemsDeleted: '{n} items deleted',
        nothingSelected: 'Nothing selected', duplicated: '{n} item(s) duplicated', copied: '{n} item(s) copied — Ctrl+V pastes at the playhead',
        confirmClear: 'Clear all items in this scene?', cleared: 'Scene cleared', confirm: 'Confirm', cancel: 'Cancel', close: 'Close',
        remove: 'Remove', open: 'Open', rename: 'Rename', moveUp: 'Move up', moveDown: 'Move down',
        typeCommentFirst: 'Type the comment text first.', positionCommentHelp: '📍 Click where you want the comment · Esc cancels',
        commentPlaced: '💬 Comment at {t}s', inlinePlaceholder: 'Type… (Enter confirms, Shift+Enter breaks the line)',
        timeSetTo: '⏱️ Playhead time: {t}s', durationFitted: 'Duration set to {s}s',
        snap45: '📐 Snap 45°', freeLine: '📏 Free line', keySpace: 'Space', keyWheel: 'wheel',
        cropHelp: '✂️ Drag to set the recording region · Esc cancels', cropSet: '✂️ Region {w}×{h}px — the video frames only it',
        cropRemoved: 'Recording region removed — exports the whole scene', cropActive: 'Recording region:',
        redactAdded: 'Area redacted for the whole video (adjust in timeline ▸ Effects)',
        cameraAdded: '🎥 Camera move at {t}s — turn on “Camera” to preview',
        cameraPreviewEmpty: 'No camera moves: use the Camera tool (F) or set a recording region.',
        recordStarted: '● Recording in sequence — draw; each stroke goes right after the previous one.', recSequential: 'SEQ',
        micOn: '🎙 Narration on: “Record” captures your voice in real time', micOff: 'Narration off',
        micError: 'Could not use the microphone', micUnsupported: 'This browser cannot record audio',
        narration: 'Narration', narrationStarted: '🎙 Narrating — speak while the scene plays (pause to finish)',
        narrationSaved: '🎙 {s}s narration added', audioImported: '🎵 {s}s audio added at the playhead',
        sceneN: 'Scene {n}', pageN: 'Page {n}', pageOf: 'Page {n}/{total}', copySuffix: '(copy)',
        cantDeleteLastScene: 'A project needs at least one scene.', sceneDeleted: 'Scene deleted',
        sceneSummary: '{s}s · {n} items', addBlankScene: '+ Blank scene', addPdfPage: '+ PDF page', whichPage: 'Which PDF page?',
        duplicateScene: 'Duplicate scene', renameScene: 'Scene name', pageNotFound: 'Page {n} not found.',
        loadingPdf: 'Loading PDF…', pdfLoaded: '📄 PDF loaded', pdfScenesCreated: '📄 {n}-page PDF: one scene per page (see Scenes)',
        pdfTruncated: 'Large PDF: only the first {n} pages became scenes', imageLoaded: '🖼️ Image loaded',
        imageBackground: 'Image', pastedImage: 'pasted image', unsupportedFile: 'Unsupported format. Use PDF, image, audio or a .json project.',
        justNow: 'just now', minutesAgo: '{n} min ago', hoursAgo: '{n} h ago',

        saveDirty: 'Unsaved changes', saveSaving: 'Saving…', saveSaved: 'Saved in this browser', saveError: 'Save failed',
        projectSaved: '💾 Project saved in this browser', quickSaved: 'Quick save done',
        quickSavedNoBg: '⚠️ Saved without PDF/image/audio (browser quota exceeded) — use “Save as file” for the full project.',
        nothingSaved: 'No quick save found', loadedOk: 'Project loaded', importedOk: 'Project imported',
        fileSaved: 'Project file saved', invalidProject: 'Invalid project file', projectNotFound: 'Project not found',
        projectRestored: '↺ “{name}” restored', currentProject: 'Open', restoreOffer: 'There is a saved project from your last session.', noProjects: 'No saved projects yet.',
        renameProject: 'Project name', confirmDeleteProject: 'Delete project “{name}” from this browser?',
        sandboxNotice: 'Local storage unavailable — use “Save as file”.',

        exportInProgress: 'An export is already in progress.', exportScope: 'Scenes', exportAllScenes: 'All scenes ({n}) in sequence',
        exportCurrentScene: 'Current scene only', exportFit: 'Framing', fitContain: 'Fit (letterbox)', fitCover: 'Fill (crops edges)',
        exportGifTitle: 'Export GIF', exportGifDesc: 'Best for short clips (chat, docs). For long videos prefer MP4.',
        gifWidth: 'Width', fps: 'Frames per second', exportVideoTitle: 'Export video',
        exportVideoDescFast: 'Frame-by-frame rendering (faster than real time, no stutter). You can switch tabs.',
        exportVideoDescRealtime: 'This browser records in real time: keep the tab open and visible until it finishes.',
        exportFormat: 'Format', exportResolution: 'Resolution', exportQuality: 'Quality', qualityHigh: 'High', qualityMedium: 'Medium', qualityLow: 'Low (smaller file)',
        exportIncludeAudio: 'Include audio (narration/music)', presetAuto1080: 'Automatic — up to 1080p (keeps proportions)',
        presetAuto4k: 'Automatic — up to 4K (keeps proportions)', presetVertical: '1080 × 1920 (vertical 9:16 — Reels/Shorts)', presetSquare: '1080 × 1080 (square)',
        exportingVideo: 'Exporting video…', exportingRealtime: 'Recording video in real time…', exportingFrames: 'Exporting frames…', exportingGif: 'Exporting GIF…',
        exportFrameOf: 'Frame {n} of {total}', etaSeconds: '~{s}s left', finalizing: 'Finalizing…', exportCancelled: 'Export cancelled',
        videoExported: '🎬 Video exported ({s}s)', mp4CodecNote: 'Video exported as MP4 with the {codec} codec (this browser cannot encode H.264). It plays in browsers and VLC; for older editors prefer WebM or another browser.',
        noAudioCodec: 'No audio encoder available — video exported without sound.', noVideoSupport: 'This browser cannot export video; exporting PNG frames.',
        realtimeWarning: '⏺ Real-time recording: do not switch tabs until it finishes.', framesExported: '📦 {n} frames exported in a ZIP',
        gifExported: '🖼️ GIF exported', gifReduced: 'GIF limited to {n} frames (reduced fps)', pngExported: '🖼️ Frame exported',
        noCommentsForSubs: 'No text comments to build subtitles from.', subsExported: 'Subtitles exported',

        scGroupTools: 'Tools', scGroupPlayback: 'Playback', scGroupEdit: 'Editing', scGroupView: 'View and file',
        scJumpSecond: 'Back / forward 1s', scFrameStep: 'Previous / next frame (Shift = 1s)', scStartEnd: 'Start / end',
        scCopyPaste: 'Copy / paste at playhead', scNudge: 'Move selection (Shift = 10px)', scStraight: 'Free / snapped straight line', scPan: 'Pan the view',

        exProjectName: 'Example — 3-step flow', exTitle: 'How our process works', exStep1: 'Idea', exStep2: 'Prototype', exStep3: 'Launch',
        exNote: 'Validate early with real users 💡', exampleLoaded: '✨ Example loaded — press Space to watch',

        errBackground: 'Error loading the scene background', errRender: 'Rendering error', errLoadPdf: 'Error loading the PDF',
        errLoadImage: 'Error loading the image', errAudio: 'Error processing audio', errSave: 'Error saving', errSaveIdb: 'Could not save in the browser — trying quick save.',
        errLoad: 'Error loading the project', errExport: 'Error exporting', errImport: 'Error importing the project', errReadFile: 'Error reading the file',
        errExportVideo: 'Error exporting the video', errExportFrames: 'Error exporting frames', errExportGif: 'Error exporting GIF',
        initError: 'Error initializing the app. Check the console for details.'
    }
};

const I18N_STORAGE_KEY = 'flowAnimatorLang';
let _currentLang = 'pt-BR';

function getLang() {
    return _currentLang;
}

// t('chave', { n: 3 }) → texto no idioma atual com {n} substituído (fallback pt-BR → chave)
function t(key, params) {
    const dict = I18N[_currentLang] || I18N['pt-BR'];
    let s = dict[key];
    if (s === undefined) s = I18N['pt-BR'][key];
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
    return s;
}

function applyI18n(lang) {
    _currentLang = I18N[lang] ? lang : 'pt-BR';
    const dict = I18N[_currentLang];
    // Leitores de tela usam o lang do documento para a pronúncia correta
    document.documentElement.lang = _currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (dict[key] === undefined) return;
        // #fileName é reescrito pelo app (nome do arquivo, página do PDF) — só traduz o estado vazio
        // se nada estiver carregado, senão a troca de idioma apagaria o nome em exibição.
        if (key === 'noFileLoaded') {
            const fa = window.flowAnimator;
            if (fa && (fa.pdfDoc || fa.isImage)) return;
        }
        el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const v = dict[el.dataset.i18nTitle];
        if (v === undefined) return;
        el.title = v;
        el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const v = dict[el.dataset.i18nPlaceholder];
        if (v !== undefined) el.placeholder = v;
    });
    // Só strings estáticas do próprio dicionário (contêm <kbd>) — nunca dado de usuário
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const v = dict[el.dataset.i18nHtml];
        if (v !== undefined) el.innerHTML = v;
    });
}

// localStorage pode lançar (modo sandbox/privado em alguns navegadores)
function _getSavedLang() {
    try {
        return localStorage.getItem(I18N_STORAGE_KEY);
    } catch (e) {
        return null;
    }
}

function _saveLang(lang) {
    try {
        localStorage.setItem(I18N_STORAGE_KEY, lang);
    } catch (e) {
        // Sem persistência disponível — a tradução ainda é aplicada nesta sessão.
    }
}

// Idioma inicial: salvo → idioma do navegador → pt-BR
(function initLang() {
    const saved = _getSavedLang();
    const nav = (navigator.language || '').toLowerCase();
    _currentLang = saved && I18N[saved] ? saved : (nav.startsWith('pt') || !nav ? 'pt-BR' : 'en');
})();

document.addEventListener('DOMContentLoaded', () => {
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = _currentLang;
        langSelect.addEventListener('change', (e) => {
            _saveLang(e.target.value);
            applyI18n(e.target.value);
            document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: _currentLang } }));
        });
    }
    applyI18n(_currentLang);
});
