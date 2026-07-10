        // Flow Animator Principal
        function FlowAnimator() {
            this.canvas = document.getElementById('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.mode = 'draw';
            this.isDrawing = false;
            this.currentPath = [];
            this.actions = [];
            this.comments = [];
            this.isPlaying = false;
            this.animationProgress = 0;
            this.animationSpeed = 1;
            this.totalAnimationTime = 10;
            this.persistPaths = true;
            
            // Canvas para desenhos (separado da imagem de fundo)
            this.drawingCanvas = document.createElement('canvas');
            this.drawingCtx = this.drawingCanvas.getContext('2d');
            
            // PDF/Image
            this.pdfDoc = null;
            this.pdfPage = null;
            this.imageData = null;
            this.isImage = false;
            this.pdfImageData = null;
            this.scale = 1;
            this.displayScale = 1;
            
            // Drawing settings
            this.flowColor = '#4a90e2';
            this.lineWidth = 3;
            this.eraseSize = 20;
            
            // Comment settings
            this.commentTextColor = '#333333';
            this.commentBgColor = '#ffffff';
            this.commentBorderColor = '#f39c12';
            this.commentFontFamily = 'Arial';
            this.commentFontSize = 16;
            this.commentOpacity = 0.9;
            this.selectedComment = null;
            this.isDraggingComment = false;
            this.dragOffset = { x: 0, y: 0 };
            this.isPositioningComment = false;
            this.commentPreview = document.createElement('div');
            this.commentPreview.className = 'comment-preview';

            // Modo Timeline (gravação): a agulha corre em tempo real e cada traço é
            // gravado sequencialmente, logo após o fim do anterior (ver enterTimelineMode).
            this.timelineMode = false;
            this._recordCursor = 0;       // fim do último traço gravado (base do relógio na pausa)
            this._recordFloor = 0;        // piso do próximo início (offset escolhido ao entrar no modo)
            this._recordBase = 0;         // posição (s) da agulha no instante _recordClockRef
            this._recordClockRef = 0;     // Date.now() de referência do relógio de gravação
            this._recordRAF = null;       // id do requestAnimationFrame do relógio
            
            // Straight line mode
            this.isAltPressed   = false;
            this.isShiftPressed = false;   // snap 45°
            this.isDrawingStraightLine = false;
            this.straightLineStart = null;
            this.drawStartTime = null;
            
            // Recording
            this.isRecording = false;
            this.mediaRecorder = null;
            this.recordingChunks = [];
            
            // Error handling
            this.lastError = null;
            this.errorCount = 0;
            
            // Preview do cursor
            this.brushPreview = document.getElementById('brushPreview');
            this.eraserPreview = document.getElementById('eraserPreview');
            
            // Região de crop para exportação de vídeo
            this.cropRegion = null;        // { x, y, w, h } em coordenadas do canvas
            this._cropDragging = false;
            this._cropStart = null;

            // Região de crop para exportação
            this.cropRegion    = null;
            this._cropDragging = false;
            this._cropStart    = null;
            this._cropPreview  = null;

            // Undo / Redo
            this._undoStack = [];
            this._redoStack = [];
            
            // Canvas offscreen reutilizável para renderização de animação (evita criar a cada frame)
            this._offscreenCanvas = document.createElement('canvas');
            this._offscreenCtx = this._offscreenCanvas.getContext('2d');

            // Fundo (PDF/imagem) cacheado como canvas: drawImage é muito mais rápido que
            // putImageData a cada frame (putImageData contorna a GPU).
            this._bgCanvas = null;

            // Cache de desenhos já concluídos durante a animação (invalidado a cada mutação de actions)
            this._persistedDrawsCanvas = document.createElement('canvas');
            this._persistedDrawsCtx = this._persistedDrawsCanvas.getContext('2d');
            this._persistedDrawsKey = null;

            // Initialize
            this.initializeCanvas();
            this.bindEvents();
            
            // Timeline Professional
            this.timeline = new TimelinePro(this);
            
            // Check localStorage
            this.checkLocalStorage();
        }

        FlowAnimator.prototype.initializeCanvas = function() {
            this._syncCanvasSizes(1920, 1080);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.drawingCtx.lineCap = 'round';
            this.drawingCtx.lineJoin = 'round';
            this.clearCanvas();
            this.updateCanvasInfo();
        };

        // Mantém TODOS os canvases internos com o mesmo tamanho do principal.
        // Sem isso, o _offscreenCanvas de composição ficava travado em 1920×1080 e
        // clipava os traços durante a animação em PDFs maiores (ex.: A4 retrato em scale 2).
        FlowAnimator.prototype._syncCanvasSizes = function(width, height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.drawingCanvas.width = width;
            this.drawingCanvas.height = height;
            this._offscreenCanvas.width = width;
            this._offscreenCanvas.height = height;
            this._persistedDrawsCanvas.width = width;
            this._persistedDrawsCanvas.height = height;
            this._persistedDrawsKey = null;
        };

        // Converte o ImageData do fundo em um canvas cacheado (desenhado via drawImage,
        // que é ordens de grandeza mais rápido que putImageData por frame).
        FlowAnimator.prototype._setBackgroundFromImageData = function(imageData) {
            this.pdfImageData = imageData;
            if (!imageData) {
                this._bgCanvas = null;
                return;
            }
            this._bgCanvas = document.createElement('canvas');
            this._bgCanvas.width = imageData.width;
            this._bgCanvas.height = imageData.height;
            this._bgCanvas.getContext('2d').putImageData(imageData, 0, 0);
        };

        // Desenha o fundo (PDF/imagem ou branco) num contexto qualquer.
        FlowAnimator.prototype._drawBackground = function(ctx) {
            if (this._bgCanvas) {
                ctx.drawImage(this._bgCanvas, 0, 0);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        };

        FlowAnimator.prototype.clearCanvas = function() {
            // Limpar apenas o canvas de desenho, preservando o fundo
            this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
            
            // Redesenhar apenas se não há imagem de fundo
            if (!this.pdfImageData) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        };

        FlowAnimator.prototype.bindEvents = function() {
            const self = this;
            
            // File input
            document.getElementById('pdfInput').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                if (file.type === 'application/pdf') {
                    self.loadPDF(file);
                } else if (file.type.startsWith('image/')) {
                    self.loadImage(file);
                } else {
                    self.showTooltip('Formato não suportado. Use PDF ou imagem.');
                }
            });
            
            // Mode buttons
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    self.mode = this.dataset.mode;
                    self.updateCursor();
                    self.updateStraightLineIndicator();
                });
            });
            
            // Playback controls
            document.getElementById('playBtn').addEventListener('click', () => self.play());
            document.getElementById('pauseBtn').addEventListener('click', () => self.pause());
            document.getElementById('resetBtn').addEventListener('click', () => self.reset());
            document.getElementById('clearBtn').addEventListener('click', () => self.clear());
            document.getElementById('undoBtn').addEventListener('click', () => self.undo());
            document.getElementById('redoBtn').addEventListener('click', () => self.redo());
            
            // Save/Load
            document.getElementById('saveBtn').addEventListener('click', () => self.saveToLocalStorage());
            document.getElementById('loadBtn').addEventListener('click', () => self.loadFromLocalStorage());
            document.getElementById('exportBtn').addEventListener('click', () => self.exportJSON());
            document.getElementById('importBtn').addEventListener('click', () => {
                document.getElementById('jsonInput').click();
            });
            
            document.getElementById('jsonInput').addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    self.importJSON(e.target.files[0]);
                }
            });
            
            // Video export
            document.getElementById('exportVideoBtn').addEventListener('click', function() {
                try {
                    self.exportVideoHD();
                } catch (error) {
                    console.error('Erro ao exportar vídeo:', error);
                    self.showTooltip('Erro ao exportar vídeo. Tente exportar frames.');
                    document.getElementById('exportFramesBtn').style.display = 'inline-block';
                }
            });
            
            // Frames export (alternativa)
            document.getElementById('exportFramesBtn').addEventListener('click', function() {
                self.exportAsFrames();
            });
            
            // Canvas events
            this.canvas.addEventListener('mousedown', (e) => self.handleMouseDown(e));
            this.canvas.addEventListener('mousemove', (e) => self.handleMouseMove(e));
            this.canvas.addEventListener('mouseup', () => self.handleMouseUp());
            this.canvas.addEventListener('click', (e) => self.handleClick(e));
            
            // Preview do cursor
            this.canvas.addEventListener('mouseenter', () => self.showCursorPreview());
            this.canvas.addEventListener('mouseleave', () => self.hideCursorPreview());
            this.canvas.addEventListener('mousemove', (e) => self.updateCursorPreview(e));
            
            // Settings
            document.getElementById('flowColor').addEventListener('change', (e) => {
                self.flowColor = e.target.value;
            });
            
            document.getElementById('lineWidth').addEventListener('input', (e) => {
                self.lineWidth = parseInt(e.target.value);
                document.getElementById('lineWidthDisplay').textContent = e.target.value + 'px';
                self.updateCursorPreview();
            });
            
            document.getElementById('eraseSize').addEventListener('input', (e) => {
                self.eraseSize = parseInt(e.target.value);
                document.getElementById('eraseSizeDisplay').textContent = e.target.value + 'px';
                self.updateCursorPreview();
            });
            
            document.getElementById('commentTextColor').addEventListener('change', (e) => {
                self.commentTextColor = e.target.value;
            });
            
            document.getElementById('commentBgColor').addEventListener('change', (e) => {
                self.commentBgColor = e.target.value;
            });
            
            document.getElementById('commentBorderColor').addEventListener('change', (e) => {
                self.commentBorderColor = e.target.value;
            });
            
            document.getElementById('commentFontFamily').addEventListener('change', (e) => {
                self.commentFontFamily = e.target.value;
            });
            
            document.getElementById('commentFontSize').addEventListener('input', (e) => {
                self.commentFontSize = parseInt(e.target.value);
                document.getElementById('fontSizeDisplay').textContent = e.target.value + 'px';
            });
            
            document.getElementById('commentOpacity').addEventListener('input', (e) => {
                self.commentOpacity = parseFloat(e.target.value);
                document.getElementById('opacityDisplay').textContent = Math.round(e.target.value * 100) + '%';
            });
            
            document.getElementById('animSpeed').addEventListener('input', (e) => {
                const newSpeed = parseFloat(e.target.value);
                if (!isFinite(newSpeed) || newSpeed <= 0) return;
                // Recalcular animationStartTime preservando o progresso atual — sem isso,
                // mudar a velocidade durante o playback reescala todo o tempo já decorrido
                // e o playhead salta.
                if (self.isPlaying) {
                    self.animationStartTime = Date.now() - (self.animationProgress * self.totalAnimationTime * 1000 / newSpeed);
                }
                self.animationSpeed = newSpeed;
                document.getElementById('speedDisplay').textContent = e.target.value + 'x';
            });

            // Debounce: refresh da timeline a cada tecla é pesado, e parseInt('') = NaN
            // quebrava playhead/régua enquanto o usuário limpava o campo para digitar.
            let _durationDebounce = null;
            document.getElementById('totalDuration').addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (!isFinite(value) || value < 1) return; // ignora estados intermediários de digitação
                self.totalAnimationTime = value;
                clearTimeout(_durationDebounce);
                _durationDebounce = setTimeout(() => self.timeline.refresh(), 250);
            });

            document.getElementById('persistPaths').addEventListener('change', (e) => {
                self.persistPaths = e.target.checked;
                self.invalidateRenderCaches();
            });
            
            // Add comment
            document.getElementById('addCommentBtn').addEventListener('click', () => self.startCommentPositioning());
            
            // Zoom controls
            document.getElementById('zoomInBtn').addEventListener('click', () => self.zoomIn());
            document.getElementById('zoomOutBtn').addEventListener('click', () => self.zoomOut());
            document.getElementById('fitBtn').addEventListener('click', () => self.fitToScreen());
            document.getElementById('centerBtn').addEventListener('click', () => self.centerCanvas());
            
            // Page selection - CORRIGIDO
            document.getElementById('loadPageBtn').addEventListener('click', () => {
                const pageNum = parseInt(document.getElementById('pageSelect').value);
                if (pageNum && self.pdfDoc) {
                    self.loadPage(pageNum);
                } else {
                    self.showTooltip('Selecione uma página válida!');
                }
            });
            
            // NOVO: Troca automática de página quando seletor muda
            document.getElementById('pageSelect').addEventListener('change', (e) => {
                const pageNum = parseInt(e.target.value);
                if (pageNum && self.pdfDoc) {
                    self.loadPage(pageNum);
                }
            });
            
            // Timeline resize
            const resizeHandle = document.querySelector('.resize-handle-vertical');
            let isResizing = false;
            let startY = 0;
            let startHeight = 300;
            
            resizeHandle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startY = e.clientY;
                startHeight = document.querySelector('.timeline-area').offsetHeight;
                document.body.style.cursor = 'ns-resize';
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                
                const deltaY = startY - e.clientY;
                const newHeight = Math.max(200, Math.min(600, startHeight + deltaY));
                document.querySelector('.timeline-area').style.height = newHeight + 'px';
            });
            
            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                }
            });
            
            // Keyboard events
            document.addEventListener('keydown', (e) => {
                // Em campos de texto, Ctrl+Z/Ctrl+Y devem acionar o undo NATIVO do campo,
                // não o undo do canvas (que ainda por cima dava preventDefault no nativo).
                const inTextField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

                // Undo: Ctrl+Z
                if (!inTextField && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    self.undo();
                    return;
                }
                // Redo: Ctrl+Y ou Ctrl+Shift+Z
                if (!inTextField && (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                    e.preventDefault();
                    self.redo();
                    return;
                }

                // ESC para cancelar posicionamento de comentário ou modo crop
                if (e.key === 'Escape') {
                    if (self.isPositioningComment) {
                        self.exitCommentPositioning();
                        return;
                    }
                    if (self.mode === 'crop') {
                        self._cropPreview  = null;
                        self._cropDragging = false;
                        self.drawCropOverlay();
                        self.exitCropMode();
                        return;
                    }
                    // Esc "no vazio" não faz nada — resetar o playhead sem pedir era surpreendente
                }
                
                // Alt key for straight line (free)
                if (e.key === 'Alt') {
                    e.preventDefault();
                    self.isAltPressed = true;
                    self.updateStraightLineIndicator();
                }

                // Shift key for snapped straight line (45° increments)
                if (e.key === 'Shift') {
                    self.isShiftPressed = true;
                    self.updateStraightLineIndicator();
                }
                
                // Other shortcuts
                if (inTextField) {
                    return;
                }
                
                switch(e.key) {
                    case ' ':
                        e.preventDefault();
                        if (self.isPlaying) {
                            self.pause();
                        } else {
                            self.play();
                        }
                        break;
                    case 'd':
                    case 'D':
                        document.querySelector('[data-mode="draw"]').click();
                        break;
                    case 'e':
                    case 'E':
                        document.querySelector('[data-mode="erase"]').click();
                        break;
                    case 'c':
                    case 'C':
                        document.querySelector('[data-mode="comment"]').click();
                        break;
                }
            });
            
            document.addEventListener('keyup', (e) => {
                if (e.key === 'Alt') {
                    self.isAltPressed = false;
                    self.updateStraightLineIndicator();
                }
                if (e.key === 'Shift') {
                    self.isShiftPressed = false;
                    // Se estava desenhando com snap, finalizar a linha no endpoint atual
                    if (self.isDrawingStraightLine && self.currentPath.length >= 2) {
                        // manter currentPath como está (último endpoint snapped)
                    }
                    self.updateStraightLineIndicator();
                }
            });
            
            // Window blur - reset Alt e Shift
            window.addEventListener('blur', () => {
                self.isAltPressed   = false;
                self.isShiftPressed = false;
                self.updateStraightLineIndicator();
            });
        };

        FlowAnimator.prototype.updateCursor = function() {
            if (this.mode === 'draw') {
                this.canvas.style.cursor = 'crosshair';
            } else if (this.mode === 'erase') {
                this.canvas.style.cursor = 'grab';
            } else if (this.mode === 'comment') {
                this.canvas.style.cursor = 'text';
            }
        };

        // NOVA FUNÇÃO: Mostrar preview do cursor
        FlowAnimator.prototype.showCursorPreview = function() {
            if (this.mode === 'draw') {
                this.brushPreview.style.display = 'block';
                this.eraserPreview.style.display = 'none';
            } else if (this.mode === 'erase') {
                this.brushPreview.style.display = 'none';
                this.eraserPreview.style.display = 'block';
            } else {
                this.brushPreview.style.display = 'none';
                this.eraserPreview.style.display = 'none';
            }
        };

        // NOVA FUNÇÃO: Esconder preview do cursor
        FlowAnimator.prototype.hideCursorPreview = function() {
            this.brushPreview.style.display = 'none';
            this.eraserPreview.style.display = 'none';
        };

        // NOVA FUNÇÃO: Atualizar preview do cursor
        FlowAnimator.prototype.updateCursorPreview = function(e) {
            if (e) {
                const preview = this.mode === 'draw' ? this.brushPreview : this.eraserPreview;
                const size = this.mode === 'draw' ? this.lineWidth : this.eraseSize;
                
                if (preview.style.display === 'block') {
                    preview.style.left = (e.clientX - size / 2) + 'px';
                    preview.style.top = (e.clientY - size / 2) + 'px';
                    preview.style.width = size + 'px';
                    preview.style.height = size + 'px';
                }
            } else {
                // Apenas atualizar tamanho
                const brushSize = this.lineWidth;
                const eraserSize = this.eraseSize;
                
                this.brushPreview.style.width = brushSize + 'px';
                this.brushPreview.style.height = brushSize + 'px';
                this.eraserPreview.style.width = eraserSize + 'px';
                this.eraserPreview.style.height = eraserSize + 'px';
            }
        };

        // Snap de ponto para o ângulo múltiplo de `step` graus mais próximo
        FlowAnimator.prototype.snapAngle = function(start, end, step) {
            const dx  = end.x - start.x;
            const dy  = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return end;

            const rawDeg  = Math.atan2(dy, dx) * 180 / Math.PI;  // -180..180
            const snapped = Math.round(rawDeg / step) * step;
            const rad     = snapped * Math.PI / 180;

            return {
                x: start.x + len * Math.cos(rad),
                y: start.y + len * Math.sin(rad),
                snapDeg: ((snapped % 360) + 360) % 360   // 0..359 para display
            };
        };

        FlowAnimator.prototype.updateStraightLineIndicator = function() {
            const indicator = document.getElementById('straightLineIndicator');
            const label     = document.getElementById('straightLineLabel');
            const angleBadge = document.getElementById('angleDisplay');
            const active    = this.mode === 'draw' || this.mode === 'erase';

            if (this.isShiftPressed && active) {
                indicator.classList.add('show', 'snap-mode');
                indicator.classList.remove('snap-off');
                label.textContent = '📐 Snap 45°';
                angleBadge.textContent = this._lastSnapAngle != null
                    ? this._lastSnapAngle + '°' : '—';
            } else if (this.isAltPressed && active) {
                indicator.classList.add('show');
                indicator.classList.remove('snap-mode');
                label.textContent = '📏 Linha Livre';
                angleBadge.textContent = this._lastFreeAngle != null
                    ? this._lastFreeAngle + '°' : '—';
            } else {
                indicator.classList.remove('show', 'snap-mode');
            }
        };

        FlowAnimator.prototype.updateCanvasInfo = function() {
            const info = `${this.canvas.width}x${this.canvas.height} | Zoom: ${Math.round(this.displayScale * 100)}%`;
            document.getElementById('canvasInfo').textContent = info;
            document.getElementById('zoomDisplay').textContent = Math.round(this.displayScale * 100) + '%';
        };

        // Mouse handling
        FlowAnimator.prototype.getMousePos = function(e) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        FlowAnimator.prototype.handleMouseDown = function(e) {
            // Durante o posicionamento de comentário, o clique é só para posicionar —
            // sem isso, clicar no canvas em modo desenhar/apagar também registrava uma
            // ação-fantasma de um ponto.
            if (this.isPositioningComment) return;

            const pos = this.getMousePos(e);

            // Comentários são sempre arrastáveis em qualquer modo
            // (verificar antes de iniciar desenho/apagador)
            const clickedComment = this.getCommentAt(pos.x, pos.y);
            if (clickedComment) {
                this.selectedComment = clickedComment;
                this.isDraggingComment = true;
                this._commentDragSnapshotPending = true; // snapshot no primeiro movimento real
                this.dragOffset.x = pos.x - clickedComment.x;
                this.dragOffset.y = pos.y - clickedComment.y;
                this.canvas.style.cursor = 'grabbing';
                return;
            }

            if (this.mode === 'draw' || this.mode === 'erase') {
                this.startDrawing(e);
            }
        };

        FlowAnimator.prototype.startCommentPositioning = function() {
            const text = document.getElementById('commentText').value.trim();
            if (!text) {
                this.showTooltip('Digite um texto para o comentário primeiro!');
                return;
            }
            if (this.isPositioningComment) return; // já está em modo posicionamento
            
            this.isPositioningComment = true;
            this.canvas.classList.add('comment-positioning');
            
            // Adicionar preview apenas se não estiver no DOM
            if (!this.commentPreview.parentNode) {
                document.body.appendChild(this.commentPreview);
            }
            this.commentPreview.textContent = text;
            this.commentPreview.style.display = 'block';
            
            // Remover ajuda anterior se ainda existir
            const existingHelp = document.querySelector('.comment-positioning-help');
            if (existingHelp && existingHelp.parentNode) document.body.removeChild(existingHelp);
            
            // Mostrar ajuda
            const help = document.createElement('div');
            help.className = 'comment-positioning-help show';
            help.textContent = '📍 Clique onde deseja posicionar o comentário | ESC para cancelar';
            document.body.appendChild(help);
            
            // Auto-remover ajuda após 3 segundos
            setTimeout(() => {
                if (help.parentNode) document.body.removeChild(help);
            }, 3000);
        };

        // NOVA FUNÇÃO: Sair do modo de posicionamento
        FlowAnimator.prototype.exitCommentPositioning = function() {
            this.isPositioningComment = false;
            this.canvas.classList.remove('comment-positioning');
            this.commentPreview.style.display = 'none';
            if (this.commentPreview.parentNode) {
                document.body.removeChild(this.commentPreview);
            }
            
            // Remover ajuda se ainda estiver visível
            const help = document.querySelector('.comment-positioning-help');
            if (help && help.parentNode) {
                document.body.removeChild(help);
            }
        };

        FlowAnimator.prototype.handleMouseMove = function(e) {
            const pos = this.getMousePos(e);
            
            // Preview do comentário durante posicionamento
            if (this.isPositioningComment) {
                this.commentPreview.style.left = (e.clientX + 10) + 'px';
                this.commentPreview.style.top = (e.clientY - 10) + 'px';
                return;
            }
            
            if (this.isDraggingComment && this.selectedComment) {
                // Snapshot no primeiro movimento real, para o arrasto ser desfazível
                // (só aqui — um clique sem arrastar não polui a pilha de undo)
                if (this._commentDragSnapshotPending) {
                    this._commentDragSnapshotPending = false;
                    this.saveUndoState();
                }
                this.selectedComment.x = pos.x - this.dragOffset.x;
                this.selectedComment.y = pos.y - this.dragOffset.y;
                // Throttle: só redesenha se não há um frame pendente
                if (!this._dragRafPending) {
                    this._dragRafPending = true;
                    requestAnimationFrame(() => {
                        this._dragRafPending = false;
                        this.rebuildDrawingCanvas();
                        this.redrawMainCanvas();
                    });
                }
                return;
            }
            
            // Cursor grab quando hover sobre um comentário (qualquer modo)
            if (!this.isDrawing && this.comments.length > 0) {
                const hovered = this.getCommentAt(pos.x, pos.y);
                if (hovered) {
                    this.canvas.style.cursor = 'grab';
                } else {
                    this.updateCursor();
                }
            }
            
            if (this.isDrawing) {
                this.draw(e);
            }
            
            // Atualizar preview do cursor
            this.updateCursorPreview(e);
        };

        FlowAnimator.prototype.handleMouseUp = function() {
            if (this.isDraggingComment) {
                this.isDraggingComment = false;
                this.selectedComment = null;
                this.updateCursor(); // restaurar cursor do modo atual
            }
            
            this.stopDrawing();
        };

        FlowAnimator.prototype.handleClick = function(e) {
            if (this.isPositioningComment) {
                const pos = this.getMousePos(e);
                const text = document.getElementById('commentText').value.trim();
                const time = parseFloat(document.getElementById('commentTime').value) || 0;
                const duration = parseFloat(document.getElementById('commentDuration').value) || 3;
                
                if (text) {
                    this.saveUndoState();
                    this.comments.push({
                        x: pos.x,
                        y: pos.y,
                        text: text,
                        time: time,
                        duration: duration,
                        textColor: this.commentTextColor,
                        bgColor: this.commentBgColor,
                        borderColor: this.commentBorderColor,
                        fontFamily: this.commentFontFamily,
                        fontSize: this.commentFontSize,
                        opacity: this.commentOpacity
                    });
                    
                    document.getElementById('commentText').value = '';
                    this.rebuildDrawingCanvas();
                    this.redrawMainCanvas();
                    this.timeline.refresh();
                    this.updateInfo();
                    this.showTooltip('💬 Comentário posicionado!');
                }
                
                this.exitCommentPositioning();
                return;
            }
            
            if (this.mode === 'comment' && !this.isDraggingComment) {
                this.startCommentPositioning();
            }
        };

        // Retorna o comentário sob o ponto (x,y) usando bounding box real do texto
        // Largura do texto do comentário, cacheada por (texto, fonte, tamanho) —
        // getCommentAt roda a cada mousemove e measureText por comentário é caro.
        FlowAnimator.prototype._getCommentTextWidth = function(comment) {
            const fontFamily = comment.fontFamily || this.commentFontFamily;
            const fontSize   = comment.fontSize   || this.commentFontSize;
            const key = `${comment.text}|${fontFamily}|${fontSize}`;
            if (comment._textWidthKey !== key) {
                const ctx = this.ctx;
                ctx.save();
                ctx.font = `${fontSize}px ${fontFamily}`;
                comment._textWidth = ctx.measureText(comment.text).width;
                comment._textWidthKey = key;
                ctx.restore();
            }
            return comment._textWidth;
        };

        FlowAnimator.prototype.getCommentAt = function(x, y) {
            for (let i = this.comments.length - 1; i >= 0; i--) {
                const comment = this.comments[i];
                const fontSize = comment.fontSize || this.commentFontSize;
                const padding = 10;
                const boxW = this._getCommentTextWidth(comment) + padding * 2;
                const boxH = fontSize + padding * 2;
                if (x >= comment.x - boxW / 2 && x <= comment.x + boxW / 2 &&
                    y >= comment.y - boxH / 2 && y <= comment.y + boxH / 2) {
                    return comment;
                }
            }
            return null;
        };

        // Drawing
        FlowAnimator.prototype.startDrawing = function(e) {
            this.isDrawing = true;
            const pos = this.getMousePos(e);
            this.currentPath = [pos];
            this.drawStartTime = Date.now();

            // Modo gravação: a agulha "pula" para o início do próximo traço (recalculado
            // a partir do conteúdo atual, então já reflete undos/deleções) e o relógio
            // recomeça dali, para o novo traço ser gravado logo após o anterior.
            if (this.timelineMode) {
                this._recordCursor = this._nextRecordStart();
                this._startRecordClock(this._recordCursor);
                this._seekNeedle(this._recordCursor);
            }

            // Straight line mode: Alt = livre, Shift = snap 45°
            if (this.isAltPressed || this.isShiftPressed) {
                this.isDrawingStraightLine = true;
                this.straightLineStart = pos;
            } else {
                this.isDrawingStraightLine = false;
            }
            
            // Mostrar o primeiro ponto imediatamente
            if (this.mode === 'draw') {
                this.redrawWithCurrentPath();
            }
        };

        FlowAnimator.prototype.draw = function(e) {
            if (!this.isDrawing) return;
            
            const pos = this.getMousePos(e);
            
            // Straight line mode
            if (this.isDrawingStraightLine && this.straightLineStart) {
                let endpoint = pos;

                if (this.isShiftPressed) {
                    // Snap para múltiplos de 45°
                    const snapped = this.snapAngle(this.straightLineStart, pos, 45);
                    endpoint = snapped;
                    this._lastSnapAngle = snapped.snapDeg;
                    this.updateStraightLineIndicator();
                } else if (this.isAltPressed) {
                    // Linha livre: calcular ângulo real para exibir
                    const dx = pos.x - this.straightLineStart.x;
                    const dy = pos.y - this.straightLineStart.y;
                    const deg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                    this._lastFreeAngle = Math.round(deg);
                    this.updateStraightLineIndicator();
                }

                this.currentPath = [this.straightLineStart, endpoint];
            } else {
                this.currentPath.push(pos);
            }
            
            if (this.mode === 'draw') {
                // Redesenhar tudo + o caminho atual sendo desenhado
                this.redrawWithCurrentPath();
            } else if (this.mode === 'erase') {
                // CORRIGIDO: Apagar apenas no canvas de desenho
                this.erasePathFromDrawing(this.currentPath, this.eraseSize);
            }
        };

        FlowAnimator.prototype.stopDrawing = function() {
            if (!this.isDrawing || this.currentPath.length < 1) {
                this.isDrawing = false;
                this.isDrawingStraightLine = false;
                this.straightLineStart = null;
                return;
            }
            
            this.isDrawing = false;

            const drawnSeconds = (Date.now() - this.drawStartTime) / 1000;

            // Tempo de início e duração dependem do modo:
            // - Gravação (timelineMode): sequencial — começa no cursor (fim do traço
            //   anterior) e dura o tempo real de desenho (playback fiel ao ritmo).
            // - Normal: começa na posição atual da agulha; duração comprimida (×0.5).
            let startTime, finalDuration;
            if (this.timelineMode) {
                startTime = this._nextRecordStart();
                finalDuration = Math.max(0.5, Math.min(drawnSeconds, 15));
            } else {
                startTime = this.animationProgress * this.totalAnimationTime;
                finalDuration = Math.max(0.5, Math.min(drawnSeconds * 0.5, 10));
            }

            this.saveUndoState(); // snapshot antes de adicionar ação

            this.actions.push({
                type: this.mode,
                points: [...this.currentPath],
                color: this.flowColor,
                width: this.lineWidth,
                size: this.eraseSize,
                duration: finalDuration,
                startTime: startTime, // TEMPO ABSOLUTO, não sequencial
                timestamp: Date.now()
            });

            if (this.timelineMode) {
                // Avança o cursor para o fim deste traço e estende a duração total se
                // o conteúdo passou do fim, para não ficar fora da faixa reproduzível.
                this._recordCursor = startTime + finalDuration;
                if (this._recordCursor > this.totalAnimationTime) {
                    this.totalAnimationTime = Math.ceil(this._recordCursor + 2);
                    const totalInput = document.getElementById('totalDuration');
                    if (totalInput) totalInput.value = this.totalAnimationTime;
                }
                // Fim do traço: para o relógio e deixa a agulha parada no fim deste traço
                // (base do próximo). Ela não avança sozinha durante a pausa.
                this._stopRecordClock();
                this._seekNeedle(this._recordCursor);
            }

            this.currentPath = [];
            this.isDrawingStraightLine = false;
            this.straightLineStart     = null;
            this._lastSnapAngle        = null;
            this._lastFreeAngle        = null;

            // Redesenhar tudo após adicionar a ação
            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
        };

        FlowAnimator.prototype.drawPath = function(points, color, width, progress = 1) {
            if (points.length < 1) return;
            
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (points.length === 1) {
                // Single point
                ctx.beginPath();
                ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            } else {
                // Multiple points
                ctx.beginPath();
                const drawPoints = Math.floor(points.length * progress);
                
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < drawPoints; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
            }
            
            ctx.restore();
        };

        // NOVA FUNÇÃO: Apagar apenas do canvas de desenho - CORRIGIDO
        FlowAnimator.prototype.erasePathFromDrawing = function(points, size) {
            if (points.length < 1) return;
            
            // Aplicar a operação de apagar APENAS no canvas de desenho
            const ctx = this.drawingCtx;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (points.length === 1) {
                // Single point
                ctx.beginPath();
                ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Multiple points
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
            }
            
            ctx.restore();
            
            // Redesenhar APENAS o canvas principal (sem afetar o fundo)
            this.redrawMainCanvas();
        };

        FlowAnimator.prototype.drawComments = function() {
            for (let comment of this.comments) {
                this.drawComment(comment);
            }
        };

        FlowAnimator.prototype.drawComment = function(comment) {
            const ctx = this.ctx;
            ctx.save();
            
            const fontFamily = comment.fontFamily || this.commentFontFamily;
            const fontSize = comment.fontSize || this.commentFontSize;
            const textColor = comment.textColor || this.commentTextColor;
            const bgColor = comment.bgColor || this.commentBgColor;
            const borderColor = comment.borderColor || comment.color || this.commentBorderColor;
            const opacity = comment.opacity !== undefined ? comment.opacity : this.commentOpacity;
            
            ctx.font = `${fontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const padding = 10;
            const metrics = ctx.measureText(comment.text);
            const width = metrics.width + padding * 2;
            const height = fontSize + padding * 2;
            
            // Background com opacidade
            const bgColorWithOpacity = this.hexToRgba(bgColor, opacity);
            ctx.fillStyle = bgColorWithOpacity;
            ctx.fillRect(comment.x - width/2, comment.y - height/2, width, height);
            
            // Border
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(comment.x - width/2, comment.y - height/2, width, height);
            
            // Text
            ctx.fillStyle = textColor;
            ctx.fillText(comment.text, comment.x, comment.y);
            
            ctx.restore();
        };

        // NOVA FUNÇÃO: Converter hex para rgba
        FlowAnimator.prototype.hexToRgba = function(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // Animation - ATUALIZADO para suporte a tracks paralelas
        FlowAnimator.prototype.renderAnimationFrame = function() {
            try {
                const currentTime = this.animationProgress * this.totalAnimationTime;
                
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this._drawBackground(this.ctx);

                // NOVO SISTEMA: Processar todas as tracks em paralelo
                this.renderParallelTracks(currentTime);
                
            } catch (error) {
                this.handleError('Erro na renderização da animação', error);
            }
        };

        // Uma track oculta (botão 👁️ na timeline) não deve renderizar suas ações.
        FlowAnimator.prototype._isTypeVisible = function(type) {
            return !this.timeline || this.timeline.isTypeVisible(type);
        };

        // Invalida caches de renderização (chamar após qualquer mutação de actions,
        // toggle de persistPaths ou de visibilidade de track).
        FlowAnimator.prototype.invalidateRenderCaches = function() {
            this._persistedDrawsKey = null;
        };

        // Renderizar tracks em paralelo - usa canvas offscreen reutilizável.
        // Desenhos já concluídos (persistPaths) são cacheados em _persistedDrawsCanvas e
        // recompostos via drawImage, em vez de re-traçar cada um a cada frame; os
        // apagamentos continuam aplicados por cima de tudo a cada frame (semântica original).
        FlowAnimator.prototype.renderParallelTracks = function(currentTime) {
            const drawCanvas = this._offscreenCanvas;
            const drawCtx = this._offscreenCtx;
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

            const drawsVisible = this._isTypeVisible('draw');
            const erasesVisible = this._isTypeVisible('erase');

            if (drawsVisible) {
                // PASSO 1a: separar desenhos concluídos (cacheáveis) dos ativos
                const persistedIndices = [];
                const activeDraws = [];
                for (let i = 0; i < this.actions.length; i++) {
                    const action = this.actions[i];
                    if (action.type !== 'draw') continue;
                    const actionStartTime = action.startTime || 0;
                    const actionEndTime = actionStartTime + (action.duration || 2);
                    if (currentTime >= actionStartTime && currentTime <= actionEndTime) {
                        activeDraws.push(action);
                    } else if (currentTime > actionEndTime && this.persistPaths) {
                        persistedIndices.push(i);
                    }
                }

                // PASSO 1b: recompor (ou reaproveitar) a camada de desenhos concluídos
                const cacheKey = persistedIndices.join(',');
                if (cacheKey !== this._persistedDrawsKey) {
                    const pCtx = this._persistedDrawsCtx;
                    pCtx.clearRect(0, 0, this._persistedDrawsCanvas.width, this._persistedDrawsCanvas.height);
                    for (const i of persistedIndices) {
                        const action = this.actions[i];
                        this.drawAnimatedPath(pCtx, action.points, action.color, action.width, 1);
                    }
                    this._persistedDrawsKey = cacheKey;
                }
                if (this._persistedDrawsKey !== '') {
                    drawCtx.drawImage(this._persistedDrawsCanvas, 0, 0);
                }

                // PASSO 1c: desenhos ativos (progresso parcial, redesenhados a cada frame)
                for (const action of activeDraws) {
                    const actionStartTime = action.startTime || 0;
                    const actionDuration = action.duration || 2;
                    const progress = (currentTime - actionStartTime) / actionDuration;
                    this.drawAnimatedPath(drawCtx, action.points, action.color, action.width, progress);
                }
            }

            // PASSO 2: Aplicar apagamentos DIRETAMENTE no canvas de desenhos (não no principal)
            if (erasesVisible) {
                for (let action of this.actions) {
                    if (action.type === 'erase') {
                        const actionStartTime = action.startTime || 0;
                        const actionDuration = action.duration || 2;
                        const actionEndTime = actionStartTime + actionDuration;

                        if (currentTime >= actionStartTime && currentTime <= actionEndTime) {
                            const progress = (currentTime - actionStartTime) / actionDuration;
                            this.eraseAnimatedPathOnCanvas(drawCtx, action.points, action.size, progress);
                        } else if (currentTime > actionEndTime && this.persistPaths) {
                            this.eraseAnimatedPathOnCanvas(drawCtx, action.points, action.size, 1);
                        }
                    }
                }
            }

            // PASSO 3: Aplicar resultado final no canvas principal (fundo fica intacto)
            this.ctx.drawImage(drawCanvas, 0, 0);

            // PASSO 4: Processar comentários em paralelo
            if (this._isTypeVisible('comment')) {
                for (let comment of this.comments) {
                    const startTime = comment.time || 0;
                    const endTime = startTime + (comment.duration || 3);

                    if (currentTime >= startTime && currentTime <= endTime) {
                        this.drawComment(comment);
                    }
                }
            }
        };

        // MÉTODO UNIFICADO: Animar desenho ou apagamento num canvas
        FlowAnimator.prototype.animatePathOnCanvas = function(ctx, points, options, progress) {
            if (!points || points.length < 1) return;
            const isErase = options.mode === 'erase';
            ctx.save();
            if (isErase) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.lineWidth = options.size;
            } else {
                ctx.strokeStyle = options.color;
                ctx.lineWidth = options.width;
            }
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (points.length === 1) {
                ctx.globalAlpha = progress;
                ctx.beginPath();
                const radius = isErase ? options.size / 2 : options.width / 2;
                ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
                if (!isErase) ctx.fillStyle = options.color;
                ctx.fill();
            } else {
                const drawPoints = Math.max(1, Math.floor(points.length * progress));
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < drawPoints; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                if (drawPoints < points.length && progress < 1) {
                    const lastIndex = drawPoints - 1;
                    const segmentProgress = (points.length * progress) - lastIndex;
                    const lp = points[lastIndex];
                    const np = points[drawPoints];
                    ctx.lineTo(lp.x + (np.x - lp.x) * segmentProgress, lp.y + (np.y - lp.y) * segmentProgress);
                }
                ctx.stroke();
            }
            ctx.restore();
        };

        // Mantidos como wrappers para compatibilidade com código existente
        FlowAnimator.prototype.drawAnimatedPath = function(ctx, points, color, width, progress) {
            this.animatePathOnCanvas(ctx, points, { mode: 'draw', color, width }, progress);
        };

        FlowAnimator.prototype.eraseAnimatedPathOnCanvas = function(ctx, points, size, progress) {
            this.animatePathOnCanvas(ctx, points, { mode: 'erase', size }, progress);
        };

        // play() retorna uma Promise que resolve quando a reprodução para (fim natural, pause ou reset),
        // permitindo que quem exporta vídeo dê "await" em vez de fazer polling em isPlaying.
        FlowAnimator.prototype.play = function() {
            if (this.actions.length === 0 && this.comments.length === 0) {
                this.showTooltip('Adicione algumas ações primeiro!');
                return Promise.resolve();
            }

            // Já tocando: reutiliza a Promise em andamento em vez de criar outra —
            // sobrescrever _onPlaybackEnd deixaria a Promise anterior (que o export de
            // vídeo pode estar aguardando) pendurada para sempre.
            if (this.isPlaying && this._playbackPromise) {
                return this._playbackPromise;
            }

            this.isPlaying = true;
            this.animationStartTime = Date.now() - (this.animationProgress * this.totalAnimationTime * 1000 / this.animationSpeed);
            this._playbackPromise = new Promise((resolve) => {
                this._onPlaybackEnd = resolve;
                this.animate();
            });
            return this._playbackPromise;
        };

        FlowAnimator.prototype._resolvePlaybackEnd = function() {
            if (this._onPlaybackEnd) {
                const resolve = this._onPlaybackEnd;
                this._onPlaybackEnd = null;
                this._playbackPromise = null;
                resolve();
            }
        };

        FlowAnimator.prototype.pause = function() {
            this.isPlaying = false;
            this._resolvePlaybackEnd();
        };

        FlowAnimator.prototype.reset = function() {
            this.isPlaying = false;
            this.animationProgress = 0;
            this.renderAnimationFrame();
            this.timeline.updatePlayhead();
            this.updateTimeDisplay();
            this._resolvePlaybackEnd();
        };

        FlowAnimator.prototype.animate = function() {
            if (!this.isPlaying) return;

            const now = Date.now();
            const elapsed = (now - this.animationStartTime) * this.animationSpeed / 1000;
            this.animationProgress = elapsed / this.totalAnimationTime;

            if (this.animationProgress >= 1) {
                this.animationProgress = 1;
                this.isPlaying = false;

                if (this.isRecording) {
                    setTimeout(() => this.stopRecording(), 500);
                }
            }

            this.renderAnimationFrame();
            this.timeline.updatePlayhead();
            this.updateTimeDisplay();

            if (this.isPlaying) {
                requestAnimationFrame(() => this.animate());
            } else {
                this._resolvePlaybackEnd();
            }
        };

        // ─── Crop Region ─────────────────────────────────────────────────────────
        FlowAnimator.prototype.initCropOverlay = function() {
            this._cropCanvas = document.getElementById('cropOverlay');
            this._cropCtx    = this._cropCanvas.getContext('2d');
            this._syncCropCanvas();
            this.bindCropEvents();
        };

        FlowAnimator.prototype._syncCropCanvas = function() {
            this._cropCanvas.width  = this.canvas.width;
            this._cropCanvas.height = this.canvas.height;
            this._cropCanvas.style.width    = this.canvas.style.width  || this.canvas.width  + 'px';
            this._cropCanvas.style.height   = this.canvas.style.height || this.canvas.height + 'px';
            this._cropCanvas.style.position = 'absolute';
            this._cropCanvas.style.top  = '0';
            this._cropCanvas.style.left = '0';
            this.drawCropOverlay();
        };

        FlowAnimator.prototype.enterCropMode = function() {
            this.mode = 'crop';
            this._cropCanvas.style.pointerEvents = 'auto';
            this._cropCanvas.style.cursor = 'crosshair';
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            this.hideCursorPreviews();
            this.showTooltip('✂️ Arraste para selecionar a região de gravação | ESC cancela');
        };

        FlowAnimator.prototype.exitCropMode = function() {
            if (this.mode !== 'crop') return;
            this.mode = 'draw';
            document.querySelector('[data-mode="draw"]').classList.add('active');
            this._cropCanvas.style.pointerEvents = 'none';
            this._cropCanvas.style.cursor = 'default';
            this.updateCursor();
        };

        FlowAnimator.prototype.drawCropOverlay = function() {
            if (!this._cropCtx) return;
            const ctx = this._cropCtx;
            const cw  = this._cropCanvas.width;
            const ch  = this._cropCanvas.height;
            ctx.clearRect(0, 0, cw, ch);

            const r = this._cropPreview || this.cropRegion;
            if (!r || r.w < 2 || r.h < 2) return;

            // Escurecer tudo fora da região
            ctx.fillStyle = 'rgba(0,0,0,0.52)';
            ctx.fillRect(0, 0, cw, ch);
            ctx.clearRect(r.x, r.y, r.w, r.h);

            // Borda tracejada verde
            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth   = 2;
            ctx.setLineDash([7, 4]);
            ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
            ctx.setLineDash([]);

            // Handles de canto
            const hs = 9;
            ctx.fillStyle = '#27ae60';
            [[r.x, r.y],[r.x+r.w, r.y],[r.x, r.y+r.h],[r.x+r.w, r.y+r.h]].forEach(([hx, hy]) => {
                ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
            });

            // Label de dimensões
            const label = `${Math.round(r.w)} × ${Math.round(r.h)} px`;
            ctx.font = 'bold 13px monospace';
            const lw = ctx.measureText(label).width + 14;
            const lx = Math.max(0, Math.min(r.x, cw - lw - 4));
            const ly = r.y > 26 ? r.y - 6 : r.y + r.h + 20;
            ctx.fillStyle = 'rgba(39,174,96,0.92)';
            ctx.beginPath();
            ctx.roundRect(lx - 2, ly - 16, lw, 20, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, lx + 5, ly);
        };

        FlowAnimator.prototype.bindCropEvents = function() {
            const cc   = this._cropCanvas;
            const self = this;

            const pos = (e) => {
                const rect = cc.getBoundingClientRect();
                return {
                    x: (e.clientX - rect.left)  * (cc.width  / rect.width),
                    y: (e.clientY - rect.top)    * (cc.height / rect.height)
                };
            };

            cc.addEventListener('mousedown', (e) => {
                if (self.mode !== 'crop') return;
                self._cropDragging = true;
                self._cropStart    = pos(e);
                self._cropPreview  = null;
                e.preventDefault();
            });

            cc.addEventListener('mousemove', (e) => {
                if (!self._cropDragging) return;
                const p = pos(e);
                self._cropPreview = {
                    x: Math.min(self._cropStart.x, p.x),
                    y: Math.min(self._cropStart.y, p.y),
                    w: Math.abs(p.x - self._cropStart.x),
                    h: Math.abs(p.y - self._cropStart.y)
                };
                self.drawCropOverlay();
            });

            cc.addEventListener('mouseup', (e) => {
                if (!self._cropDragging) return;
                self._cropDragging = false;
                const r = self._cropPreview;
                if (r && r.w > 10 && r.h > 10) {
                    self.cropRegion   = { ...r };
                    self._cropPreview = null;
                    self.drawCropOverlay();
                    self.updateCropIndicator();
                    self.showTooltip(`✂️ Região: ${Math.round(r.w)}×${Math.round(r.h)}px — pronto para exportar!`);
                } else {
                    self._cropPreview = null;
                    self.drawCropOverlay();
                }
                self.exitCropMode();
            });
        };

        FlowAnimator.prototype.clearCropRegion = function() {
            this.cropRegion   = null;
            this._cropPreview = null;
            this.drawCropOverlay();
            document.getElementById('cropIndicator').classList.remove('show');
            this.showTooltip('Região de gravação removida — exporta o canvas completo');
        };

        FlowAnimator.prototype.updateCropIndicator = function() {
            if (!this.cropRegion) return;
            const r = this.cropRegion;
            document.getElementById('cropInfo').textContent =
                `${Math.round(r.w)} × ${Math.round(r.h)} px`;
            document.getElementById('cropIndicator').classList.add('show');
        };
        // ─────────────────────────────────────────────────────────────────────────

        // ─── Undo / Redo ────────────────────────────────────────────────────────
        // "points" nunca é mutado in-place (só reatribuído em optimizePerformance), então os snapshots
        // abaixo compartilham os arrays de pontos por referência em vez de cloná-los a cada ação.
        FlowAnimator.prototype.saveUndoState = function() {
            this._undoStack.push({
                actions: this.actions.map(a => Object.assign({}, a)),
                comments: this.comments.map(c => Object.assign({}, c))
            });
            if (this._undoStack.length > 30) this._undoStack.shift(); // limite de histórico
            this._redoStack = []; // nova ação invalida redo
        };

        FlowAnimator.prototype.undo = function() {
            if (this._undoStack.length === 0) { this.showTooltip('Nada para desfazer.'); return; }
            // Guardar estado atual em redo
            this._redoStack.push({
                actions: this.actions.map(a => Object.assign({}, a)),
                comments: this.comments.map(c => Object.assign({}, c))
            });
            const prev = this._undoStack.pop();
            this.actions = prev.actions;
            this.comments = prev.comments;
            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
            this.showTooltip('↩ Desfeito');
        };

        FlowAnimator.prototype.redo = function() {
            if (this._redoStack.length === 0) { this.showTooltip('Nada para refazer.'); return; }
            this._undoStack.push({
                actions: this.actions.map(a => Object.assign({}, a)),
                comments: this.comments.map(c => Object.assign({}, c))
            });
            const next = this._redoStack.pop();
            this.actions = next.actions;
            this.comments = next.comments;
            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
            this.showTooltip('↪ Refeito');
        };
        // ────────────────────────────────────────────────────────────────────────

        // Utilitário: formatar segundos em MM:SS
        FlowAnimator.prototype.formatTime = function(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        FlowAnimator.prototype.updateTimeDisplay = function() {
            const current = this.animationProgress * this.totalAnimationTime;
            const total = this.totalAnimationTime;
            document.getElementById('timeDisplay').textContent =
                `${this.formatTime(current)} / ${this.formatTime(total)}`;
            this.updateCurrentTimeDisplay();
        };

        FlowAnimator.prototype.updateInfo = function() {
            let drawCount = 0, eraseCount = 0, totalDuration = 0, maxTime = 0;

            for (let action of this.actions) {
                if (action.type === 'draw') drawCount++;
                else if (action.type === 'erase') eraseCount++;
                const actionEndTime = (action.startTime || 0) + (action.duration || 2);
                maxTime = Math.max(maxTime, actionEndTime);
                totalDuration += action.duration || 2;
            }

            // Sweep-line O(n log n) para contar ações paralelas
            let parallelActions = 0;
            if (this.actions.length > 1) {
                const evts = [];
                for (const a of this.actions) {
                    evts.push({ t: a.startTime || 0, d: 1 });
                    evts.push({ t: (a.startTime || 0) + (a.duration || 2), d: -1 });
                }
                evts.sort((a, b) => a.t - b.t || a.d - b.d);
                let cur = 0;
                for (const ev of evts) {
                    cur += ev.d;
                    if (cur > 1) { parallelActions++; break; }
                }
            }

            document.getElementById('drawCount').textContent = drawCount;
            document.getElementById('eraseCount').textContent = eraseCount;
            document.getElementById('commentCount').textContent = this.comments.length;
            document.getElementById('realDuration').textContent = totalDuration.toFixed(1) + 's';
        };

        // NOVA FUNÇÃO: Reconstruir canvas de desenho - CORRIGIDO
        FlowAnimator.prototype.rebuildDrawingCanvas = function() {
            // Toda reconstrução implica que actions mudou — invalida o cache da animação
            this.invalidateRenderCaches();

            // Limpar APENAS o canvas de desenho (não o principal)
            this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);

            // Replay de draw + erase em ordem cronológica para manter estado correto
            const sorted = this.actions.slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
            for (let action of sorted) {
                if (!this._isTypeVisible(action.type)) continue;
                if (action.type === 'draw') {
                    this.drawPathOnContext(this.drawingCtx, action.points, action.color, action.width);
                } else if (action.type === 'erase') {
                    this.erasePathOnContext(this.drawingCtx, action.points, action.size);
                }
            }
        };

        // NOVA FUNÇÃO: Redesenhar canvas principal - CORRIGIDO para preservar fundo
        FlowAnimator.prototype.redrawMainCanvas = function() {
            // Limpar canvas principal
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // SEMPRE desenhar imagem de fundo PRIMEIRO (se existir)
            this._drawBackground(this.ctx);

            // Desenhar canvas de desenho sobre o fundo (sem afetar o fundo)
            this.ctx.drawImage(this.drawingCanvas, 0, 0);

            // Desenhar comentários por último (respeitando visibilidade da track)
            if (this._isTypeVisible('comment')) {
                this.drawComments();
            }
        };

        FlowAnimator.prototype.redrawWithCurrentPath = function() {
            this.redrawMainCanvas();

            if (this.currentPath.length === 0) return;

            if (this.isDrawingStraightLine && this.currentPath.length >= 2) {
                const p0  = this.currentPath[0];
                const p1  = this.currentPath[this.currentPath.length - 1];
                const ctx = this.ctx;
                const isSnap = this.isShiftPressed;

                ctx.save();
                // Linha principal (sólida com leve alpha — confirma quando soltar)
                ctx.strokeStyle = this.flowColor;
                ctx.lineWidth   = this.lineWidth;
                ctx.lineCap     = 'round';
                ctx.globalAlpha = 0.75;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();

                // Círculo de origem
                ctx.globalAlpha = 1;
                ctx.fillStyle   = this.flowColor;
                ctx.beginPath();
                ctx.arc(p0.x, p0.y, this.lineWidth * 1.2, 0, Math.PI * 2);
                ctx.fill();

                // Círculo de destino (pulsante para snap)
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, this.lineWidth * 1.2, 0, Math.PI * 2);
                ctx.strokeStyle = isSnap ? '#27ae60' : this.flowColor;
                ctx.lineWidth   = 2;
                ctx.setLineDash([]);
                ctx.stroke();

                // Badge de ângulo ao lado do cursor
                const snapDeg = this._lastSnapAngle;
                const freeDeg = this._lastFreeAngle;
                const deg = isSnap ? snapDeg : freeDeg;
                if (deg != null) {
                    const label = deg + '°';
                    ctx.font        = 'bold 13px monospace';
                    const tw        = ctx.measureText(label).width + 12;
                    const bx        = p1.x + 14;
                    const by        = p1.y - 10;
                    ctx.fillStyle   = isSnap ? 'rgba(39,174,96,0.92)' : 'rgba(74,144,226,0.92)';
                    ctx.beginPath();
                    ctx.roundRect(bx, by - 14, tw, 18, 5);
                    ctx.fill();
                    ctx.fillStyle   = '#fff';
                    ctx.globalAlpha = 1;
                    ctx.fillText(label, bx + 6, by);
                }

                ctx.restore();
            } else {
                this.drawPath(this.currentPath, this.flowColor, this.lineWidth, 1);
            }
        };

        FlowAnimator.prototype.drawPathOnContext = function(ctx, points, color, width) {
            if (!points || points.length < 1) return;
            
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (points.length === 1) {
                // Single point
                ctx.beginPath();
                ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            } else {
                // Multiple points
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
            }
            
            ctx.restore();
        };

        // Apagador estático para rebuild do canvas de desenho
        FlowAnimator.prototype.erasePathOnContext = function(ctx, points, size) {
            if (!points || points.length < 1) return;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (points.length === 1) {
                ctx.beginPath();
                ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.stroke();
            }
            ctx.restore();
        };

        // Clear - CORRIGIDO
        FlowAnimator.prototype.clear = async function() {
            if (this.actions.length > 0 || this.comments.length > 0) {
                if (!(await showConfirm('Limpar todas as ações e comentários?'))) return;
            }
            
            this.actions = [];
            this.comments = [];
            this.currentPath = [];
            this.isPlaying = false;
            this.animationProgress = 0;
            
            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
            this.updateTimeDisplay();
        };

        // Comments - ATUALIZADA para usar novo sistema
        FlowAnimator.prototype.addComment = function() {
            const text = document.getElementById('commentText').value.trim();
            if (!text) {
                this.showTooltip('Digite um texto para o comentário!');
                return;
            }
            
            // NOVO: Usar tempo atual da timeline como padrão
            const defaultTime = this.animationProgress * this.totalAnimationTime;
            const time = parseFloat(document.getElementById('commentTime').value) || defaultTime;
            const duration = parseFloat(document.getElementById('commentDuration').value) || 3;
            
            this.comments.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                text: text,
                time: time,
                duration: duration,
                textColor: this.commentTextColor,
                bgColor: this.commentBgColor,
                borderColor: this.commentBorderColor,
                fontFamily: this.commentFontFamily,
                fontSize: this.commentFontSize,
                opacity: this.commentOpacity
            });
            
            // Atualizar campo de tempo para próximo comentário
            document.getElementById('commentTime').value = (time + duration).toFixed(1);
            document.getElementById('commentText').value = '';
            
            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
            this.showTooltip(`💬 Comentário adicionado em ${time.toFixed(1)}s!`);
        };

        // NOVA FUNÇÃO: Adicionar controles de tempo na interface
        FlowAnimator.prototype.addTimeControls = function() {
            // Botão para posicionar no tempo atual
            const timeControlsHTML = `
                <div style="margin: 10px 0; padding: 10px; background: #2a2a2a; border-radius: 4px; border: 1px solid #3a3a3a;">
                    <div style="font-size: 12px; color: #aaa; margin-bottom: 5px;">⏱️ Controles de Tempo</div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <button class="btn btn-primary btn-icon" id="setCurrentTimeBtn" title="Usar tempo atual">📍</button>
                        <span style="color: #4a90e2; font-family: monospace; font-size: 12px;" id="currentTimeDisplay">00:00</span>
                        <button class="btn btn-warning btn-icon" id="goToTimeBtn" title="Ir para tempo específico">⏰</button>
                    </div>
                </div>
            `;
            
            // Adicionar depois do campo de tempo de aparição
            const commentTimeGroup = document.getElementById('commentTime').closest('.form-group');
            commentTimeGroup.insertAdjacentHTML('afterend', timeControlsHTML);
            
            // Event listeners
            document.getElementById('setCurrentTimeBtn').addEventListener('click', () => {
                const currentTime = this.animationProgress * this.totalAnimationTime;
                document.getElementById('commentTime').value = currentTime.toFixed(1);
                this.showTooltip(`⏱️ Tempo definido para ${currentTime.toFixed(1)}s`);
            });
            
            document.getElementById('goToTimeBtn').addEventListener('click', async () => {
                const time = await showPromptModal('Ir para qual tempo (segundos)?', '0');
                if (time !== null && !isNaN(time)) {
                    const targetTime = parseFloat(time);
                    this.animationProgress = Math.max(0, Math.min(1, targetTime / this.totalAnimationTime));
                    this.renderAnimationFrame();
                    this.timeline.updatePlayhead();
                    this.updateTimeDisplay();
                    this.showTooltip(`⏰ Posicionado em ${targetTime.toFixed(1)}s`);
                }
            });
            
            // Atualizar display do tempo atual
            this.updateCurrentTimeDisplay();
        };

        FlowAnimator.prototype.updateCurrentTimeDisplay = function() {
            const display = document.getElementById('currentTimeDisplay');
            if (display) {
                const currentTime = this.animationProgress * this.totalAnimationTime;
                display.textContent = this.formatTime(currentTime);
            }
        };

        // Tempo (s) em que o último conteúdo (ação ou comentário) termina. Serve de
        // ponto de partida do cursor de gravação para não sobrescrever o que já existe.
        FlowAnimator.prototype._lastContentEnd = function() {
            let end = 0;
            for (const a of this.actions) {
                end = Math.max(end, (a.startTime || 0) + (a.duration || 0));
            }
            for (const c of this.comments) {
                end = Math.max(end, (c.time || 0) + (c.duration || 0));
            }
            return end;
        };

        // Onde o próximo traço gravado deve começar: logo após o conteúdo existente, mas
        // nunca antes do piso escolhido ao entrar no modo (_recordFloor). É DERIVADO do
        // conteúdo real em vez de um contador que só cresce — assim undo/redo, deleção de
        // item e "limpar" reposicionam o início sozinhos. Sem isso, remover o último traço
        // e desenhar de novo deixaria um espaço vazio (o próximo começava após o traço já
        // apagado) e podia estender exports com tempo em branco.
        FlowAnimator.prototype._nextRecordStart = function() {
            return Math.max(this._lastContentEnd(), this._recordFloor || 0);
        };

        // Posiciona a agulha (animationProgress) num tempo absoluto em segundos, sem tocar
        // no canvas — só move o playhead da timeline e atualiza os displays de tempo.
        FlowAnimator.prototype._seekNeedle = function(seconds) {
            const clamped = Math.max(0, Math.min(seconds, this.totalAnimationTime));
            this.animationProgress = this.totalAnimationTime > 0 ? clamped / this.totalAnimationTime : 0;
            this.timeline.updatePlayhead();
            this.updateTimeDisplay();
        };

        // Relógio de gravação: um loop de rAF que faz a agulha correr em tempo real
        // (1 s de relógio = 1 s na timeline) enquanto o usuário está desenhando um traço.
        // Só move o playhead — nunca re-renderiza o canvas — então convive sem conflito
        // com o desenho ao vivo (redrawWithCurrentPath). O loop se auto-encerra assim que
        // o traço termina (`isDrawing` vira false): fora do traço a agulha fica PARADA no
        // ponto onde o próximo traço vai começar, em vez de avançar sozinha durante a pausa.
        // `baseSeconds` é a posição da agulha no início do traço.
        FlowAnimator.prototype._startRecordClock = function(baseSeconds) {
            this._recordBase = baseSeconds;
            this._recordClockRef = Date.now();
            if (this._recordRAF) cancelAnimationFrame(this._recordRAF);

            const tick = () => {
                this._recordRAF = null;
                // Só avança durante um traço ativo; o play() (se rodando) é dono da agulha.
                if (!this.timelineMode || this.isPlaying || !this.isDrawing) return;
                const elapsed = (Date.now() - this._recordClockRef) / 1000;
                this._seekNeedle(this._recordBase + elapsed);
                this._recordRAF = requestAnimationFrame(tick);
            };
            this._recordRAF = requestAnimationFrame(tick);
        };

        FlowAnimator.prototype._stopRecordClock = function() {
            if (this._recordRAF) cancelAnimationFrame(this._recordRAF);
            this._recordRAF = null;
        };

        // Modo Timeline = modo de GRAVAÇÃO: ao ativar, um relógio começa a correr e a
        // agulha de edição anda. Cada traço desenhado é gravado sequencialmente, logo
        // após o fim do anterior (ver startDrawing/stopDrawing) — pausas para pensar não
        // viram espaços vazios na reprodução.
        FlowAnimator.prototype.enterTimelineMode = function() {
            this.timelineMode = true;
            document.body.classList.add('timeline-mode');

            // Piso do cursor = SÓ o offset do playhead escolhido pelo usuário. O fim do
            // conteúdo existente NÃO é gravado aqui (senão limpar/deletar esse conteúdo
            // dentro do modo deixaria um piso obsoleto e reabriria o vão) — ele entra
            // dinamicamente via _lastContentEnd() dentro de _nextRecordStart().
            this._recordFloor = this.animationProgress * this.totalAnimationTime;
            // Agulha começa após o conteúdo existente (ou no offset, o que for maior) e
            // fica PARADA ali — o relógio só corre enquanto um traço está sendo desenhado
            // (ver startDrawing), então a agulha não avança sozinha durante a pausa.
            this._recordCursor = this._nextRecordStart();
            this._seekNeedle(this._recordCursor);

            // Mostrar overlay com instruções
            const overlay = document.createElement('div');
            overlay.id = 'timelineModeOverlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(79, 172, 254, 0.1); z-index: 1000;
                pointer-events: none; border: 3px solid #4facfe;
            `;

            const instructions = document.createElement('div');
            instructions.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(79, 172, 254, 0.95); color: white; padding: 15px 25px;
                border-radius: 25px; font-size: 14px; font-weight: 600;
                box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
                animation: pulse 2s infinite;
            `;
            instructions.textContent = '🎬 GRAVAÇÃO ATIVA — desenhe: cada traço entra logo após o anterior; a agulha marca o tempo';

            document.body.appendChild(overlay);
            document.body.appendChild(instructions);

            // Auto-remove após 5 segundos
            setTimeout(() => {
                if (document.getElementById('timelineModeOverlay')) {
                    document.body.removeChild(overlay);
                    document.body.removeChild(instructions);
                }
            }, 5000);
        };

        // NOVA FUNÇÃO: Sair do modo timeline
        FlowAnimator.prototype.exitTimelineMode = function() {
            this.timelineMode = false;
            this._stopRecordClock();
            document.body.classList.remove('timeline-mode');

            const overlay = document.getElementById('timelineModeOverlay');
            if (overlay) {
                document.body.removeChild(overlay);
            }
        };

        // Zoom
        FlowAnimator.prototype.zoomIn = function() {
            this.displayScale = Math.min(3, this.displayScale * 1.2);
            this.updateCanvasDisplay();
        };

        FlowAnimator.prototype.zoomOut = function() {
            this.displayScale = Math.max(0.1, this.displayScale / 1.2);
            this.updateCanvasDisplay();
        };

        FlowAnimator.prototype.fitToScreen = function() {
            const wrapper = document.getElementById('canvasWrapper');
            const wrapperWidth = wrapper.clientWidth - 40;
            const wrapperHeight = wrapper.clientHeight - 40;
            
            const scaleX = wrapperWidth / this.canvas.width;
            const scaleY = wrapperHeight / this.canvas.height;
            
            this.displayScale = Math.min(scaleX, scaleY);
            this.updateCanvasDisplay();
            this.centerCanvas();
        };

        FlowAnimator.prototype.centerCanvas = function() {
            const wrapper = document.getElementById('canvasWrapper');
            const canvas = this.canvas;
            
            wrapper.scrollLeft = (canvas.offsetWidth - wrapper.clientWidth) / 2;
            wrapper.scrollTop = (canvas.offsetHeight - wrapper.clientHeight) / 2;
        };

        FlowAnimator.prototype.updateCanvasDisplay = function() {
            const w = (this.canvas.width  * this.displayScale) + 'px';
            const h = (this.canvas.height * this.displayScale) + 'px';
            this.canvas.style.width  = w;
            this.canvas.style.height = h;
            // Sincronizar overlay de crop com o mesmo tamanho visual
            if (this._cropCanvas) {
                this._cropCanvas.style.width  = w;
                this._cropCanvas.style.height = h;
            }
            this.updateCanvasInfo();
        };

        // PDF/Image Loading
        FlowAnimator.prototype.loadPDF = function(file) {
            const self = this;
            document.getElementById('fileName').textContent = 'Carregando PDF...';
            
            file.arrayBuffer().then(arrayBuffer => {
                return pdfjsLib.getDocument({
                    data: arrayBuffer,
                    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                    cMapPacked: true
                }).promise;
            }).then(pdf => {
                self.pdfDoc = pdf;
                self.isImage = false;
                
                // Setup page selector
                const pageSelect = document.getElementById('pageSelect');
                pageSelect.innerHTML = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Página ${i}`;
                    pageSelect.appendChild(option);
                }
                
                document.getElementById('pageSelector').style.display = 'flex';
                document.getElementById('fileName').textContent = file.name;
                
                return self.loadPage(1);
            }).catch(error => {
                console.error('Erro ao carregar PDF:', error);
                self.handleError('Erro ao carregar PDF', error);
                self.showTooltip('Erro ao carregar PDF!');
            });
        };

        FlowAnimator.prototype.loadImage = function(file) {
            const self = this;
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    self.isImage = true;
                    self.imageData = img;
                    self.pdfDoc = null;
                    
                    // Hide page selector
                    document.getElementById('pageSelector').style.display = 'none';
                    document.getElementById('fileName').textContent = file.name;
                    
                    self.renderImage();
                };
                img.onerror = function() {
                    self.handleError('Erro ao carregar imagem', new Error('Falha ao carregar imagem'));
                    self.showTooltip('Erro ao carregar imagem!');
                };
                img.src = e.target.result;
            };
            
            reader.onerror = function() {
                self.handleError('Erro ao ler arquivo', new Error('Falha ao ler arquivo'));
                self.showTooltip('Erro ao ler arquivo!');
            };
            
            reader.readAsDataURL(file);
        };

        // CORRIGIDO: Função loadPage única e sem conflitos
        FlowAnimator.prototype.loadPage = function(pageNumber) {
            if (!this.pdfDoc) {
                this.showTooltip('Nenhum PDF carregado!');
                return Promise.resolve();
            }
            
            if (pageNumber < 1 || pageNumber > this.pdfDoc.numPages) {
                this.showTooltip(`Página ${pageNumber} não existe! PDF tem ${this.pdfDoc.numPages} páginas.`);
                return Promise.resolve();
            }
            
            const self = this;
            document.getElementById('fileName').textContent = `Carregando página ${pageNumber}...`;
            
            return this.pdfDoc.getPage(pageNumber).then(async page => {
                self.pdfPage = page;

                // Perguntar se deve limpar ações existentes
                if (self.actions.length > 0 || self.comments.length > 0) {
                    const shouldClear = await showConfirm(
                        `Você tem ${self.actions.length} ações e ${self.comments.length} comentários.\n\n` +
                        `Deseja limpar tudo ao trocar de página?\n\n` +
                        `• SIM: Limpa tudo e inicia nova página\n` +
                        `• NÃO: Mantém as ações (pode sobrepor)`
                    );

                    if (shouldClear) {
                        await self.clear();
                    }
                }
                
                return self.renderPage().then(() => {
                    // Atualizar o seletor para mostrar a página correta
                    document.getElementById('pageSelect').value = pageNumber;
                    document.getElementById('fileName').textContent = 
                        `${self.pdfDoc._pdfInfo?.title || 'PDF'} - Página ${pageNumber}/${self.pdfDoc.numPages}`;
                    
                    self.showTooltip(`📄 Página ${pageNumber} carregada com sucesso!`);
                });
            }).catch(error => {
                self.handleError('Erro ao carregar página', error);
                self.showTooltip(`Erro ao carregar página ${pageNumber}!`);
                document.getElementById('fileName').textContent = 'Erro ao carregar página';
                throw error; // Re-lançar o erro para manter o comportamento da Promise
            });
        };

        FlowAnimator.prototype.renderPage = function() {
            if (!this.pdfPage) return Promise.resolve();
            
            try {
                const viewport = this.pdfPage.getViewport({ scale: 2 });
                this._syncCanvasSizes(viewport.width, viewport.height);

                const renderContext = {
                    canvasContext: this.ctx,
                    viewport: viewport
                };

                return this.pdfPage.render(renderContext).promise.then(() => {
                    this._setBackgroundFromImageData(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
                    this.displayScale = 1;
                    this.updateCanvasDisplay();
                    this.fitToScreen();
                    this.updateCanvasInfo();
                });
            } catch (error) {
                this.handleError('Erro ao renderizar página', error);
                this.showTooltip('Erro ao renderizar página!');
                return Promise.reject(error);
            }
        };

        FlowAnimator.prototype.renderImage = function() {
            try {
                // Set canvas size to image size (with max limits)
                const maxWidth = 1920;
                const maxHeight = 1080;
                const scaleX = maxWidth / this.imageData.naturalWidth;
                const scaleY = maxHeight / this.imageData.naturalHeight;
                const scale = Math.min(1, scaleX, scaleY);
                
                this._syncCanvasSizes(this.imageData.naturalWidth * scale, this.imageData.naturalHeight * scale);

                // Draw image
                this.ctx.drawImage(this.imageData, 0, 0, this.canvas.width, this.canvas.height);

                // Save image data
                this._setBackgroundFromImageData(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));

                this.displayScale = 1;
                this.updateCanvasDisplay();
                this.fitToScreen();
                this.updateCanvasInfo();
                // Redesenhar após carregar imagem
                this.rebuildDrawingCanvas();
                this.redrawMainCanvas();
            } catch (error) {
                this.handleError('Erro ao renderizar imagem', error);
                this.showTooltip('Erro ao renderizar imagem!');
            }
        };

        // Export Video HD - FUNÇÃO COMPLETA
        FlowAnimator.prototype.exportVideoHD = function() {
            if (this.isRecording) {
                this.showTooltip('Já existe uma gravação em andamento!');
                return;
            }
            if (this.actions.length === 0 && this.comments.length === 0) {
                this.showTooltip('Adicione algumas ações primeiro!');
                return;
            }
            
            // Verificar suporte do navegador
            if (!window.MediaRecorder) {
                this.showTooltip('Seu navegador não suporta gravação de vídeo. Use exportação de frames.');
                document.getElementById('exportFramesBtn').style.display = 'inline-block';
                return;
            }
            
            const self = this;
            
            // Mostrar progress bar
            const progressBar = document.getElementById('progressBar');
            const progressFillBar = document.getElementById('progressFillBar');
            const progressText = document.getElementById('progressText');
            progressBar.style.display = 'block';
            progressFillBar.style.width = '0%';
            progressText.textContent = '0%';
            
            try {
                // Região de source (crop) — usa canvas inteiro se não houver seleção
                const crop = this.cropRegion;
                const srcX = crop ? Math.round(crop.x) : 0;
                const srcY = crop ? Math.round(crop.y) : 0;
                const srcW = crop ? Math.round(crop.w) : this.canvas.width;
                const srcH = crop ? Math.round(crop.h) : this.canvas.height;

                // Resolução de saída: manter aspect ratio da região em 1920×1080
                const aspect  = srcW / srcH;
                let outW = 1920, outH = 1080;
                if (aspect > 16/9) { outH = Math.round(outW / aspect); }
                else               { outW = Math.round(outH * aspect); }
                // Arredondar para par (requisito de muitos codecs)
                outW = outW % 2 === 0 ? outW : outW - 1;
                outH = outH % 2 === 0 ? outH : outH - 1;

                // Criar canvas HD para gravação
                const hdCanvas = document.createElement('canvas');
                hdCanvas.width  = outW;
                hdCanvas.height = outH;
                const hdCtx = hdCanvas.getContext('2d');

                // Configurar stream
                const stream = hdCanvas.captureStream(60); // 60 FPS
                
                // Configurar MediaRecorder com melhor compatibilidade.
                // Tenta MP4/H.264 primeiro (suporte varia por navegador — nem todos oferecem),
                // com fallback para a cadeia de WebM já existente.
                let mimeType = 'video/mp4;codecs=avc1.42E01E';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = 'video/webm;codecs=vp9';
                        if (!MediaRecorder.isTypeSupported(mimeType)) {
                            mimeType = 'video/webm;codecs=vp8';
                            if (!MediaRecorder.isTypeSupported(mimeType)) {
                                mimeType = 'video/webm';
                            }
                        }
                    }
                }
                
                this.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: mimeType,
                    videoBitsPerSecond: 8000000 // 8 Mbps para boa qualidade
                });
                
                this.recordingChunks = [];
                
                this.mediaRecorder.ondataavailable = function(e) {
                    if (e.data.size > 0) {
                        self.recordingChunks.push(e.data);
                    }
                };
                
                this.mediaRecorder.onstop = function() {
                    try {
                        const blob = new Blob(self.recordingChunks, { type: mimeType });
                        self._downloadBlob(blob, 'animacao_HD_' + Date.now() + (mimeType.startsWith('video/mp4') ? '.mp4' : '.webm'));

                        progressBar.style.display = 'none';
                        self.showTooltip('Vídeo HD exportado com sucesso!');
                    } catch (error) {
                        self.handleError('Erro ao salvar vídeo', error);
                        progressBar.style.display = 'none';
                        self.showTooltip('Erro ao salvar vídeo!');
                    }
                };
                
                this.mediaRecorder.onerror = function(e) {
                    self.handleError('Erro na gravação', e.error);
                    progressBar.style.display = 'none';
                    self.showTooltip('Erro na gravação de vídeo!');
                };
                
                // Função para renderizar frame HD com crop
                const renderHDFrame = () => {
                    try {
                        hdCtx.fillStyle = '#000';
                        hdCtx.fillRect(0, 0, outW, outH);
                        // drawImage com recorte: copia só a região selecionada e estica para outW×outH
                        hdCtx.drawImage(self.canvas, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
                        
                        const progress = self.animationProgress * 100;
                        progressFillBar.style.width = progress + '%';
                        progressText.textContent    = Math.round(progress) + '%';
                    } catch (error) {
                        console.error('Erro ao renderizar frame HD:', error);
                    }
                };
                
                this.isRecording = true;
                this.mediaRecorder.start(100);
                document.getElementById('recordingIndicator').style.display = 'block';

                if (crop) {
                    this.showTooltip(`🎬 Gravando região ${Math.round(srcW)}×${Math.round(srcH)}px → vídeo ${outW}×${outH}…`);
                } else {
                    this.showTooltip(`🎬 Gravando canvas completo → ${outW}×${outH}…`);
                }
                
                // Reset e iniciar animação
                this.reset();
                
                // Override do renderAnimationFrame temporariamente
                const originalRender = this.renderAnimationFrame.bind(this);
                this.renderAnimationFrame = () => {
                    originalRender();
                    renderHDFrame();
                };
                
                // Iniciar animação após delay e aguardar o fim via Promise (sem polling)
                setTimeout(async () => {
                    await this.play();

                    // Restaurar renderização original
                    this.renderAnimationFrame = originalRender;

                    // Parar gravação
                    setTimeout(() => {
                        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                            this.mediaRecorder.stop();
                        }
                        this.isRecording = false;
                        document.getElementById('recordingIndicator').style.display = 'none';
                    }, 500);
                }, 500);
                
            } catch (error) {
                this.handleError('Erro ao inicializar gravação', error);
                progressBar.style.display = 'none';
                this.showTooltip('Erro ao inicializar gravação de vídeo!');
                document.getElementById('exportFramesBtn').style.display = 'inline-block';
            }
        };

        FlowAnimator.prototype.stopRecording = function() {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.isRecording = false;
            document.getElementById('recordingIndicator').style.display = 'none';
            document.getElementById('progressBar').style.display = 'none';
        };

        // Dispara o download de um blob. O revoke é adiado: revogar imediatamente
        // após o click() pode abortar o download em alguns navegadores.
        FlowAnimator.prototype._downloadBlob = function(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        };

        // Export as Frames (Alternativa) — empacota todos os frames num único ZIP.
        // Antes disparava um download por frame (30fps × 10s = 300 arquivos), o que os
        // navegadores bloqueiam; agora o usuário recebe um único frames_*.zip.
        FlowAnimator.prototype.exportAsFrames = async function() {
            if (this.actions.length === 0 && this.comments.length === 0) {
                this.showTooltip('Adicione algumas ações primeiro!');
                return;
            }

            const progressBar = document.getElementById('progressBar');
            const progressFillBar = document.getElementById('progressFillBar');
            const progressText = document.getElementById('progressText');
            progressBar.style.display = 'block';
            progressFillBar.style.width = '0%';
            progressText.textContent = 'Exportando frames...';

            // Reset para início
            this.reset();

            const fps = 30;
            const totalFrames = Math.max(1, Math.floor(this.totalAnimationTime * fps));
            const zip = new ZipBuilder();

            try {
                for (let frame = 0; frame < totalFrames; frame++) {
                    this.animationProgress = frame / totalFrames;
                    this.renderAnimationFrame();

                    const blob = await new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
                    if (blob) {
                        const bytes = new Uint8Array(await blob.arrayBuffer());
                        zip.addFile('frame_' + String(frame).padStart(4, '0') + '.png', bytes);
                    }

                    progressFillBar.style.width = ((frame / totalFrames) * 100) + '%';
                    progressText.textContent = `Frame ${frame + 1}/${totalFrames}`;

                    // Cede a thread a cada lote para não travar a UI
                    if (frame % 10 === 9) {
                        await new Promise((r) => setTimeout(r, 0));
                    }
                }

                this._downloadBlob(zip.build(), 'frames_' + Date.now() + '.zip');
                progressBar.style.display = 'none';
                this.showTooltip(`📦 ${totalFrames} frames exportados em um ZIP!`);
            } catch (error) {
                this.handleError('Erro ao exportar frames', error);
                progressBar.style.display = 'none';
                this.showTooltip('Erro ao exportar frames!');
            }
        };

        // Save/Load Functions - COMPLETAS
        FlowAnimator.prototype.checkLocalStorage = function() {
            try {
                const test = 'test';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return true;
            } catch(e) {
                document.getElementById('saveBtn').style.display = 'none';
                document.getElementById('loadBtn').style.display = 'none';
                document.getElementById('sandboxNotice').style.display = 'block';
                return false;
            }
        };

        // Monta o objeto de projeto serializável (usado por salvar e exportar JSON).
        // includeBackground: embute o PDF/imagem de fundo como PNG dataURL, deixando o
        // projeto autocontido — reabrir o JSON restaura o fundo em vez de vir branco.
        FlowAnimator.prototype._buildProjectData = function(includeBackground) {
            const data = {
                actions: this.actions,
                // Remove campos de cache internos (_textWidth*) antes de serializar
                comments: this.comments.map(c => {
                    const clean = Object.assign({}, c);
                    delete clean._textWidth;
                    delete clean._textWidthKey;
                    return clean;
                }),
                settings: {
                    animationSpeed: this.animationSpeed,
                    totalAnimationTime: this.totalAnimationTime,
                    persistPaths: this.persistPaths,
                    flowColor: this.flowColor,
                    lineWidth: this.lineWidth,
                    eraseSize: this.eraseSize,
                    commentTextColor: this.commentTextColor,
                    commentBgColor: this.commentBgColor,
                    commentBorderColor: this.commentBorderColor,
                    commentFontFamily: this.commentFontFamily,
                    commentFontSize: this.commentFontSize,
                    commentOpacity: this.commentOpacity,
                    canvasWidth: this.canvas.width,
                    canvasHeight: this.canvas.height
                },
                timestamp: new Date().toISOString(),
                version: '1.2'
            };
            if (includeBackground && this._bgCanvas) {
                data.background = { dataUrl: this._bgCanvas.toDataURL('image/png') };
            }
            return data;
        };

        FlowAnimator.prototype.saveToLocalStorage = function() {
            try {
                localStorage.setItem('flowAnimatorData', JSON.stringify(this._buildProjectData(true)));
                this.showTooltip('Dados salvos com sucesso!');
            } catch (error) {
                // Cota do localStorage estourada (fundo pode ter alguns MB) — tenta sem o fundo
                try {
                    localStorage.setItem('flowAnimatorData', JSON.stringify(this._buildProjectData(false)));
                    this.showTooltip('⚠️ Salvo sem o fundo (cota do navegador excedida) — use Exportar JSON para o projeto completo.');
                } catch (retryError) {
                    this.handleError('Erro ao salvar', retryError);
                    this.showTooltip('Erro ao salvar dados!');
                }
            }
        };

        FlowAnimator.prototype.loadFromLocalStorage = function() {
            try {
                const dataStr = localStorage.getItem('flowAnimatorData');
                if (!dataStr) {
                    this.showTooltip('Nenhum dado salvo encontrado!');
                    return;
                }
                
                const data = JSON.parse(dataStr);
                this.loadDataFromObject(data);
                
                this.showTooltip('Dados carregados com sucesso!');
            } catch (error) {
                this.handleError('Erro ao carregar', error);
                this.showTooltip('Erro ao carregar dados!');
            }
        };

        FlowAnimator.prototype.exportJSON = function() {
            try {
                const data = this._buildProjectData(true);
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                this._downloadBlob(blob, `flow_animation_${Date.now()}.json`);
                this.showTooltip('Arquivo JSON exportado!');
            } catch (error) {
                this.handleError('Erro ao exportar JSON', error);
                this.showTooltip('Erro ao exportar arquivo!');
            }
        };

        FlowAnimator.prototype.importJSON = function(file) {
            const self = this;
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (!data.actions && !data.comments) {
                        throw new Error('Arquivo JSON inválido - estrutura incorreta');
                    }
                    
                    self.loadDataFromObject(data);
                    self.showTooltip('Arquivo importado com sucesso!');
                    
                } catch (error) {
                    self.handleError('Erro ao importar JSON', error);
                    self.showTooltip('Erro ao importar arquivo!');
                }
            };
            
            reader.onerror = function() {
                self.handleError('Erro ao ler arquivo JSON', new Error('Falha na leitura do arquivo'));
                self.showTooltip('Erro ao ler arquivo!');
            };
            
            reader.readAsText(file);
        };

        FlowAnimator.prototype.loadDataFromObject = function(data) {
            // Validar e carregar dados
            this.actions = Array.isArray(data.actions) ? data.actions : [];
            this.comments = Array.isArray(data.comments) ? data.comments : [];
            
            if (data.settings) {
                this.animationSpeed = data.settings.animationSpeed || 1;
                this.totalAnimationTime = data.settings.totalAnimationTime || 10;
                this.persistPaths = data.settings.persistPaths !== false;
                this.flowColor = data.settings.flowColor || '#4a90e2';
                this.lineWidth = data.settings.lineWidth || 3;
                this.eraseSize = data.settings.eraseSize || 20;
                
                // Novas propriedades de comentários (com compatibilidade)
                this.commentTextColor = data.settings.commentTextColor || '#333333';
                this.commentBgColor = data.settings.commentBgColor || '#ffffff';
                this.commentBorderColor = data.settings.commentBorderColor || data.settings.commentColor || '#f39c12';
                this.commentFontFamily = data.settings.commentFontFamily || 'Arial';
                this.commentFontSize = data.settings.commentFontSize || 16;
                this.commentOpacity = data.settings.commentOpacity !== undefined ? data.settings.commentOpacity : 0.9;
                
                // Ajustar canvas se necessário
                if (data.settings.canvasWidth && data.settings.canvasHeight) {
                    this._syncCanvasSizes(data.settings.canvasWidth, data.settings.canvasHeight);
                    this.updateCanvasDisplay();
                }

                // Atualizar UI
                this.updateUIFromSettings();
            }

            // Restaurar fundo embutido (projetos v1.2+). Arquivos antigos sem `background`
            // mantêm o fundo atualmente carregado (comportamento anterior).
            if (data.background && data.background.dataUrl) {
                const img = new Image();
                img.onload = () => {
                    const bg = document.createElement('canvas');
                    bg.width = this.canvas.width;
                    bg.height = this.canvas.height;
                    bg.getContext('2d').drawImage(img, 0, 0, bg.width, bg.height);
                    this._setBackgroundFromImageData(bg.getContext('2d').getImageData(0, 0, bg.width, bg.height));
                    this.redrawMainCanvas();
                    document.getElementById('fileName').textContent = 'Fundo restaurado do projeto';
                };
                img.src = data.background.dataUrl;
            }

            this.rebuildDrawingCanvas();
            this.redrawMainCanvas();
            this.timeline.refresh();
            this.updateInfo();
        };

        FlowAnimator.prototype.updateUIFromSettings = function() {
            document.getElementById('animSpeed').value = this.animationSpeed;
            document.getElementById('speedDisplay').textContent = this.animationSpeed + 'x';
            document.getElementById('totalDuration').value = this.totalAnimationTime;
            document.getElementById('persistPaths').checked = this.persistPaths;
            document.getElementById('flowColor').value = this.flowColor;
            document.getElementById('lineWidth').value = this.lineWidth;
            document.getElementById('lineWidthDisplay').textContent = this.lineWidth + 'px';
            document.getElementById('eraseSize').value = this.eraseSize;
            document.getElementById('eraseSizeDisplay').textContent = this.eraseSize + 'px';
            
            // Atualizar controles de comentários
            document.getElementById('commentTextColor').value = this.commentTextColor;
            document.getElementById('commentBgColor').value = this.commentBgColor;
            document.getElementById('commentBorderColor').value = this.commentBorderColor;
            document.getElementById('commentFontFamily').value = this.commentFontFamily;
            document.getElementById('commentFontSize').value = this.commentFontSize;
            document.getElementById('fontSizeDisplay').textContent = this.commentFontSize + 'px';
            document.getElementById('commentOpacity').value = this.commentOpacity;
            document.getElementById('opacityDisplay').textContent = Math.round(this.commentOpacity * 100) + '%';
        };

        // Error Handling
        FlowAnimator.prototype.handleError = function(context, error) {
            this.lastError = { context: context, error: error, timestamp: new Date() };
            this.errorCount++;
            
            console.error(`[FlowAnimator] ${context}:`, error);
            
            // Log para debug
            if (this.errorCount < 5) { // Evitar spam de erros
                const errorInfo = {
                    context: context,
                    message: error.message || 'Erro desconhecido',
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    actions: this.actions.length,
                    comments: this.comments.length
                };
                
                console.log('Error details:', errorInfo);
            }
            
            // Atualizar status bar com erro
            document.getElementById('statusInfo').textContent = `Erro: ${context}`;
            setTimeout(() => {
                document.getElementById('statusInfo').textContent = 
                    'Shift = linha snapped 45° | Alt = linha livre | Espaço = Play/Pause | D/E/C = modos | Ctrl+Z = Desfazer';
            }, 5000);
        };

        // Tooltip Function
        FlowAnimator.prototype.showTooltip = function(message) {
            const tooltip = document.getElementById('tooltip');
            if (tooltip) {
                tooltip.textContent = message;
                tooltip.style.display = 'block';
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
                
                setTimeout(function() {
                    tooltip.style.display = 'none';
                }, 3000);
            }
        };

        FlowAnimator.prototype.optimizePerformance = function() {
            if (this.isPlaying) return; // nunca mutar pontos durante animação
            this.actions.forEach(action => {
                if (action.points && action.points.length > 1000) {
                    const step = Math.ceil(action.points.length / 1000);
                    const optimizedPoints = [];
                    for (let i = 0; i < action.points.length; i += step) {
                        optimizedPoints.push(action.points[i]);
                    }
                    const last = action.points[action.points.length - 1];
                    if (optimizedPoints[optimizedPoints.length - 1] !== last) {
                        optimizedPoints.push(last);
                    }
                    action.points = optimizedPoints;
                }
            });
        };
