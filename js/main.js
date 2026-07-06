        // Configurar PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Função auxiliar para inserir emoji
        function insertEmoji(emoji) {
            const textarea = document.getElementById('commentText');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + emoji + text.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
            textarea.focus();
        }

        // Escapa texto de origem externa (ex: comentários importados de JSON) antes de inserir via innerHTML
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        // Initialize
        var flowAnimator;
        document.addEventListener('DOMContentLoaded', async function() {
            try {
                flowAnimator = new FlowAnimator();
                console.log('Flow Animator inicializado com sucesso!');
                
                // Adicionar controles de tempo
                flowAnimator.addTimeControls();
                
                // Adicionar botão do modo timeline
                const timelineModeBtn = document.createElement('button');
                timelineModeBtn.className = 'btn btn-warning';
                timelineModeBtn.innerHTML = '🎬 Modo Timeline';
                timelineModeBtn.title = 'Ativar modo timeline para edição precisa';
                timelineModeBtn.addEventListener('click', () => {
                    if (flowAnimator.timelineMode) {
                        flowAnimator.exitTimelineMode();
                        timelineModeBtn.innerHTML = '🎬 Modo Timeline';
                        timelineModeBtn.className = 'btn btn-warning';
                    } else {
                        flowAnimator.enterTimelineMode();
                        timelineModeBtn.innerHTML = '🎬 Sair Timeline';
                        timelineModeBtn.className = 'btn btn-success';
                    }
                });
                
                // Adicionar o botão após os controles de play (usando ID estável)
                document.getElementById('playControlsGroup').appendChild(timelineModeBtn);
                
                // Inicializar crop overlay
                flowAnimator.initCropOverlay();

                // Botão de região de gravação
                document.getElementById('cropRegionBtn').addEventListener('click', () => {
                    flowAnimator.enterCropMode();
                });
                document.getElementById('cropClearBtn').addEventListener('click', () => {
                    flowAnimator.clearCropRegion();
                });

                // Adicionar info no status bar
                document.getElementById('statusInfo').textContent = 
                    '✅ Pronto! Alt = linha reta | Espaço = Play/Pause | Ctrl+Z = Desfazer | Ctrl+Y = Refazer';
                
                // Verificar suporte para exportação de vídeo
                setTimeout(function() {
                    if (!window.MediaRecorder) {
                        document.getElementById('exportFramesBtn').style.display = 'inline-block';
                        console.log('MediaRecorder não disponível. Use exportação de frames.');
                        flowAnimator.showTooltip('🧽 APAGADOR CORRIGIDO! Agora preserva fundo durante animação.');
                    } else {
                        console.log('✅ Apagador totalmente corrigido!');
                    flowAnimator.showTooltip('📐 Shift = snap 45° | Alt = linha livre | Ctrl+Z = Desfazer');
                    }
                }, 1000);
                
                // Otimizar performance a cada 30 segundos, usando requestIdleCallback se disponível
                setInterval(function() {
                    if (flowAnimator.actions.length > 50) {
                        if (window.requestIdleCallback) {
                            requestIdleCallback(() => flowAnimator.optimizePerformance());
                        } else {
                            flowAnimator.optimizePerformance();
                        }
                    }
                }, 30000);
                    
            } catch (error) {
                console.error('Erro ao inicializar:', error);
                await showAlertModal('Erro ao inicializar a aplicação. Verifique o console para mais detalhes.');
            }
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
            if (flowAnimator && flowAnimator.isRecording) {
                flowAnimator.stopRecording();
            }
        });
