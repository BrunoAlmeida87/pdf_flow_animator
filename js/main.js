// Inicialização: instancia o FlowAnimator e o Inspector e liga a topbar, menus, toolbar,
// cenas, timeline, tema e estado vazio. Carrega por último (depende de todos os módulos).

// PDF.js vendorizado em vendor/pdfjs/ (funciona offline e via file://)
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
}

var flowAnimator;

const Theme = {
    KEY: 'flowAnimatorTheme',
    current() {
        const forced = document.documentElement.dataset.theme;
        if (forced) return forced;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    },
    apply(theme) {
        if (theme) document.documentElement.dataset.theme = theme;
        else delete document.documentElement.dataset.theme;
        const use = document.querySelector('#themeBtn use');
        if (use) use.setAttribute('href', this.current() === 'light' ? '#i-moon' : '#i-sun');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = this.current() === 'light' ? '#ffffff' : '#181b21';
    },
    init() {
        let saved = null;
        try { saved = localStorage.getItem(this.KEY); } catch (e) { /* sem localStorage */ }
        this.apply(saved === 'light' || saved === 'dark' ? saved : null);
    },
    toggle() {
        const next = this.current() === 'light' ? 'dark' : 'light';
        this.apply(next);
        try { localStorage.setItem(this.KEY, next); } catch (e) { /* ignore */ }
    }
};

function wireApp(fa) {
    const on = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
    };
    const click = (id, fn) => on(id, 'click', fn);

    // Projeto / arquivo
    on('projectName', 'input', (e) => { fa.projectName = e.target.value.slice(0, 120) || t('untitledProject'); fa.markDirty(); });
    on('projectName', 'keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    click('newProjectBtn', () => fa.newProject());
    click('projectsBtn', () => fa.openProjectsDialog());
    click('importFileBtn', () => document.getElementById('pdfInput').click());
    click('importAudioBtn', () => document.getElementById('audioInput').click());
    click('saveBtn', () => fa.saveProject({ manual: true }));
    click('exportBtn', () => fa.exportJSON());
    click('importBtn', () => document.getElementById('jsonInput').click());
    click('loadBtn', () => fa.loadFromLocalStorage());
    on('pdfInput', 'change', (e) => {
        for (const f of Array.from(e.target.files || [])) fa.loadFile(f);
        e.target.value = '';
    });
    on('jsonInput', 'change', (e) => {
        if (e.target.files[0]) fa.importJSON(e.target.files[0]);
        e.target.value = '';
    });
    on('audioInput', 'change', (e) => {
        if (e.target.files[0]) fa.importAudioFile(e.target.files[0]);
        e.target.value = '';
    });

    // Editar
    click('undoBtn', () => fa.undo());
    click('redoBtn', () => fa.redo());
    click('undoMenuBtn', () => fa.undo());
    click('redoMenuBtn', () => fa.redo());
    click('selectAllBtn', () => fa.selectAll());
    click('duplicateBtn', () => fa.duplicateSelection());
    click('deleteSelBtn', () => fa.deleteSelection());
    click('addMarkerMenuBtn', () => fa.addMarker());
    click('fitDurationMenuBtn', () => fa.fitDurationToContent());
    click('clearBtn', () => fa.clear());

    // Gravação / exportação
    click('micToggleBtn', (e) => {
        fa.narrationEnabled = !fa.narrationEnabled;
        e.currentTarget.setAttribute('aria-pressed', fa.narrationEnabled ? 'true' : 'false');
        fa.showTooltip(fa.narrationEnabled ? t('micOn') : t('micOff'));
    });
    click('recordBtn', () => fa.toggleRecording());
    click('exportVideoBtn', () => fa.openExportDialog('video'));
    click('exportGifBtn', () => fa.openExportDialog('gif'));
    click('exportFramesBtn', () => fa.exportAsFrames());
    click('exportPngBtn', () => fa.exportCurrentFramePng());
    click('exportSrtBtn', () => fa.exportSubtitles('srt'));
    click('exportVttBtn', () => fa.exportSubtitles('vtt'));
    click('cropRegionBtn', () => fa.enterCropMode());
    click('cropClearBtn', () => fa.clearCropRegion());

    // Preferências
    click('themeBtn', () => Theme.toggle());
    click('helpBtn', () => fa.showShortcuts());
    click('inspectorToggle', (e) => {
        const insp = document.getElementById('inspector');
        const open = !insp.classList.contains('open');
        insp.classList.toggle('open', open);
        e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    click('sandboxNotice', (e) => { e.currentTarget.style.display = 'none'; });

    // Ferramentas
    document.querySelectorAll('.mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => fa.setMode(btn.dataset.mode));
    });

    // Cenas e canvas
    click('scenePrevBtn', () => fa.switchScene(fa.currentSceneIndex - 1));
    click('sceneNextBtn', () => fa.switchScene(fa.currentSceneIndex + 1));
    click('sceneBtn', () => fa.openScenesDialog());
    click('cameraPreviewBtn', (e) => {
        fa.cameraPreview = !fa.cameraPreview;
        e.currentTarget.setAttribute('aria-pressed', fa.cameraPreview ? 'true' : 'false');
        if (fa.cameraPreview && !fa.cameraMoves.length && !fa.cropRegion) fa.showTooltip(t('cameraPreviewEmpty'));
        if (fa.cameraPreview) fa.renderAnimationFrame(); else fa.redrawMainCanvas();
    });
    click('zoomInBtn', () => fa.zoomIn());
    click('zoomOutBtn', () => fa.zoomOut());
    click('fitBtn', () => fa.fitToScreen());
    click('centerBtn', () => fa.centerCanvas());

    // Timeline
    click('timelineResetBtn', () => fa.reset());
    click('timelinePlayBtn', () => fa.togglePlay());
    click('narrateBtn', () => fa.toggleNarration());
    click('addMarkerBtn', () => fa.addMarker());
    click('zoomInTimelineBtn', () => fa.timeline.zoomIn());
    click('zoomOutTimelineBtn', () => fa.timeline.zoomOut());
    click('fitTimelineBtn', () => fa.timeline.fitToContent());

    // Estado vazio
    click('emptyImportBtn', () => document.getElementById('pdfInput').click());
    click('emptyStartBlank', () => fa.dismissEmptyState());
    click('emptyExampleBtn', () => fa.loadExampleProject());

    // Idioma: re-renderiza o que é gerado dinamicamente
    document.addEventListener('langchange', () => {
        fa.timeline.refresh(true);
        if (fa.inspector) fa.inspector.onLanguageChange();
        fa.updateSceneUI();
        // Quadro branco: o rótulo é traduzido por applyI18n (data-i18n), que preserva um nome de
        // arquivo em exibição; cenas de PDF/imagem refazem o rótulo ("Página n/total")
        const scene = fa._scene();
        if (scene && scene.background.kind !== 'blank') fa._setFileLabel();
        fa._updateRecordUI();
        if (!fa._dirty) fa._setSaveState('off');
    });
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        Theme.init();
        flowAnimator = new FlowAnimator();
        flowAnimator.inspector = new Inspector(flowAnimator);
        flowAnimator.initCropOverlay();
        Menus.init();
        wireApp(flowAnimator);
        flowAnimator.setMode('draw');
        flowAnimator.redrawMainCanvas();
        flowAnimator.fitToScreen();
        flowAnimator._updateEmptyState();
        flowAnimator._setFileLabel();
        flowAnimator.restoreLastProject().catch((e) => flowAnimator.handleError(t('errLoad'), e));

        // Simplifica traços muito longos de tempos em tempos (em idle)
        setInterval(() => {
            if (flowAnimator.actions.length > 50) {
                if (window.requestIdleCallback) requestIdleCallback(() => flowAnimator.optimizePerformance());
                else flowAnimator.optimizePerformance();
            }
        }, 30000);
    } catch (error) {
        console.error('Erro ao inicializar:', error);
        showAlertModal(t('initError'));
    }
});

