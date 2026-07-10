        class TimelinePro {
            constructor(flowAnimator) {
                this.animator = flowAnimator;
                this.zoom = 1.0;
                this.pixelsPerSecond = 100;
                this.tracks = [
                    { id: 'draw', name: 'Desenhos', type: 'draw', items: [], color: '#4a90e2', locked: false, visible: true },
                    { id: 'erase', name: 'Apagar', type: 'erase', items: [], color: '#e74c3c', locked: false, visible: true },
                    { id: 'comment', name: 'Comentários', type: 'comment', items: [], color: '#f39c12', locked: false, visible: true }
                ];
                this.selectedItems = [];
                this.isDragging = false;
                this.isResizing = false;
                this.dragStartX = 0;
                this.draggedItem = null;
                this.resizeStartWidth = 0;
                
                this.setupTimeline();
                this.bindEvents();
            }

            setupTimeline() {
                // updateTrackItems PRIMEIRO: os headers dependem dos items atualizados
                // (contagem, badge de paralelo) — antes rodava dentro de renderTracks,
                // depois dos headers, deixando-os sempre uma rodada atrasados
                this.updateTrackItems();
                this.renderTrackHeaders();
                this.renderRuler();
                this.renderTracks();
                this.updatePlayhead();
            }

            renderTrackHeaders() {
                const container = document.getElementById('trackHeaders');
                container.innerHTML = '';
                
                this.tracks.forEach(track => {
                    // Verificar se há ações paralelas nesta track
                    const hasParallelActions = this.checkParallelActions(track);
                    const parallelCount = this.getParallelActionsCount(track);
                    const layeredItems = this.organizeItemsInLayers(track.items);
                    const layerCount = layeredItems.length;
                    
                    const header = document.createElement('div');
                    header.className = 'track-header';
                    header.innerHTML = `
                        <div class="track-info">
                            <div class="track-name" style="color: ${track.color}">
                                ${track.name}
                                ${hasParallelActions ? '<span style="color: #27ae60; font-size: 10px;">⚡ PARALELO</span>' : ''}
                            </div>
                            <div class="track-type">
                                ${track.items.length} items
                                ${parallelCount > 1 ? ` | ${parallelCount} simultâneos` : ''}
                                ${layerCount > 1 ? ` | ${layerCount} layers` : ''}
                            </div>
                        </div>
                        <div class="track-controls">
                            <button class="track-btn ${track.visible ? 'active' : ''}" title="Visibilidade" data-track="${track.id}" data-action="visibility">
                                👁️
                            </button>
                            <button class="track-btn ${track.locked ? 'active' : ''}" title="Travar" data-track="${track.id}" data-action="lock">
                                🔒
                            </button>
                            ${hasParallelActions ? `
                                <button class="track-expand-btn ${track.expanded ? 'expanded' : ''}" title="Expandir layers" data-track="${track.id}" data-action="expand">
                                    ${track.expanded ? '▼' : '▶'}
                                </button>
                            ` : ''}
                            ${hasParallelActions ? '<div class="track-parallel-indicator active" title="Track com ações paralelas"></div>' : ''}
                        </div>
                    `;
                    container.appendChild(header);
                });
            }

            // Sweep-line O(n log n): verifica se há qualquer sobreposição temporal
            // Sweep-line: há sobreposição temporal real entre itens desta track?
            // (fins ordenados antes de inícios em empates, para não contar "encostado" como paralelo)
            checkParallelActions(track) {
                if (track.items.length < 2) return false;
                const starts = track.items.map(i => ({ t: i.startTime, delta: 1 }));
                const ends   = track.items.map(i => ({ t: i.startTime + i.duration, delta: -1 }));
                const all = [...starts, ...ends].sort((a, b) => a.t - b.t || a.delta - b.delta);
                let count = 0;
                for (const ev of all) {
                    count += ev.delta;
                    if (count > 1) return true;
                }
                return false;
            }

            getParallelActionsCount(track) {
                let maxSimultaneous = 0;
                const timePoints = [];
                
                // Coletar todos os pontos de início e fim
                track.items.forEach(item => {
                    timePoints.push({ time: item.startTime, type: 'start' });
                    timePoints.push({ time: item.startTime + item.duration, type: 'end' });
                });
                
                // Ordenar por tempo; em empates, fins antes de inícios — um item que termina
                // exatamente quando outro começa não conta como simultâneo
                timePoints.sort((a, b) => a.time - b.time || (a.type === 'end' ? -1 : 1) - (b.type === 'end' ? -1 : 1));
                
                let current = 0;
                timePoints.forEach(point => {
                    if (point.type === 'start') {
                        current++;
                        maxSimultaneous = Math.max(maxSimultaneous, current);
                    } else {
                        current--;
                    }
                });
                
                return maxSimultaneous;
            }

            renderRuler() {
                const ruler = document.getElementById('rulerMarks');
                ruler.innerHTML = '';
                
                const duration = this.animator.totalAnimationTime;
                const width = duration * this.pixelsPerSecond * this.zoom;
                const interval = this.getTimeInterval();
                
                for (let time = 0; time <= duration; time += interval) {
                    const x = time * this.pixelsPerSecond * this.zoom;
                    
                    const mark = document.createElement('div');
                    mark.className = 'ruler-mark' + (time % 5 === 0 ? ' major' : '');
                    mark.style.left = x + 'px';
                    ruler.appendChild(mark);
                    
                    if (time % 5 === 0) {
                        const label = document.createElement('div');
                        label.className = 'ruler-time';
                        label.style.left = x + 'px';
                        label.textContent = this.formatTime(time);
                        ruler.appendChild(label);
                    }
                }
                
                // Ajustar largura do container
                const tracksContainer = document.getElementById('timelineTracks');
                tracksContainer.style.width = width + 'px';
                
                const grid = document.getElementById('timelineGrid');
                grid.style.width = width + 'px';
                this.renderGrid();
            }

            renderGrid() {
                const grid = document.getElementById('timelineGrid');
                grid.innerHTML = '';
                
                const duration = this.animator.totalAnimationTime;
                const interval = this.getTimeInterval();
                
                for (let time = 0; time <= duration; time += interval) {
                    const x = time * this.pixelsPerSecond * this.zoom;
                    const line = document.createElement('div');
                    line.className = 'grid-line';
                    line.style.left = x + 'px';
                    grid.appendChild(line);
                }
            }

            renderTracks() {
                const container = document.getElementById('timelineTracks');

                // (updateTrackItems roda em setupTimeline, antes dos headers)

                // Skip: se nada visível mudou desde o último render, não reconstruir o DOM
                // (evita churn de listeners e flicker em refresh() sem mudança real)
                const signature = this.zoom + '|' + this.tracks.map(t =>
                    `${t.id}:${t.visible}:${t.expanded ? 1 : 0}:` +
                    t.items.map(i => `${i.id},${i.startTime},${i.duration}`).join(';')
                ).join('||');

                // Além da assinatura textual, comparar a IDENTIDADE dos objetos: import,
                // loadDataFromObject e undo/redo SUBSTITUEM actions/comments por objetos
                // novos — com a mesma assinatura, o DOM antigo continuaria com handlers
                // fechando sobre os objetos antigos (delete via indexOf(item.data) viraria
                // no-op, e texto de comentário poderia ficar desatualizado).
                const itemDatas = [];
                for (const t of this.tracks) {
                    for (const i of t.items) itemDatas.push(i.data);
                }
                const sameRefs = this._lastItemDatas !== undefined &&
                    itemDatas.length === this._lastItemDatas.length &&
                    itemDatas.every((d, idx) => d === this._lastItemDatas[idx]);

                if (signature === this._lastTracksSignature && sameRefs) return;
                this._lastTracksSignature = signature;
                this._lastItemDatas = itemDatas;

                container.innerHTML = '';

                this.tracks.forEach(track => {
                    const trackEl = document.createElement('div');
                    trackEl.className = 'timeline-track';
                    trackEl.dataset.trackId = track.id;

                    // Track oculta: mostra a linha esmaecida, sem itens
                    if (track.visible === false) {
                        trackEl.classList.add('hidden-track');
                        container.appendChild(trackEl);
                        return;
                    }

                    // Detectar items paralelos e organizá-los em layers
                    const layeredItems = this.organizeItemsInLayers(track.items);
                    const hasParallels = layeredItems.some(layer => layer.length > 1);

                    if (hasParallels) {
                        trackEl.classList.add('has-parallels');
                    }

                    // Criar layers para items
                    layeredItems.forEach((layerItems, layerIndex) => {
                        const layerEl = document.createElement('div');
                        layerEl.className = `timeline-layer layer-${layerIndex}`;

                        layerItems.forEach((item, itemIndex) => {
                            const itemEl = this.createTimelineItem(item, track, itemIndex, layerIndex, layerItems.length > 1);
                            layerEl.appendChild(itemEl);
                        });

                        trackEl.appendChild(layerEl);
                    });

                    container.appendChild(trackEl);
                });
            }

            // NOVA FUNÇÃO: Organizar items em layers baseado em sobreposições
            organizeItemsInLayers(items) {
                const layers = [];
                const sortedItems = [...items].sort((a, b) => a.startTime - b.startTime);
                
                sortedItems.forEach(item => {
                    let placed = false;
                    
                    // Tentar colocar o item em uma layer existente
                    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
                        const layer = layers[layerIndex];
                        const hasOverlap = layer.some(layerItem => this.itemsOverlap(item, layerItem));
                        
                        if (!hasOverlap) {
                            layer.push(item);
                            placed = true;
                            break;
                        }
                    }
                    
                    // Se não coube em nenhuma layer, criar nova
                    if (!placed) {
                        layers.push([item]);
                    }
                });
                
                return layers;
            }

            // NOVA FUNÇÃO: Verificar se dois items se sobrepõem
            itemsOverlap(item1, item2) {
                const end1 = item1.startTime + item1.duration;
                const end2 = item2.startTime + item2.duration;
                return !(item1.startTime >= end2 || item2.startTime >= end1);
            }

            // NOVA FUNÇÃO: Ciclar entre items sobrepostos
            cycleOverlappingItems(timePosition, trackId) {
                const track = this.tracks.find(t => t.id === trackId);
                if (!track) return;
                
                // Encontrar todos os items que se sobrepõem nesta posição
                const overlappingItems = track.items.filter(item => {
                    const itemEnd = item.startTime + item.duration;
                    return timePosition >= item.startTime && timePosition < itemEnd;
                });
                
                if (overlappingItems.length <= 1) return;
                
                // Encontrar item atualmente selecionado
                let currentIndex = overlappingItems.findIndex(item => {
                    const el = document.querySelector(`[data-item-id="${item.id}"]`);
                    return el && el.classList.contains('selected');
                });
                
                // Ir para o próximo item no ciclo
                currentIndex = (currentIndex + 1) % overlappingItems.length;
                const nextItem = overlappingItems[currentIndex];
                
                // Limpar seleções anteriores
                document.querySelectorAll('.timeline-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Selecionar novo item
                const nextEl = document.querySelector(`[data-item-id="${nextItem.id}"]`);
                if (nextEl) {
                    nextEl.classList.add('selected', 'cycle-highlight');
                    
                    // Remover highlight após animação
                    setTimeout(() => {
                        nextEl.classList.remove('cycle-highlight');
                    }, 500);
                    
                    // Mostrar tooltip informativo
                    this.animator.showTooltip(`Item ${currentIndex + 1}/${overlappingItems.length} selecionado`);
                }
            }

            // Track de um tipo está visível? (usado pelo motor de render do FlowAnimator)
            isTypeVisible(type) {
                const track = this.tracks.find(t => t.type === type);
                return !track || track.visible !== false;
            }

            updateTrackItems() {
                // Limpar items
                this.tracks.forEach(track => track.items = []);
                this._itemById = new Map(); // id → wrapper (com .data por referência)
                
                // NOVO SISTEMA: Processar ações com tempo absoluto (não mais sequencial)
                this.animator.actions.forEach((action, index) => {
                    const duration = action.duration || 2;
                    const startTime = action.startTime !== undefined ? action.startTime : 0; // Tempo absoluto
                    
                    const item = {
                        id: 'action_' + index,
                        type: action.type,
                        startTime: startTime,
                        duration: duration,
                        data: action,
                        index: index
                    };
                    
                    // Encontrar track apropriada (permite múltiplas tracks do mesmo tipo)
                    let targetTrack = this.tracks.find(t => t.type === action.type);
                    if (!targetTrack) {
                        // Se não existe track do tipo, criar uma nova
                        targetTrack = this.createTrackForType(action.type);
                        this.tracks.push(targetTrack);
                    }
                    
                    targetTrack.items.push(item);
                    this._itemById.set(item.id, item);
                });

                // Processar comentários (já suportam tempo absoluto)
                this.animator.comments.forEach((comment, index) => {
                    const item = {
                        id: 'comment_' + index,
                        type: 'comment',
                        startTime: comment.time || 0,
                        duration: comment.duration || 3,
                        data: comment,
                        index: index
                    };

                    let commentTrack = this.tracks.find(t => t.type === 'comment');
                    if (commentTrack) {
                        commentTrack.items.push(item);
                        this._itemById.set(item.id, item);
                    }
                });
                
                // Organizar items por tempo em cada track
                this.tracks.forEach(track => {
                    track.items.sort((a, b) => a.startTime - b.startTime);
                });
            }

            createTrackForType(type) {
                const trackConfigs = {
                    'draw': { name: 'Desenhos', color: '#4a90e2' },
                    'erase': { name: 'Apagar', color: '#e74c3c' },
                    'comment': { name: 'Comentários', color: '#f39c12' }
                };
                
                const config = trackConfigs[type] || { name: 'Track', color: '#888' };
                const existingCount = this.tracks.filter(t => t.type === type).length;

                // Contador sequencial em vez de Date.now(): duas tracks criadas no
                // mesmo milissegundo colidiriam de ID
                TimelinePro._trackSeq = (TimelinePro._trackSeq || 0) + 1;
                return {
                    id: type + '_track_' + TimelinePro._trackSeq,
                    name: config.name + (existingCount > 0 ? ` ${existingCount + 1}` : ''),
                    type: type,
                    items: [],
                    color: config.color,
                    locked: false,
                    visible: true
                };
            }

            createTimelineItem(item, track, index) {
                const el = document.createElement('div');
                el.className = 'timeline-item ' + item.type;
                el.dataset.itemId = item.id;
                el.dataset.trackId = track.id;
                el.dataset.index = index;
                el.setAttribute('tabindex', '0');
                el.setAttribute('role', 'button');

                const x = item.startTime * this.pixelsPerSecond * this.zoom;
                const width = item.duration * this.pixelsPerSecond * this.zoom;

                el.style.left = x + 'px';
                el.style.width = width + 'px';

                let title = '';
                if (item.type === 'draw') {
                    title = '✏️ Desenho ' + (index + 1);
                } else if (item.type === 'erase') {
                    title = '🧽 Apagar ' + (index + 1);
                } else if (item.type === 'comment') {
                    title = '💬 ' + escapeHtml((item.data.text || '').substring(0, 20)) + '...';
                }
                el.setAttribute('aria-label', title + ' — ' + item.duration.toFixed(1) + 's');

                el.innerHTML = `
                    <div class="timeline-item-content">
                        <div class="timeline-item-title">${title}</div>
                        <div class="timeline-item-duration">${item.duration.toFixed(1)}s</div>
                    </div>
                    <div class="timeline-item-resize left"></div>
                    <div class="timeline-item-resize right"></div>
                    <div class="timeline-item-delete" title="Deletar item" aria-label="Deletar item">×</div>
                `;

                // Acessibilidade: Delete/Backspace remove (com confirmação); setas ←/→
                // deslocam o item em ±0,1s (Shift = ±1s) mantendo o foco nele
                el.addEventListener('keydown', (e) => {
                    if (e.target.closest('input, textarea')) return;
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        this.deleteTimelineItem(item);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        this.nudgeItem(item, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1.0 : 0.1));
                    }
                });
                
                // ── Triple-click para deletar (sem confirm) ──────────────────
                let _clickCount = 0;
                let _clickTimer = null;
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.timeline-item-delete, .timeline-item-resize, .timeline-layer-controls')) return;
                    _clickCount++;
                    if (_clickCount === 1) {
                        // Primeiro clique: iniciar janela de 450ms
                        _clickTimer = setTimeout(() => { _clickCount = 0; }, 450);
                    } else if (_clickCount === 2) {
                        // Segundo clique: feedback visual sutil
                        el.style.outline = '2px solid #f39c12';
                        el.style.outlineOffset = '2px';
                    } else if (_clickCount >= 3) {
                        // Terceiro clique: animar e deletar
                        clearTimeout(_clickTimer);
                        _clickCount = 0;
                        el.style.outline = '';
                        el.classList.add('triple-warn');
                        setTimeout(() => {
                            this.deleteTimelineItem(item, true); // true = sem confirm
                        }, 360);
                    }
                });
                // Limpar outline se o mouse sair sem completar triple-click
                el.addEventListener('mouseleave', () => {
                    if (_clickCount > 0 && _clickCount < 3) {
                        el.style.outline = '';
                    }
                });
                // ─────────────────────────────────────────────────────────────

                // Event listener para o botão de deletar
                const deleteBtn = el.querySelector('.timeline-item-delete');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteTimelineItem(item);
                });
                
                return el;
            }

            // Deletar item da timeline (por referência — imune a índices obsoletos
            // caso outra deleção tenha acontecido entre o render e este clique)
            async deleteTimelineItem(item, skipConfirm = false) {
                // Track travada (🔒) bloqueia deleção por qualquer via: botão ×, tecla
                // Delete e triple-click
                const track = this.tracks.find(t => t.type === item.type);
                if (track && track.locked) {
                    this.animator.showTooltip('🔒 Track travada — destrave para deletar.');
                    return;
                }

                if (!skipConfirm && !(await showConfirm('Deletar este item da timeline?'))) return;

                if (item.type === 'comment') {
                    const index = this.animator.comments.indexOf(item.data);
                    if (index !== -1) {
                        this.animator.saveUndoState();
                        this.animator.comments.splice(index, 1);
                        this.animator.showTooltip('💬 Comentário deletado!');
                    }
                } else {
                    const index = this.animator.actions.indexOf(item.data);
                    if (index !== -1) {
                        this.animator.saveUndoState();
                        this.animator.actions.splice(index, 1);
                        this.animator.showTooltip('🎨 Ação deletada! (Ctrl+Z para desfazer)');
                    }
                }

                this.animator.rebuildDrawingCanvas();
                this.animator.redrawMainCanvas();
                this.animator.updateInfo();
                this.setupTimeline();
            }

            // Desloca um item no tempo via teclado (setas). Snapshot de undo só na
            // primeira batida de uma sequência (evita inundar a pilha ao segurar a tecla).
            nudgeItem(item, deltaSeconds) {
                const track = this.tracks.find(t => t.type === item.type);
                if (track && track.locked) {
                    this.animator.showTooltip('🔒 Track travada — destrave para mover.');
                    return;
                }

                const now = Date.now();
                if (!this._lastNudgeAt || now - this._lastNudgeAt > 800) {
                    this.animator.saveUndoState();
                }
                this._lastNudgeAt = now;

                if (item.type === 'comment') {
                    item.data.time = Math.max(0, (item.data.time || 0) + deltaSeconds);
                } else {
                    item.data.startTime = Math.max(0, (item.data.startTime || 0) + deltaSeconds);
                }

                this.animator.invalidateRenderCaches();
                this.animator.rebuildDrawingCanvas();
                this.animator.redrawMainCanvas();
                this.animator.updateInfo();
                this.setupTimeline();

                // Recupera o foco no mesmo item após o re-render (IDs por índice são
                // estáveis num nudge — nada é adicionado/removido)
                const el = document.querySelector(`[data-item-id="${item.id}"]`);
                if (el) el.focus();

                const t = item.type === 'comment' ? item.data.time : item.data.startTime;
                this.animator.showTooltip(`⏰ ${t.toFixed(1)}s`);
            }

            updatePlayhead() {
                const playhead = document.getElementById('playhead');
                const scrollable = document.getElementById('timelineScrollable');
                const x = this.animator.animationProgress * this.animator.totalAnimationTime * this.pixelsPerSecond * this.zoom;

                // Auto-scroll — suprimido por alguns segundos após o usuário rolar
                // manualmente, para não brigar com ele durante o playback
                const userScrolling = this._userScrollUntil && Date.now() < this._userScrollUntil;
                if (!userScrolling) {
                    const viewWidth = scrollable.clientWidth;
                    if (x > scrollable.scrollLeft + viewWidth - 100) {
                        scrollable.scrollLeft = x - 100;
                    } else if (x < scrollable.scrollLeft) {
                        scrollable.scrollLeft = Math.max(0, x - 50);
                    }
                }

                // O playhead vive dentro da régua (que não rola) — compensar o scroll
                // das tracks para os dois ficarem sempre alinhados
                playhead.style.left = (x - scrollable.scrollLeft) + 'px';
            }

            // Mantém as marcas da régua alinhadas com o scroll horizontal das tracks
            syncRulerScroll() {
                const scrollable = document.getElementById('timelineScrollable');
                const marks = document.getElementById('rulerMarks');
                marks.style.transform = `translateX(${-scrollable.scrollLeft}px)`;
                // Reposicionar o playhead com o novo offset
                const playhead = document.getElementById('playhead');
                const x = this.animator.animationProgress * this.animator.totalAnimationTime * this.pixelsPerSecond * this.zoom;
                playhead.style.left = (x - scrollable.scrollLeft) + 'px';
            }

            formatTime(seconds) {
                // Delegado para o formatador único do app (MM:SS com zero à esquerda)
                return this.animator.formatTime(seconds);
            }

            getTimeInterval() {
                if (this.zoom < 0.5) return 5;
                if (this.zoom < 1) return 2;
                if (this.zoom < 2) return 1;
                return 0.5;
            }

            zoomIn() {
                this.zoom = Math.min(5, this.zoom * 1.2);
                this.updateZoom();
            }

            zoomOut() {
                this.zoom = Math.max(0.2, this.zoom / 1.2);
                this.updateZoom();
            }

            fitToContent() {
                const scrollable = document.getElementById('timelineScrollable');
                const viewWidth = scrollable.clientWidth;
                const contentDuration = this.animator.totalAnimationTime;
                this.zoom = viewWidth / (contentDuration * this.pixelsPerSecond);
                this.updateZoom();
            }

            updateZoom() {
                document.getElementById('timelineZoom').textContent = Math.round(this.zoom * 100) + '%';
                this.renderRuler();
                this.renderTracks();
                this.updatePlayhead();
            }

            bindEvents() {
                const self = this;
                
                // Timeline controls
                document.getElementById('timelinePlayBtn').addEventListener('click', () => this.animator.play());
                document.getElementById('timelinePauseBtn').addEventListener('click', () => this.animator.pause());
                document.getElementById('timelineResetBtn').addEventListener('click', () => this.animator.reset());
                
                // Zoom controls
                document.getElementById('zoomInTimelineBtn').addEventListener('click', () => this.zoomIn());
                document.getElementById('zoomOutTimelineBtn').addEventListener('click', () => this.zoomOut());
                document.getElementById('fitTimelineBtn').addEventListener('click', () => this.fitToContent());
                
                // Track controls
                document.getElementById('trackHeaders').addEventListener('click', (e) => {
                    const btn = e.target.closest('.track-btn, .track-expand-btn');
                    if (!btn) return;
                    
                    const trackId = btn.dataset.track;
                    const action = btn.dataset.action;
                    const track = this.tracks.find(t => t.id === trackId);
                    
                    if (action === 'visibility') {
                        track.visible = !track.visible;
                        btn.classList.toggle('active');
                        // Ocultar de verdade: some da timeline, do canvas e da animação
                        this.animator.invalidateRenderCaches();
                        this.animator.rebuildDrawingCanvas();
                        this.animator.redrawMainCanvas();
                        this.renderTracks();
                        this.animator.showTooltip(track.visible ? `👁️ Track "${track.name}" visível` : `Track "${track.name}" oculta`);
                    } else if (action === 'lock') {
                        track.locked = !track.locked;
                        btn.classList.toggle('active');
                    } else if (action === 'expand') {
                        track.expanded = !track.expanded;
                        btn.classList.toggle('expanded');
                        btn.textContent = track.expanded ? '▼' : '▶';
                        
                        // Atualizar visual da track
                        const trackEl = document.querySelector(`[data-track-id="${trackId}"]`);
                        if (trackEl) {
                            trackEl.classList.toggle('expanded', track.expanded);
                        }
                        
                        this.animator.showTooltip(track.expanded ? 'Track expandida' : 'Track recolhida');
                    }
                    
                    this.renderTrackHeaders();
                });
                
                // Ruler click (compensando o scroll horizontal das tracks)
                document.getElementById('timelineRuler').addEventListener('click', (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const scrollable = document.getElementById('timelineScrollable');
                    const x = e.clientX - rect.left + scrollable.scrollLeft;
                    const time = x / (this.pixelsPerSecond * this.zoom);
                    const progress = time / this.animator.totalAnimationTime;

                    this.animator.animationProgress = Math.max(0, Math.min(1, progress));
                    this.animator.renderAnimationFrame();
                    this.updatePlayhead();
                    this.animator.updateTimeDisplay();
                });

                // Sincronizar régua/playhead com o scroll horizontal das tracks;
                // rolagem manual (wheel) suprime o auto-scroll do playhead por 2s
                const scrollableEl = document.getElementById('timelineScrollable');
                scrollableEl.addEventListener('scroll', () => this.syncRulerScroll());
                scrollableEl.addEventListener('wheel', () => {
                    this._userScrollUntil = Date.now() + 2000;
                }, { passive: true });
                
                // Timeline item interactions - CORRIGIDO para permitir arrasto
                const timelineTracks = document.getElementById('timelineTracks');
                
                timelineTracks.addEventListener('mousedown', (e) => {
                    const item = e.target.closest('.timeline-item');
                    if (!item) return;
                    
                    const track = this.tracks.find(t => t.id === item.dataset.trackId);
                    if (track && track.locked) return;
                    
                    const isResize = e.target.classList.contains('timeline-item-resize');
                    const isDelete = e.target.classList.contains('timeline-item-delete');
                    const isOverlapIndicator = e.target.classList.contains('timeline-item-overlap-indicator');
                    const isLayerControl = e.target.classList.contains('layer-control-btn');
                    
                    // Ignorar cliques em controles especiais
                    if (isDelete || isOverlapIndicator || isLayerControl) return;
                    
                    // Prevenir seleção de texto
                    e.preventDefault();
                    
                    if (isResize) {
                        this.startResize(e, item);
                    } else {
                        this.startDrag(e, item);
                    }
                });
                
                // Clique duplo para focar em item sobreposto
                timelineTracks.addEventListener('dblclick', (e) => {
                    const item = e.target.closest('.timeline-item');
                    if (!item) return;
                    
                    const itemData = this.getItemData(item.dataset.itemId);
                    if (itemData) {
                        this.focusOnItem(itemData);
                    }
                });
                
                document.addEventListener('mousemove', (e) => {
                    if (this.isDragging) {
                        this.handleDrag(e);
                    } else if (this.isResizing) {
                        this.handleResize(e);
                    }
                });
                
                document.addEventListener('mouseup', () => {
                    if (this.isDragging || this.isResizing) {
                        this.endDragResize();
                    }
                });
                
                // Clear timeline
                document.getElementById('clearTimelineBtn').addEventListener('click', async () => {
                    if (await showConfirm('Limpar toda a timeline?')) {
                        await this.animator.clear();
                        this.setupTimeline();
                    }
                });
            }

            startDrag(e, item) {
                this.animator.saveUndoState(); // mover item é desfazível
                this.isDragging = true;
                this.draggedItem = item;
                this.dragStartX = e.clientX;
                this.dragStartLeft = parseInt(item.style.left);

                item.classList.add('selected');
                document.body.style.cursor = 'grabbing';

                // Feedback visual imediato
                item.style.opacity = '0.8';
            }

            // Snap do tempo de início a múltiplos de 0,5s e a bordas de itens vizinhos
            // da mesma track (Shift desativa). Retorna o tempo ajustado.
            _snapTime(rawTime, itemDuration, trackId, excludeItemId) {
                const threshold = 10 / (this.pixelsPerSecond * this.zoom); // ~10px em segundos
                const candidates = [];

                // Grade de 0,5s — para a borda inicial e para a final
                candidates.push(Math.round(rawTime * 2) / 2);
                candidates.push(Math.round((rawTime + itemDuration) * 2) / 2 - itemDuration);

                // Bordas dos vizinhos na mesma track
                const track = this.tracks.find(t => t.id === trackId);
                if (track) {
                    for (const other of track.items) {
                        if (other.id === excludeItemId) continue;
                        const edges = [other.startTime, other.startTime + other.duration];
                        for (const edge of edges) {
                            candidates.push(edge);                 // início alinhado à borda
                            candidates.push(edge - itemDuration);  // fim alinhado à borda
                        }
                    }
                }

                let best = rawTime;
                let bestDist = threshold;
                for (const c of candidates) {
                    const dist = Math.abs(c - rawTime);
                    if (c >= 0 && dist < bestDist) {
                        best = c;
                        bestDist = dist;
                    }
                }
                return best;
            }

            handleDrag(e) {
                if (!this.draggedItem) return;

                const pxPerSec = this.pixelsPerSecond * this.zoom;
                const deltaX = e.clientX - this.dragStartX;
                const rawLeft = Math.max(0, this.dragStartLeft + deltaX);
                let newTime = rawLeft / pxPerSec;

                // Snap (Shift desativa)
                if (!e.shiftKey) {
                    const itemDuration = parseInt(this.draggedItem.style.width) / pxPerSec;
                    newTime = this._snapTime(newTime, itemDuration, this.draggedItem.dataset.trackId, this.draggedItem.dataset.itemId);
                }

                this.draggedItem.style.left = (newTime * pxPerSec) + 'px';

                // Mostrar preview do tempo com melhor feedback
                const timeStr = this.formatTime(newTime);
                this.animator.showTooltip(`⏰ Movendo para: ${timeStr} (${newTime.toFixed(1)}s)`);

                // Visual feedback - destacar item sendo arrastado
                this.draggedItem.style.transform = 'translateY(-3px)';
                this.draggedItem.style.boxShadow = '0 8px 16px rgba(74, 144, 226, 0.4)';
                this.draggedItem.style.zIndex = '1000';
            }

            startResize(e, item) {
                this.animator.saveUndoState(); // redimensionar item é desfazível
                this.isResizing = true;
                this.resizedItem = item;
                this.resizeDirection = e.target.classList.contains('left') ? 'left' : 'right';
                this.dragStartX = e.clientX;
                this.resizeStartWidth = parseInt(item.style.width);
                this.resizeStartLeft = parseInt(item.style.left);

                document.body.style.cursor = 'ew-resize';
            }

            handleResize(e) {
                if (!this.resizedItem) return;
                
                const deltaX = e.clientX - this.dragStartX;
                
                if (this.resizeDirection === 'right') {
                    const newWidth = Math.max(20, this.resizeStartWidth + deltaX);
                    this.resizedItem.style.width = newWidth + 'px';
                    
                    // Update duration
                    const newDuration = newWidth / (this.pixelsPerSecond * this.zoom);
                    this.animator.showTooltip(`Duração: ${newDuration.toFixed(1)}s`);
                } else {
                    const newLeft = Math.max(0, this.resizeStartLeft + deltaX);
                    const deltaLeft = newLeft - this.resizeStartLeft;
                    const newWidth = Math.max(20, this.resizeStartWidth - deltaLeft);
                    
                    this.resizedItem.style.left = newLeft + 'px';
                    this.resizedItem.style.width = newWidth + 'px';
                    
                    // Update time and duration
                    const newTime = newLeft / (this.pixelsPerSecond * this.zoom);
                    const newDuration = newWidth / (this.pixelsPerSecond * this.zoom);
                    this.animator.showTooltip(`Tempo: ${this.formatTime(newTime)} | Duração: ${newDuration.toFixed(1)}s`);
                }
            }

            endDragResize() {
                if (!this.draggedItem && !this.resizedItem) return;

                const item = this.draggedItem || this.resizedItem;
                const itemId = item.dataset.itemId;

                // Calcular novos valores baseado na posição visual
                const newLeft = parseInt(item.style.left);
                const newWidth = parseInt(item.style.width);
                const newTime = newLeft / (this.pixelsPerSecond * this.zoom);
                const newDuration = newWidth / (this.pixelsPerSecond * this.zoom);

                // Clique sem movimento real: descarta o snapshot de undo tirado no início
                const startLeft = this.isDragging ? this.dragStartLeft : this.resizeStartLeft;
                const startWidth = this.isResizing ? this.resizeStartWidth : newWidth;
                if (newLeft === startLeft && newWidth === startWidth) {
                    this.animator._undoStack.pop();
                }

                // Atualiza o dado real por REFERÊNCIA (o wrapper aponta para o próprio
                // objeto em actions/comments) — imune a índices obsoletos
                const wrapper = this._itemById ? this._itemById.get(itemId) : null;
                if (wrapper) {
                    if (wrapper.type === 'comment') {
                        wrapper.data.time = Math.max(0, newTime);
                        wrapper.data.duration = Math.max(0.5, newDuration);
                        this.animator.showTooltip(`💬 Comentário movido para ${newTime.toFixed(1)}s`);
                    } else {
                        wrapper.data.startTime = Math.max(0, newTime);
                        wrapper.data.duration = Math.max(0.5, newDuration);
                        if (this.isDragging) {
                            this.animator.showTooltip(`🎨 Ação movida para ${newTime.toFixed(1)}s`);
                        } else {
                            this.animator.showTooltip(`🎨 Duração alterada para ${newDuration.toFixed(1)}s`);
                        }
                    }
                }
                
                // Reset estados
                this.isDragging = false;
                this.isResizing = false;
                this.draggedItem = null;
                this.resizedItem = null;
                
                document.body.style.cursor = '';
                
                // Limpar efeitos visuais do arrasto
                if (item) {
                    item.style.transform = '';
                    item.style.boxShadow = '';
                    item.style.zIndex = '';
                    item.style.opacity = '';
                }
                
                // Remove selection
                document.querySelectorAll('.timeline-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Atualizar displays e rebuildar timeline
                this.animator.updateInfo();
                this.animator.rebuildDrawingCanvas();
                this.animator.redrawMainCanvas();
                this.setupTimeline(); // Rebuild para refletir novos tempos
            }

            // Obter o wrapper do item pelo ID (com .data apontando para o objeto real)
            getItemData(itemId) {
                return (this._itemById && this._itemById.get(itemId)) || null;
            }

            // NOVA FUNÇÃO: Focar em um item específico
            focusOnItem(itemData) {
                if (!itemData || !itemData.data) return;

                const targetTime = itemData.type === 'comment'
                    ? (itemData.data.time || 0)
                    : (itemData.data.startTime || 0);

                // Posicionar playhead no item
                const progress = targetTime / this.animator.totalAnimationTime;
                this.animator.animationProgress = Math.max(0, Math.min(1, progress));
                this.animator.renderAnimationFrame();
                this.updatePlayhead();
                this.animator.updateTimeDisplay();

                // Destacar o item
                const itemEl = document.querySelector(`[data-item-id="${itemData.id}"]`);
                if (itemEl) {
                    itemEl.classList.add('selected', 'cycle-highlight');
                    setTimeout(() => {
                        itemEl.classList.remove('cycle-highlight');
                    }, 1000);
                }
                
                this.animator.showTooltip(`Focado no item em ${targetTime.toFixed(1)}s`);
            }

            refresh() {
                // Manter estado de expansão das tracks
                const expandedTracks = this.tracks.filter(t => t.expanded).map(t => t.id);
                
                this.setupTimeline();
                
                // Restaurar estado de expansão
                expandedTracks.forEach(trackId => {
                    const track = this.tracks.find(t => t.id === trackId);
                    if (track) {
                        track.expanded = true;
                        const trackEl = document.querySelector(`[data-track-id="${trackId}"]`);
                        if (trackEl) {
                            trackEl.classList.add('expanded');
                        }
                    }
                });
            }
        }
