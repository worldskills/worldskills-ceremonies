(function () {
    'use strict';

    // Shares ControlCtrl's scope (no isolated scope here) so every ng-model/
    // ng-click below binds to the scope the markup uses — see the two
    // invariants above the *Part(scope) calls in js/control.js.
    angular.module('ceremoniesApp').factory('FramesPart', function (FrameService, FrameState, QueueScroll) {
        return function (scope) {

            scope.setActiveFrame = function (id) {
                FrameService.setActiveFrame(id);
            };

            scope.addFrame = function () {
                var nextId = FrameService.nextFreeId();
                if (!nextId) return;
                FrameService.addFrame(nextId);
                if (scope.catalog) {
                    FrameState.assembleFrame(FrameService.frames[nextId], scope.catalog);
                }
                if (scope.catalogSkillList) {
                    scope.rebuildCatalogSkillList();
                }
                FrameService.setActiveFrame(nextId);
            };

            scope.removeFrame = function (id) {
                if (id === 'a') return;
                var frame = FrameService.frames[id];
                if (!frame) return;
                if (frame.status && frame.status !== 'closed') {
                    scope.addNotice('warning', 'Close the live window for "' + (frame.label || id) + '" before removing this frame.', 'remove-live');
                    return;
                }
                if (confirm('Remove frame "' + frame.label + '"?')) {
                    FrameState.clear(id);
                    FrameService.removeFrame(id);
                }
            };

            // Dotted object so ng-model="rename.label" writes here even inside
            // the ng-repeat — a bare scope.editingFrameLabel would bind to the
            // repeat's child scope (prototype-chain shadowing), which caused
            // the rename field to pre-fill stale text.
            scope.rename = { id: null, label: '' };

            scope.startRenameFrame = function (id, currentLabel) {
                scope.rename.id = id;
                scope.rename.label = currentLabel;
            };

            scope.finishRenameFrame = function (id) {
                if (scope.rename.id !== id) return;
                var label = (scope.rename.label || '').trim();
                if (label && FrameService.frames[id]) {
                    FrameService.frames[id].label = label;
                    FrameState.publish(id);
                    scope.projectDirty = true;
                }
                scope.rename.id = null;
                scope.rename.label = '';
            };

            scope.cancelRenameFrame = function () {
                scope.rename.id = null;
                scope.rename.label = '';
            };

            scope.handleRenameKey = function ($event, id) {
                if ($event.key === 'Enter') {
                    scope.finishRenameFrame(id);
                    $event.preventDefault();
                } else if ($event.key === 'Escape') {
                    scope.cancelRenameFrame();
                    $event.preventDefault();
                }
            };

            scope.prevSlideForFrame = function (frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides || !frame.slides.length) return;
                var slide = frame.slide;
                if (!slide) return;
                if (slide.state && slide.state.length > 0) {
                    slide.state.splice(slide.state.length - 1, 1);
                    scope.update(frameId);
                    return;
                }
                var idx = frame.slides.indexOf(slide);
                if (idx > 0) {
                    scope.showSlide(frameId, frame.slides[idx - 1]);
                    QueueScroll.scrollToActiveInFrame(frameId);
                }
            };

            scope.nextSlideForFrame = function (frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides || !frame.slides.length) return;
                var slide = frame.slide;
                if (!slide) return;
                if (slide.states && slide.states.length > 0) {
                    for (var i = 0; i < slide.states.length; i++) {
                        if (!scope.hasState(slide, slide.states[i])) {
                            if (!slide.state) slide.state = [];
                            slide.state.push(slide.states[i]);
                            scope.update(frameId);
                            return;
                        }
                    }
                }
                var idx = frame.slides.indexOf(slide);
                if (idx >= 0 && idx < frame.slides.length - 1) {
                    scope.showSlide(frameId, frame.slides[idx + 1]);
                    QueueScroll.scrollToActiveInFrame(frameId);
                }
            };

            scope.prevSlide = function () {
                var frame = FrameService.getActiveFrame();
                if (!frame || !frame.slides.length) return;
                scope.prevSlideForFrame(FrameService.activeFrameId);
            };

            scope.nextSlide = function () {
                var frame = FrameService.getActiveFrame();
                if (!frame || !frame.slides.length) return;
                scope.nextSlideForFrame(FrameService.activeFrameId);
            };

            scope.jumpToSlide = function (slide) {
                scope.showSlide(FrameService.activeFrameId, slide);
            };

            scope.getSlidePosition = function (frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides.length) return '—';
                var idx = frame.slides.indexOf(frame.slide);
                return (idx < 0 ? 0 : idx + 1) + '/' + frame.slides.length;
            };

            scope.allFramesViewOpen = false;
            scope.gridConfigDialogOpen = false;
            scope.gridConfig = { cols: null, frameWidth: 1280, frameHeight: 720, splitContainers: false, monitor: null };

            scope.openFrameWindow = function (frameId, isPreview) {
                var frame = FrameService.frames[frameId];
                if (!frame) return;
                // Publish first — the opened window reads frame state from
                // localStorage, not a live push.
                FrameState.publish(frameId);
                frame.status = 'connecting';
                if (window.ceremonator && window.ceremonator.frames) {
                    if (scope.gridConfig.splitContainers) {
                        // kv/state windows share the frame's position/size at
                        // open — the operator drags the second one into place.
                        ['kv', 'state'].forEach(function (container) {
                            window.ceremonator.frames.openWindow({
                                frameId: frameId,
                                size: frame.size,
                                position: frame.position,
                                preview: !!isPreview,
                                label: frame.label,
                                container: container
                            });
                        });
                    } else {
                        window.ceremonator.frames.openWindow({
                            frameId: frameId,
                            size: frame.size,
                            position: frame.position,
                            preview: !!isPreview,
                            label: frame.label
                        });
                    }
                } else {
                    var url = 'screen.html?screen=' + frameId + (isPreview ? '&preview=true' : '') + '&label=' + encodeURIComponent(frame.label || frameId);
                    window.open(url, '_blank');
                    frame.status = 'ready';
                }
            };

            scope.openFrameWindowLive = function (frameId) {
                scope.openFrameWindow(frameId, false);
            };

            scope.openFrameWindowPreview = function (frameId) {
                scope.openFrameWindow(frameId, true);
            };

            scope.previewAllFrames = function () {
                var count = FrameService.count();
                if (!confirm('Open preview windows for all ' + count + ' frame(s)?')) return;
                angular.forEach(FrameService.frames, function (frame, id) {
                    scope.openFrameWindow(id, true);
                });
            };

            scope.openAllFramesLive = function () {
                angular.forEach(FrameService.frames, function (frame, id) {
                    scope.openFrameWindow(id, false);
                });
            };

            scope.reloadFrameWindow = function (frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame) return;
                if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reloadScreen) {
                    frame.status = 'connecting';
                    window.ceremonator.app.reloadScreen(frameId);
                }
            };

            scope.closeFrameWindow = function (frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame) return;
                if (frame.status && frame.status !== 'closed') {
                    if (!confirm('Close the live screen "' + (frame.label || frameId) + '"? The audience display for this frame will go blank.')) {
                        return;
                    }
                }
                if (window.ceremonator && window.ceremonator.frames) {
                    window.ceremonator.frames.closeWindow({ frameId: frameId });
                }
                frame.status = 'closed';
            };

            // Ceil(sqrt(n)) keeps a near-square grid without needing a divisor
            // pair — trailing empty cells beat a lopsided N×1 row.
            scope.computeBestCols = function (n) {
                return Math.max(1, Math.ceil(Math.sqrt(n)));
            };

            scope.getFrameCount = function () {
                return FrameService.count();
            };

            scope.getGridCellCount = function () {
                var n = scope.getFrameCount();
                return scope.gridConfig.splitContainers ? n * 2 : n;
            };

            // Manual Columns is honored exactly, even if it splits a kv/state
            // pair across rows. Only Auto computes near-square cols in FRAME
            // units and doubles to CELL units when Split is on, to keep pairs
            // row-aligned.
            function gridLayout(frameColsOverride) {
                var frameCount = scope.getFrameCount();
                var split = scope.gridConfig.splitContainers;
                var cellCount = scope.getGridCellCount();
                var gridCols = frameColsOverride > 0
                    ? frameColsOverride
                    : (split ? scope.computeBestCols(frameCount) * 2 : scope.computeBestCols(frameCount));
                var gridRows = Math.ceil(cellCount / gridCols);
                return { cols: gridCols, rows: gridRows };
            }

            scope.getAutoGridPreview = function () {
                var layout = gridLayout(0);
                return layout.cols + ' × ' + layout.rows;
            };

            scope.getManualGridPreview = function () {
                var colsInput = parseInt(scope.gridConfig.cols, 10);
                if (!colsInput || colsInput < 1) return '';
                var layout = gridLayout(colsInput);
                return layout.cols + ' × ' + layout.rows + ' (' + scope.getGridCellCount() + ' windows)';
            };

            scope.openGridView = function () {
                scope.gridConfigDialogOpen = true;
            };

            scope.confirmOpenGridView = function () {
                scope.gridConfigDialogOpen = false;
                if (!window.ceremonator || !window.ceremonator.frames) return;

                // Publish first — grid iframes read frame state from
                // localStorage, not a live push.
                angular.forEach(FrameService.frames, function (frame, id) {
                    FrameState.publish(id);
                });

                var colsInput = parseInt(scope.gridConfig.cols, 10);
                var layout = gridLayout(colsInput);

                var frameIds = Object.keys(FrameService.frames);
                var cells = [];
                frameIds.forEach(function (id) {
                    var frame = FrameService.frames[id];
                    var label = frame.label || id;
                    var accent = FrameService.getFrameColor(id);
                    if (scope.gridConfig.splitContainers) {
                        cells.push({ frameId: id, container: 'kv', label: label + ' — Key Info', accent: accent });
                        cells.push({ frameId: id, container: 'state', label: label + ' — Results', accent: accent });
                    } else {
                        cells.push({ frameId: id, label: label, accent: accent });
                    }
                });

                var monitor = scope.gridConfig.monitor;
                var monitorOverride = (monitor === null || monitor === undefined || monitor === '') ? null : parseInt(monitor, 10);

                window.ceremonator.frames.openLargeWindow({
                    frames: cells,
                    grid: { cols: layout.cols, rows: layout.rows, gap: 2 },
                    frameSize: {
                        width: parseInt(scope.gridConfig.frameWidth, 10) || 1280,
                        height: parseInt(scope.gridConfig.frameHeight, 10) || 720
                    },
                    position: monitorOverride != null ? { monitor: monitorOverride } : null
                });
            };
        };
    });

})();
