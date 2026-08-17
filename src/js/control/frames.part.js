(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FramesPart', function (FrameService, FrameState, QueueScroll, FRAMES_WINDOW_STATUS, FEED, WORKSPACE_MODES) {
      return function ($scope) {
        $scope.FEED = FEED;

        $scope.setActiveFrame = function (id) {
            FrameService.setActiveFrame(id);
        };

        $scope.addFrame = function () {
            var nextId = FrameService.nextFreeId();
            if (!nextId) return;
            FrameService.addFrame(nextId);
            if ($scope.catalog) {
                FrameState.assembleFrame(FrameService.frames[nextId], $scope.catalog);
            }
            if ($scope.catalogSkillList) {
                $scope.rebuildCatalogSkillList();
            }
            FrameService.setActiveFrame(nextId);
            $scope.buildQueueList();
            $scope.projectDirty = true;
            if ($scope.syncRemote) $scope.syncRemote();
        };

        $scope.removeFrame = function (id) {
            if (id === 'a') return;
            var frame = FrameService.frames[id];
            if (!frame) return;

            if (frame.status && frame.status !== FRAMES_WINDOW_STATUS.CLOSED) {
                $scope.addNotice('warning', 'Close the live window for "' + (frame.label || id) + '" before removing this frame.', 'remove-live');
                return;
            }

            if (confirm('Remove frame "' + frame.label + '"?')) {
                FrameState.clear(id);
                FrameService.removeFrame(id);
                $scope.rebuildCatalogSkillList();
                $scope.buildQueueList();
                $scope.projectDirty = true;
                if ($scope.syncRemote) $scope.syncRemote();
            }
        };

        $scope.rename = { id: null, label: '' };

        $scope.startRenameFrame = function (id, currentLabel) {
            $scope.rename.id = id;
            $scope.rename.label = currentLabel;
        };

        $scope.finishRenameFrame = function (id) {
            if ($scope.rename.id !== id) return;
            var label = ($scope.rename.label || '').trim();
            if (label && FrameService.frames[id]) {
                FrameService.frames[id].label = label;
                FrameState.publish(id);
                $scope.projectDirty = true;
            }
            $scope.rename.id = null;
            $scope.rename.label = '';
        };

        $scope.cancelRenameFrame = function () {
            $scope.rename.id = null;
            $scope.rename.label = '';
        };

        $scope.handleRenameKey = function ($event, id) {
            if ($event.key === 'Enter') {
                $scope.finishRenameFrame(id);
                $event.preventDefault();
            } else if ($event.key === 'Escape') {
                $scope.cancelRenameFrame();
                $event.preventDefault();
            }
        };

        $scope.prevSlideForFrame = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides || !frame.slides.length) return;
            var slide = frame.slide;
            if (!slide) return;
            if (slide.state && slide.state.length > 0) {
                slide.state.splice(slide.state.length - 1, 1);
                $scope.update(frameId);
                return;
            }
            var idx = frame.slides.indexOf(slide);
            if (idx > 0) {
                $scope.showSlide(frameId, frame.slides[idx - 1]);
                QueueScroll.scrollToActiveInFrame(frameId);
            }
        };

        $scope.nextSlideForFrame = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides || !frame.slides.length) return;
            var slide = frame.slide;
            if (!slide) return;
            if (slide.states && slide.states.length > 0) {
                for (var i = 0; i < slide.states.length; i++) {
                    if (!$scope.hasState(slide, slide.states[i])) {
                        if (!slide.state) slide.state = [];
                        slide.state.push(slide.states[i]);
                        $scope.update(frameId);
                        return;
                    }
                }
            }
            var idx = frame.slides.indexOf(slide);
            if (idx >= 0 && idx < frame.slides.length - 1) {
                $scope.showSlide(frameId, frame.slides[idx + 1]);
                QueueScroll.scrollToActiveInFrame(frameId);
            }
        };

        $scope.prevSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) return;
            $scope.prevSlideForFrame(FrameService.activeFrameId);
        };

        $scope.nextSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) return;
            $scope.nextSlideForFrame(FrameService.activeFrameId);
        };

        $scope.jumpToSlide = function (slide) {
            $scope.showSlide(FrameService.activeFrameId, slide);
        };

        $scope.getSlidePosition = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides.length) return '—';
            var idx = frame.slides.indexOf(frame.slide);
            return (idx < 0 ? '—' : idx + 1) + '/' + frame.slides.length;
        };

        $scope.resetFrame = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            frame.blanked = true;
            frame.previewSlide = undefined;
            frame.previewState = undefined;
            $scope.update(frameId);
        };

        $scope.allFramesViewOpen = false;
        $scope.gridConfigDialogOpen = false;
        $scope.gridConfig = {
            cols: null,
            frameWidth: 1280,
            frameHeight: 720,
            monitor: null,
            feed: FEED.LIVE
        };

        $scope.openFrameWindow = function (frameId, isPreview) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            FrameState.publish(frameId);
            frame.status = FRAMES_WINDOW_STATUS.CONNECTING;

            if (window.ceremonator && window.ceremonator.frames) {
                window.ceremonator.frames.openWindow({
                    frameId: frameId,
                    size: frame.size,
                    position: frame.position,
                    preview: !!isPreview,
                    label: frame.label
                }).then(function (result) {
                    if (!result || result.ok === false) throw new Error((result && result.error) || 'unknown error');
                }).catch(function (error) {
                    $scope.$apply(function () {
                        frame.status = FRAMES_WINDOW_STATUS.CLOSED;
                        $scope.addNotice('error', 'Could not open output: ' + (error.message || error), 'open-output-' + frameId);
                    });
                });
            } else {
                var url = 'screen.html?screen=' + frameId + (isPreview ? '&preview=true&feed=' + FEED.PREVIEW : '') + '&label=' + encodeURIComponent(frame.label || frameId);
                window.open(url, '_blank');
                frame.status = FRAMES_WINDOW_STATUS.READY;
            }
        };

        $scope.openFrameWindowLive = function (frameId) {
            $scope.openFrameWindow(frameId, false);
        };

        $scope.canOpenFramePreview = function (frameId) {
            var frame = FrameService.frames[frameId];
            return !!frame && !!(frame.windows && frame.windows.live) && !(frame.windows && frame.windows.preview);
        };

        $scope.openFrameWindowPreview = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            if (!frame.windows || !frame.windows.live) {
                $scope.addNotice('warning', 'Open a Live window for "' + (frame.label || frameId) + '" before opening Preview.', 'preview-needs-live');
                return;
            }
            if (frame.windows.preview) {
                $scope.addNotice('warning', 'Preview is already open for "' + (frame.label || frameId) + '" — only one Preview window per frame is allowed.', 'preview-already-open');
                return;
            }
            $scope.openFrameWindow(frameId, true);
        };

        $scope.previewAllFrames = function () {
            var eligible = [];
            var skipped = [];

            angular.forEach(FrameService.frames, function (frame, id) {
                if (!$scope.canOpenFramePreview(id)) { skipped.push(frame.label || id); return; }
                eligible.push(id);
            });

            if (!eligible.length) {
                $scope.addNotice('warning', 'No frames are eligible for Preview — open Live windows first (and close any Preview already open).', 'preview-all-none');
                return;
            }

            if (!confirm('Open preview windows for ' + eligible.length + ' frame(s)?')) return;

            eligible.forEach(function (id) { $scope.openFrameWindow(id, true); });
            if (skipped.length) {
                $scope.addNotice('warning', 'Skipped (no Live window open, or Preview already open): ' + skipped.join(', '), 'preview-all-skipped');
            }
        };

        $scope.openAllFramesLive = function () {
            angular.forEach(FrameService.frames, function (frame, id) {
                if (!frame.windows || !frame.windows.live) $scope.openFrameWindow(id, false);
            });
        };

        $scope.reloadFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;

            if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reloadScreen) {
                frame.status = FRAMES_WINDOW_STATUS.CONNECTING;
                window.ceremonator.app.reloadScreen(frameId);
            }
        };

        $scope.closeFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;

            if (frame.status && frame.status !== FRAMES_WINDOW_STATUS.CLOSED) {
                if (!confirm('Close the live screen "' + (frame.label || frameId) + '"? The audience display for this frame will go blank.')) {
                    return;
                }
            }

            if (window.ceremonator && window.ceremonator.frames) {
                window.ceremonator.frames.closeWindow({ frameId: frameId });
            }

            frame.status = FRAMES_WINDOW_STATUS.CLOSED;
        };

        // Only a default for the project's grid.html — it may hardcode its own --grid-cols, and the
        // row count is no longer knowable here since the template decides how many cells exist.
        function autoCols() {
            return Math.max(1, Math.ceil(Math.sqrt(FrameService.count())));
        }

        $scope.getFrameCount = function () {
            return FrameService.count();
        };

        $scope.getGridCols = function () {
            var colsInput = parseInt($scope.gridConfig.cols, 10);
            return colsInput > 0 ? colsInput : autoCols();
        };

        $scope.openGridView = function () {
            $scope.gridConfigDialogOpen = true;
        };

        $scope.confirmOpenGridView = function () {
            $scope.gridConfigDialogOpen = false;
            if (!window.ceremonator || !window.ceremonator.frames) return;

            angular.forEach(FrameService.frames, function (frame, id) {
                FrameState.publish(id);
            });

            // Which cells exist, and in what arrangement, is the project's template/grid.html —
            // this only supplies the frame roster it can draw from, plus sizing defaults.
            var frames = Object.keys(FrameService.frames).map(function (id) {
                return {
                    frameId: id,
                    label: FrameService.frames[id].label || id,
                    accent: FrameService.getFrameColor(id)
                };
            });

            var monitor = $scope.gridConfig.monitor;
            var monitorOverride = (monitor === null || monitor === undefined || monitor === '') ? null : parseInt(monitor, 10);

            $scope.workspaceMode = WORKSPACE_MODES.RUN;

            window.ceremonator.frames.openLargeWindow({
                frames: frames,
                grid: { cols: $scope.getGridCols(), gap: 2 },
                frameSize: {
                    width: parseInt($scope.gridConfig.frameWidth, 10) || 1280,
                    height: parseInt($scope.gridConfig.frameHeight, 10) || 720
                },
                feed: $scope.gridConfig.feed,
                position: monitorOverride != null ? { monitor: monitorOverride } : null
            });

        };
      };
    });

})();
