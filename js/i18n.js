// i18n leve para a UI estática (chrome fixo: botões, labels, headers de seção).
// Não cobre strings dinâmicas interpoladas (tooltips com valores, mensagens de erro, etc.) —
// essas continuam só em pt-BR por enquanto.

const I18N = {
    'pt-BR': {
        btnImport: '📁 Importar PDF/Imagem',
        modeDraw: '✏️ Desenhar',
        modeErase: '🧽 Apagar',
        modeComment: '💬 Comentar',
        btnClearAll: '🗑️ Limpar Tudo',
        btnSave: '💾 Salvar',
        btnLoad: '📂 Carregar',
        btnExportJson: '📤 Exportar JSON',
        btnImportJson: '📥 Importar JSON',
        btnExportVideo: '🎬 Exportar Vídeo HD',
        btnExportFrames: '📸 Exportar Frames',
        noFileLoaded: 'Nenhum arquivo carregado',
        sectionDraw: '🎨 Configurações de Desenho',
        labelDrawColor: 'Cor do Desenho',
        labelLineWidth: 'Espessura da Linha',
        sectionErase: '🧽 Configurações de Apagar',
        labelEraseSize: 'Tamanho do Apagador',
        sectionComments: '💬 Comentários',
        labelCommentText: 'Texto do Comentário',
        labelTextColor: 'Cor do Texto',
        labelBgColor: 'Cor do Fundo',
        labelBorderColor: 'Cor da Borda',
        labelFont: 'Fonte',
        labelFontSize: 'Tamanho da Fonte',
        labelOpacity: 'Opacidade do Fundo',
        labelCommentTime: 'Tempo de Aparição (s)',
        labelCommentDuration: 'Duração (s)',
        btnPositionComment: '📍 Posicionar Comentário',
        sectionAnimation: '⚙️ Configurações de Animação',
        labelSpeed: 'Velocidade de Reprodução',
        labelTotalDuration: 'Duração Total (s)',
        labelPersistPaths: 'Manter desenhos após animação',
        sectionTimeline: '🎬 Sistema de Timeline Avançado',
        sectionStats: '📊 Estatísticas',
        statusReady: 'Pronto',
        sandboxNotice: '⚠️ Modo Sandbox - Use Exportar/Importar JSON para salvar'
    },
    'en': {
        btnImport: '📁 Import PDF/Image',
        modeDraw: '✏️ Draw',
        modeErase: '🧽 Erase',
        modeComment: '💬 Comment',
        btnClearAll: '🗑️ Clear All',
        btnSave: '💾 Save',
        btnLoad: '📂 Load',
        btnExportJson: '📤 Export JSON',
        btnImportJson: '📥 Import JSON',
        btnExportVideo: '🎬 Export HD Video',
        btnExportFrames: '📸 Export Frames',
        noFileLoaded: 'No file loaded',
        sectionDraw: '🎨 Drawing Settings',
        labelDrawColor: 'Drawing Color',
        labelLineWidth: 'Line Width',
        sectionErase: '🧽 Eraser Settings',
        labelEraseSize: 'Eraser Size',
        sectionComments: '💬 Comments',
        labelCommentText: 'Comment Text',
        labelTextColor: 'Text Color',
        labelBgColor: 'Background Color',
        labelBorderColor: 'Border Color',
        labelFont: 'Font',
        labelFontSize: 'Font Size',
        labelOpacity: 'Background Opacity',
        labelCommentTime: 'Appearance Time (s)',
        labelCommentDuration: 'Duration (s)',
        btnPositionComment: '📍 Position Comment',
        sectionAnimation: '⚙️ Animation Settings',
        labelSpeed: 'Playback Speed',
        labelTotalDuration: 'Total Duration (s)',
        labelPersistPaths: 'Keep drawings after animation',
        sectionTimeline: '🎬 Advanced Timeline System',
        sectionStats: '📊 Statistics',
        statusReady: 'Ready',
        sandboxNotice: '⚠️ Sandbox Mode - Use Export/Import JSON to save'
    }
};

const I18N_STORAGE_KEY = 'flowAnimatorLang';

function applyI18n(lang) {
    const dict = I18N[lang] || I18N['pt-BR'];
    // Leitores de tela usam o lang do documento para a pronúncia correta
    document.documentElement.lang = I18N[lang] ? lang : 'pt-BR';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (dict[key] === undefined) return;

        // #fileName é reescrito dinamicamente pelo FlowAnimator (nome do arquivo, "Carregando...",
        // título/página do PDF) — só aplicamos a tradução do estado vazio se nada estiver carregado,
        // senão a troca de idioma apagaria o nome do arquivo em exibição.
        if (key === 'noFileLoaded') {
            const hasFileLoaded = window.flowAnimator && (window.flowAnimator.pdfDoc || window.flowAnimator.isImage);
            if (hasFileLoaded) return;
        }

        el.textContent = dict[key];
    });
}

// localStorage pode lançar (modo sandbox/privado em alguns navegadores) — mesma
// cautela usada em FlowAnimator.prototype.checkLocalStorage.
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

document.addEventListener('DOMContentLoaded', () => {
    const savedLang = _getSavedLang() || 'pt-BR';
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = savedLang;
        langSelect.addEventListener('change', (e) => {
            const lang = e.target.value;
            _saveLang(lang);
            applyI18n(lang);
        });
    }
    applyI18n(savedLang);
});
