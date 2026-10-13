        // Configurar PDF.js (vendorizado em vendor/pdfjs/ — funciona offline e via file://)
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

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

                // Handlers antes inline no HTML (onclick=""), movidos para cá — permite
                // uma Content-Security-Policy sem 'unsafe-inline' no futuro
                document.getElementById('importFileBtn').addEventListener('click', () => {
                    document.getElementById('pdfInput').click();
                });
                document.getElementById('sandboxNotice').addEventListener('click', function() {
                    this.style.display = 'none';
                });
                // Emojis: delegação única em vez de um onclick por emoji. São <button>
                // nativos, então Enter/Espaço já disparam click sem handler extra.
                document.querySelector('.emoji-picker').addEventListener('click', (e) => {
                    const btn = e.target.closest('.emoji-btn');
                    if (btn && btn.dataset.emoji) insertEmoji(btn.dataset.emoji);
                });
                
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
                
                // Sem MediaRecorder não há exportação de vídeo: oferece a de frames
                if (!window.MediaRecorder) {
                    document.getElementById('exportFramesBtn').style.display = 'inline-block';
                }

                // Canvas inicial (quadro branco 1920×1080) já ajustado à área visível
                flowAnimator.fitToScreen();
                window.addEventListener('resize', () => {
                    clearTimeout(flowAnimator._resizeFitTimer);
                    flowAnimator._resizeFitTimer = setTimeout(() => flowAnimator.fitToScreen(), 150);
                });
                
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