// Salva antes de sair; avisa se ainda há alteração não salva ou exportação em andamento
window.addEventListener('beforeunload', (e) => {
    if (!flowAnimator) return;
    if (flowAnimator.isRecording || flowAnimator.isExporting) {
        flowAnimator.stopRecording();
        e.preventDefault();
        e.returnValue = '';
        return;
    }
    if (flowAnimator._dirty) {
        if (flowAnimator._autosave) flowAnimator._autosave.flush();
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && flowAnimator && flowAnimator._autosave) flowAnimator._autosave.flush();
});

// PWA: instalável e offline quando publicado por http(s) (GitHub Pages). Via file:// não há
// manifest nem service worker — o <link rel="manifest"> é injetado aqui (e não no HTML) porque
// o Chromium registra erro de CORS no console ao tentar ler um manifest de file://.
const Pwa = {
    supported() { return location.protocol === 'https:' || location.protocol === 'http:'; },
    init() {
        if (!this.supported()) return;
        if (!document.querySelector('link[rel="manifest"]')) {
            const link = document.createElement('link');
            link.rel = 'manifest';
            link.href = 'manifest.webmanifest';
            document.head.appendChild(link);
        }
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker não registrado:', e));
            });
        }
        // Arquivos abertos pelo sistema operacional no app instalado ("Abrir com…", file_handlers)
        if ('launchQueue' in window) {
            window.launchQueue.setConsumer(async (params) => {
                if (!params.files || !params.files.length) return;
                const ready = () => new Promise((resolve) => {
                    if (flowAnimator) resolve();
                    else document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
                });
                await ready();
                for (const handle of params.files) {
                    try {
                        await flowAnimator.loadFile(await handle.getFile());
                    } catch (e) {
                        flowAnimator.handleError(t('errLoad'), e);
                    }
                }
            });
        }
    }
};
Pwa.init();
