(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FramesPart', function (FrameService, FrameState, QueueScroll, SlideStep, FRAMES_WINDOW_STATUS, FEED, WORKSPACE_MODES) {
      return function ($scope) {
        $scope.FEED = FEED;

        $scope.setActiveFrame = function (id) {
            FrameService.setActiveFrame(id);
        };

        $scope.addFrame = function () {
            var nextId = FrameService.nextFreeId();
            if (!nextId) {
                return;
            }
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

            if ($scope.syncRemote) {
                $scope.syncRemote();
            }
        };

        $scope.removeFrame = function (id) {
            if (id === 'a') {
                return;
            }
            var frame = FrameService.frames[id];
            if (!frame) {
                return;
            }

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

                if ($scope.syncRemote) {
                    $scope.syncRemote();
                }
            }
        };

        $scope.rename = {
            id: null,
            label: ''
        };

        $scope.startRenameFrame = function (id, currentLabel) {
            $scope.rename.id = id;
            $scope.rename.label = currentLabel;
        };

        $scope.finishRenameFrame = function (id) {
            if ($scope.rename.id !== id) {
                return;
            }
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
            if (!frame || !frame.slides || !frame.slides.length) {
                return;
            }

            var slide = frame.slide;
            if (!slide) {
                return;
            }
            var revealed = SlideStep.lastState(slide);
            if (revealed) {
                $scope.toggleState(frameId, slide, revealed);
                return;
            }

            var idx = frame.slides.indexOf(slide);
            if (idx > 0) {
                var previous = frame.slides[idx - 1];
                // Stepping backwards onto a slide enters it fully revealed.
                $scope.showSlide(frameId, previous, previous.states || []);
                QueueScroll.scrollToActiveInFrame(frameId);
            }
        };

        $scope.nextSlideForFrame = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides || !frame.slides.length) {
                return;
            }

            var slide = frame.slide;
            if (!slide) {
                return;
            }

            var reveal = SlideStep.nextState(slide);
            if (reveal) {
                $scope.toggleState(frameId, slide, reveal);
                return;
            }

            var idx = frame.slides.indexOf(slide);

            if (idx >= 0 && idx < frame.slides.length - 1) {
                $scope.showSlide(frameId, frame.slides[idx + 1]);
                QueueScroll.scrollToActiveInFrame(frameId);
            }
        };

        $scope.prevSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) {
                return;
            }
            $scope.prevSlideForFrame(FrameService.activeFrameId);
        };

        $scope.nextSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) {
                return;
            }
            $scope.nextSlideForFrame(FrameService.activeFrameId);
        };

        $scope.jumpToSlide = function (slide) {
            $scope.showSlide(FrameService.activeFrameId, slide);
        };

        $scope.getSlidePosition = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides.length) {
                return '—';
            }
            var idx = frame.slides.indexOf(frame.slide);
            return (idx < 0 ? '—' : idx + 1) + '/' + frame.slides.length;
        };

        $scope.resetFrame = function (frameId, feedType) {
            var frame = FrameService.frames[frameId];
            if (!frame) {
                return;
            }

            if (!frame.blankedFeeds) {
                frame.blankedFeeds = {};
            }
            frame.blankedFeeds[feedType || FrameService.primaryFeedId()] = true;

            $scope.update(frameId);
        };

        $scope.allFramesViewOpen = false;
        $scope.gridConfigDialogOpen = false;
        $scope.gridConfig = {
            cols: null,
            frameWidth: 1280,
            frameHeight: 720,
            monitors: {},
            feed: FEED.LIVE,
            feedType: null,
            splitContainers: false,
            fullscreen: false
        };

        $scope.gridFeedChanged = function () {
            var feed = FrameService.getFeedType($scope.gridConfig.feedType || FrameService.primaryFeedId());
            if (!feed) {
                $scope.gridConfig.feedType = FrameService.primaryFeedId();
                feed = FrameService.getFeedType($scope.gridConfig.feedType);
            }
            if (feed && feed.gridSize) {
                $scope.gridConfig.frameWidth = feed.gridSize.width;
                $scope.gridConfig.frameHeight = feed.gridSize.height;
            }
            // Split KV/State only makes sense for the feed carrying the show itself.
            if (!$scope.isPrimaryGridFeed()) {
                $scope.gridConfig.splitContainers = false;
            }
        };
        // Feed naming for the templates: labels and one-letter badges come from the project.
        $scope.feedBadge = function (id) {
            return FrameService.feedBadge(id);
        };

        $scope.isPrimaryGridFeed = function () {
            return ($scope.gridConfig.feedType || FrameService.primaryFeedId()) === FrameService.primaryFeedId();
        };

        $scope.saveGridFeedSize = function () {
            var feed = FrameService.getFeedType($scope.gridConfig.feedType || FrameService.primaryFeedId());
            if (!feed) {
                return;
            }
            feed.gridSize.width = parseInt($scope.gridConfig.frameWidth, 10) || feed.gridSize.width;
            feed.gridSize.height = parseInt($scope.gridConfig.frameHeight, 10) || feed.gridSize.height;
            $scope.projectDirty = true;
        };
        $scope.setGridFeedSize = function (width, height) {
            $scope.gridConfig.frameWidth = width;
            $scope.gridConfig.frameHeight = height;
            $scope.saveGridFeedSize();
        };

        $scope.feedWindowCount = function (frame, feedType, channel) {
            var counts = frame && frame.windows && frame.windows.feeds && frame.windows.feeds[feedType];
            if (counts) {
                return counts[channel] || 0;
            }
            // Old status notifications had only aggregate Main counts.
            return feedType === FrameService.primaryFeedId() && frame && frame.windows ? (frame.windows[channel] || 0) : 0;
        };

        function openFrameWindowContainer(frameId, frame, isPreview, container, feedType) {
            window.ceremonator.frames.openWindow({
                frameId: frameId,
                size: frame.size,
                position: frame.position,
                preview: !!isPreview,
                feedType: feedType || FrameService.primaryFeedId(),
                label: frame.label,
                container: container,
                testMode: $scope.testMode
            }).then(function (result) {
                if (!result || result.ok === false) {
                    throw new Error((result && result.error) || 'unknown error');
                }
            }).catch(function (error) {
                $scope.$apply(function () {
                    frame.status = FRAMES_WINDOW_STATUS.CLOSED;
                    $scope.addNotice('error', 'Could not open output: ' + (error.message || error), 'open-output-' + frameId);
                });
            });
        }

        $scope.openFrameWindow = function (frameId, isPreview, feedType) {
            var frame = FrameService.frames[frameId];
            if (!frame) {
                return;
            }
            FrameState.publish(frameId);
            frame.status = FRAMES_WINDOW_STATUS.CONNECTING;

            if (window.ceremonator && window.ceremonator.frames) {
                if ($scope.gridConfig.splitContainers && !isPreview && (feedType || FrameService.primaryFeedId()) === FrameService.primaryFeedId()) {
                    // kv/state windows share the frame's position/size at open — the operator drags the second one into place.
                    ['kv', 'state'].forEach(function (container) {
                        openFrameWindowContainer(frameId, frame, isPreview, container, feedType);
                    });
                } else {
                    openFrameWindowContainer(frameId, frame, isPreview, undefined, feedType);
                }
            } else {
                var url = 'screen.html?screen=' + frameId + '&feedType=' + (feedType || FrameService.primaryFeedId()) + (isPreview ? '&preview=true&feed=' + FEED.PREVIEW : '') + '&label=' + encodeURIComponent(frame.label || frameId) + ($scope.testMode ? '\&testMode=1' : '');
                window.open(url, '_blank');
                frame.status = FRAMES_WINDOW_STATUS.READY;
            }
        };

        $scope.openFrameWindowLive = function (frameId, feedType) {
            $scope.openFrameWindow(frameId, false, feedType || FrameService.primaryFeedId());
        };

        $scope.canOpenFramePreview = function (frameId, feedType) {
            var frame = FrameService.frames[frameId];
            var counts = frame && frame.windows && frame.windows.feeds && frame.windows.feeds[feedType || FrameService.primaryFeedId()];
            return !!frame && !!(counts ? counts.live : (frame.windows && frame.windows.live)) && !(counts ? counts.preview : (frame.windows && frame.windows.preview));
        };

        $scope.openFrameWindowPreview = function (frameId, feedType) {
            var frame = FrameService.frames[frameId];
            if (!frame) {
                return;
            }
            var counts = frame.windows && frame.windows.feeds && frame.windows.feeds[feedType || FrameService.primaryFeedId()];
            if (!(counts ? counts.live : frame.windows && frame.windows.live)) {
                $scope.addNotice('warning', 'Open a Live window for "' + (frame.label || frameId) + '" before opening Preview.', 'preview-needs-live');
                return;
            }
            if (counts ? counts.preview : frame.windows && frame.windows.preview) {
                $scope.addNotice('warning', 'Preview is already open for "' + (frame.label || frameId) + '" — only one Preview window per frame is allowed.', 'preview-already-open');
                return;
            }
            $scope.openFrameWindow(frameId, true, feedType || FrameService.primaryFeedId());
        };

        $scope.previewAllFrames = function () {
            var eligible = [];
            var skipped = [];

            angular.forEach(FrameService.frames, function (frame, id) {
                if (!$scope.canOpenFramePreview(id)) {
                    skipped.push(frame.label || id);
                    return;
                }
                eligible.push(id);
            });

            if (!eligible.length) {
                $scope.addNotice('warning', 'No frames are eligible for Preview — open Live windows first (and close any Preview already open).', 'preview-all-none');
                return;
            }

            if (!confirm('Open preview windows for ' + eligible.length + ' frame(s)?')) {
                return;
            }

            eligible.forEach(function (id) { $scope.openFrameWindow(id, true); });
            if (skipped.length) {
                $scope.addNotice('warning', 'Skipped (no Live window open, or Preview already open): ' + skipped.join(', '), 'preview-all-skipped');
            }
        };

        $scope.openAllFramesLive = function () {
            angular.forEach(FrameService.frames, function (frame, id) {
                if (!frame.windows || !frame.windows.live) {
                    $scope.openFrameWindow(id, false);
                }
            });
        };

        $scope.reloadFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) {
                return;
            }

            if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reloadScreen) {
                frame.status = FRAMES_WINDOW_STATUS.CONNECTING;
                window.ceremonator.app.reloadScreen(frameId);
            }
        };

        $scope.closeFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) {
                return;
            }

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

        $scope.getFrameCount = function () {
            return FrameService.count();
        };

        $scope.blankedFrames = function () {
            var list = [];
            angular.forEach(FrameService.frames, function (frame) {
                if (frame.blankedFeeds && Object.keys(frame.blankedFeeds).length) {
                    list.push(frame);
                }
            });
            return list;
        };

        $scope.getGridCols = function () {
            var colsInput = parseInt($scope.gridConfig.cols, 10);
            if (colsInput > 0) {
                return colsInput;
            }
            var frameCols = Math.max(1, Math.ceil(Math.sqrt(FrameService.count())));
            return $scope.gridConfig.splitContainers && $scope.isPrimaryGridFeed() ? frameCols * 2 : frameCols;
        };

        $scope.openGridView = function () {
            $scope.gridFeedChanged();
            $scope.gridConfigDialogOpen = true;
        };

        $scope.confirmOpenGridView = function () {
            $scope.gridConfigDialogOpen = false;
            if (!window.ceremonator || !window.ceremonator.frames) {
                return;
            }

            angular.forEach(FrameService.frames, function (frame, id) {
                FrameState.publish(id);
            });

            var frames = [];
            Object.keys(FrameService.frames).forEach(function (id) {
                var label = FrameService.frames[id].label || id;
                var accent = FrameService.getFrameColor(id);
                if ($scope.gridConfig.splitContainers && $scope.isPrimaryGridFeed()) {
                    frames.push({ frameId: id, container: 'kv', label: label + ' — Key Info', accent: accent });
                    frames.push({ frameId: id, container: 'state', label: label + ' — Results', accent: accent });
                } else {
                    frames.push({ frameId: id, label: label, accent: accent });
                }
            });

            var monitor = $scope.gridConfig.monitors[$scope.gridConfig.feedType || FrameService.primaryFeedId()];
            var monitorOverride = (monitor === null || monitor === undefined || monitor === '') ? null : parseInt(monitor, 10);

            $scope.workspaceMode = WORKSPACE_MODES.RUN;
            $scope.saveGridFeedSize();

            window.ceremonator.frames.openLargeWindow({
                frames: frames,
                grid: { cols: $scope.getGridCols(), gap: 0 },
                frameSize: {
                    width: parseInt($scope.gridConfig.frameWidth, 10) || 1280,
                    height: parseInt($scope.gridConfig.frameHeight, 10) || 720
                },
                feed: $scope.gridConfig.feed,
                feedType: $scope.gridConfig.feedType || FrameService.primaryFeedId(),
                position: monitorOverride != null ? { monitor: monitorOverride } : null,
                fullscreen: !!$scope.gridConfig.fullscreen,
                testMode: $scope.testMode
            }).then(function (result) {
                if (!result || result.ok === false) $scope.$applyAsync(function () {
                    $scope.addNotice('warning', (result && result.error) || 'Could not open Grid view.', 'grid-open');
                });
            });

        };
      };
    });

})();
