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
            checkParallelActions(track) {
                if (track.items.length < 2) return false;
                const events = [];
                for (const item of track.items) {
                    events.push(item.startTime);
                    events.push(item.startTime + item.duration);
                }
                events.sort((a, b) => a - b);
                let active = 0;
                for (const item of track.items.slice().sort((a, b) => a.startTime - b.startTime)) {
                    active++;
                    if (active > 1) return true;
                    // decrementar ao final — abordagem simplificada por sweep de início/fim
                }
                // Usar abordagem correta de sweep
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
                
                // Ordenar por tempo
                timePoints.sort((a, b) => a.time - b.time);
                
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
                container.innerHTML = '';
                
                // Atualizar items dos tracks baseado nas ações
                this.updateTrackItems();
                
                this.tracks.forEach(track => {
                    const trackEl = document.createElement('div');
                    trackEl.className = 'timeline-track';
                    trackEl.dataset.trackId = track.id;
                    
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

            // moveItemLayer: reservado para futura implementação de reordenação visual
            moveItemLayer(item, direction) {
                // Reordenação por layer ainda não implementada
            }

            updateTrackItems() {
                // Limpar items
                this.tracks.forEach(track => track.items = []);
                
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
                
                return {
                    id: type + '_track_' + Date.now(),
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

                // Acessibilidade: Delete/Backspace no item focado remove com confirmação (igual ao botão de deletar)
                el.addEventListener('keydown', (e) => {
                    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('input, textarea')) {
                        e.preventDefault();
                        this.deleteTimelineItem(item);
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

            // Deletar item da timeline
            async deleteTimelineItem(item, skipConfirm = false) {
                if (!skipConfirm && !(await showConfirm('Deletar este item da timeline?'))) return;
                
                this.animator.saveUndoState();

                if (item.id.startsWith('comment_')) {
                    const index = parseInt(item.id.split('_')[1]);
                    if (this.animator.comments[index] !== undefined) {
                        this.animator.comments.splice(index, 1);
                        this.animator.showTooltip('💬 Comentário deletado!');
                    }
                } else if (item.id.startsWith('action_')) {
                    const index = parseInt(item.id.split('_')[1]);
                    if (this.animator.actions[index] !== undefined) {
                        this.animator.actions.splice(index, 1);
                        this.animator.showTooltip('🎨 Ação deletada! (Ctrl+Z para desfazer)');
                    }
                }
                
                this.animator.rebuildDrawingCanvas();
                this.animator.redrawMainCanvas();
                this.animator.updateInfo();
                this.setupTimeline();
            }

            updatePlayhead() {
                const playhead = document.getElementById('playhead');
                const x = this.animator.animationProgress * this.animator.totalAnimationTime * this.pixelsPerSecond * this.zoom;
                playhead.style.left = x + 'px';
                
                // Auto-scroll
                const scrollable = document.getElementById('timelineScrollable');
                const viewWidth = scrollable.clientWidth;
                if (x > scrollable.scrollLeft + viewWidth - 100) {
                    scrollable.scrollLeft = x - 100;
                } else if (x < scrollable.scrollLeft) {
                    scrollable.scrollLeft = Math.max(0, x - 50);
                }
            }

            formatTime(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                
                // Ruler click
                document.getElementById('timelineRuler').addEventListener('click', (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const time = x / (this.pixelsPerSecond * this.zoom);
                    const progress = time / this.animator.totalAnimationTime;
                    
                    this.animator.animationProgress = Math.max(0, Math.min(1, progress));
                    this.animator.renderAnimationFrame();
                    this.updatePlayhead();
                    this.animator.updateTimeDisplay();
                });
                
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
                
                // Add track
                document.getElementById('addTrackBtn').addEventListener('click', () => {
                    const newTrack = {
                        id: 'track_' + Date.now(),
                        name: 'Nova Track ' + (this.tracks.length + 1),
                        type: 'custom',
                        items: [],
                        color: '#888',
                        locked: false,
                        visible: true
                    };
                    this.tracks.push(newTrack);
                    this.setupTimeline();
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
                this.isDragging = true;
                this.draggedItem = item;
                this.dragStartX = e.clientX;
                this.dragStartLeft = parseInt(item.style.left);
                
                item.classList.add('selected');
                document.body.style.cursor = 'grabbing';
                
                // Feedback visual imediato
                item.style.opacity = '0.8';
            }

            handleDrag(e) {
                if (!this.draggedItem) return;
                
                const deltaX = e.clientX - this.dragStartX;
                const newLeft = Math.max(0, this.dragStartLeft + deltaX);
                this.draggedItem.style.left = newLeft + 'px';
                
                // Update time
                const newTime = newLeft / (this.pixelsPerSecond * this.zoom);
                
                // Mostrar preview do tempo com melhor feedback
                const timeStr = this.formatTime(newTime);
                this.animator.showTooltip(`⏰ Movendo para: ${timeStr} (${newTime.toFixed(1)}s)`);
                
                // Visual feedback - destacar item sendo arrastado
                this.draggedItem.style.transform = 'translateY(-3px)';
                this.draggedItem.style.boxShadow = '0 8px 16px rgba(74, 144, 226, 0.4)';
                this.draggedItem.style.zIndex = '1000';
            }

            startResize(e, item) {
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
                
                // Update the actual data - CORRIGIDO
                if (itemId.startsWith('comment_')) {
                    const index = parseInt(itemId.split('_')[1]);
                    if (this.animator.comments[index]) {
                        this.animator.comments[index].time = Math.max(0, newTime);
                        this.animator.comments[index].duration = Math.max(0.5, newDuration);
                        this.animator.showTooltip(`💬 Comentário movido para ${newTime.toFixed(1)}s`);
                    }
                } else if (itemId.startsWith('action_')) {
                    const index = parseInt(itemId.split('_')[1]);
                    if (this.animator.actions[index]) {
                        // Atualizar tanto startTime quanto duration
                        this.animator.actions[index].startTime = Math.max(0, newTime);
                        this.animator.actions[index].duration = Math.max(0.5, newDuration);
                        
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

            reorderAction(actionIndex, targetTime) {
                const action = this.animator.actions[actionIndex];
                if (!action) return;
                
                // Remover da posição atual
                this.animator.actions.splice(actionIndex, 1);
                
                // Encontrar nova posição baseada no tempo
                let insertIndex = 0;
                let cumulativeTime = 0;
                
                for (let i = 0; i < this.animator.actions.length; i++) {
                    if (cumulativeTime >= targetTime) {
                        insertIndex = i;
                        break;
                    }
                    cumulativeTime += this.animator.actions[i].duration || 2;
                    insertIndex = i + 1;
                }
                
                // Inserir na nova posição
                this.animator.actions.splice(insertIndex, 0, action);
                
                this.animator.showTooltip('Ação reordenada!');
            }

            // NOVA FUNÇÃO: Obter dados do item
            getItemData(itemId) {
                if (itemId.startsWith('comment_')) {
                    const index = parseInt(itemId.split('_')[1]);
                    return { type: 'comment', index: index, data: this.animator.comments[index] };
                } else if (itemId.startsWith('action_')) {
                    const index = parseInt(itemId.split('_')[1]);
                    return { type: 'action', index: index, data: this.animator.actions[index] };
                }
                return null;
            }

            // NOVA FUNÇÃO: Focar em um item específico
            focusOnItem(itemData) {
                if (!itemData || !itemData.data) return;
                
                let targetTime = 0;
                if (itemData.type === 'comment') {
                    targetTime = itemData.data.time || 0;
                } else if (itemData.type === 'action') {
                    targetTime = itemData.data.startTime || 0;
                }
                
                // Posicionar playhead no item
                const progress = targetTime / this.animator.totalAnimationTime;
                this.animator.animationProgress = Math.max(0, Math.min(1, progress));
                this.animator.renderAnimationFrame();
                this.updatePlayhead();
                this.animator.updateTimeDisplay();
                
                // Destacar o item
                const itemEl = document.querySelector(`[data-item-id="${itemData.type}_${itemData.index}"]`);
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
