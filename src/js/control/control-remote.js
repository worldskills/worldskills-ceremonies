(function () {
    'use strict';

    // Whitelisted remote-control actions — each maps a RemoteCtrl-sent action name onto the exact
    // same local scope function the operator UI itself calls (see control.js's `remote:action` wiring).
    angular.module('ceremoniesApp').factory('RemotePart', function ($q, FrameService, FrameState) {
      return function ($scope) {
        function runStreamDeckCommand(command) {
            var ids = command.frameIds || (command.frameId ? [command.frameId] : Object.keys(FrameService.frames));
            if (!ids.length || ids.some(function (id) { return !Object.prototype.hasOwnProperty.call(FrameService.frames, id); })) {
                throw new Error('A selected frame no longer exists. Update this key.');
            }
            if (command.feedType && command.feedType !== 'all' && !FrameService.getFeedType(command.feedType)) {
                throw new Error('This output feed is not enabled in the project.');
            }
            var frame = FrameService.frames[ids[0]];
            if (command.name === 'operator') {
                var action = command.action;
                var selected = (frame.slides || [])[command.slideIndex];
                if (['show', 'preview', 'state', 'resetStates', 'context'].indexOf(action) >= 0 && (!selected || selected.slideId !== command.slideId)) {
                    throw new Error('The queue changed. Select the slide again.');
                }
                if (action === 'blank' || action === 'live') {
                    if (action === 'live' && !frame.slide) throw new Error('Select a Live slide first.');
                    if (!frame.blankedFeeds) frame.blankedFeeds = {};
                    (command.feedType === 'all' ? FrameService.feedTypes : [{ id: command.feedType }]).forEach(function (feed) {
                        if (action === 'blank') $scope.resetFrame(command.frameId, feed.id);
                        else delete frame.blankedFeeds[feed.id];
                    });
                    $scope.update(command.frameId);
                } else if (action === 'show') $scope.showSlide(command.frameId, selected);
                else if (action === 'preview') $scope.previewSlide(null, command.frameId, selected);
                else if (['state', 'resetStates', 'context'].indexOf(action) >= 0) {
                    if (frame.slide !== selected && frame.previewSlide !== selected) throw new Error('Select this slide in Live or Preview first.');
                    if (action === 'state') {
                        if ((selected.states || []).indexOf(command.state) < 0) throw new Error('This state no longer exists.');
                        $scope.toggleState(command.frameId, selected, command.state);
                    } else if (action === 'resetStates') $scope.resetStates(command.frameId, selected);
                    else {
                        selected.context = angular.copy(command.context);
                        $scope.updateContext(command.frameId, selected);
                    }
                } else if (!frame.slide && action === 'next' && frame.slides.length) $scope.showSlide(command.frameId, frame.slides[0]);
                else if (!frame.slide) throw new Error('Select a Live slide first.');
                else $scope[action === 'previous' ? 'prevSlideForFrame' : 'nextSlideForFrame'](command.frameId);
            } else if (command.name === 'continueLive') {
                var slides = frame.slides || [];
                var nextIndex = frame.slide ? slides.indexOf(frame.slide) + 1 : 0;
                if (frame.slide && nextIndex === 0) throw new Error('The current slide is no longer in this frame.');
                if (!slides[nextIndex]) throw new Error('No next slide in this frame.');
                // A continuation takes the next slide, regardless of remaining reveals.
                // showSlide clears both feed blanks and applies the normal preview commit rules.
                $scope.showSlide(ids[0], slides[nextIndex]);
            } else if (command.name === 'navigateFrame') {
                if (!frame.slide) throw new Error('Show a Live slide first.');
                $scope[command.direction === 'previous' ? 'prevSlideForFrame' : 'nextSlideForFrame'](ids[0]);
            } else if (command.name === 'blankFrames') {
                var feeds = command.feedType === 'all' ? FrameService.feedTypes : [{ id: command.feedType }];
                ids.forEach(function (id) {
                    feeds.forEach(function (feed) { $scope.resetFrame(id, feed.id); });
                });
            } else if (command.name === 'openLive') {
                FrameState.publish(ids[0]);
                return window.ceremonator.frames.openWindow({ frameId: ids[0], size: frame.size,
                    position: frame.position, label: frame.label, preview: false,
                    feedType: command.feedType, testMode: $scope.testMode });
            } else if (command.name === 'openGrid') {
                var frames = ids.map(function (id) {
                    FrameState.publish(id);
                    return { frameId: id, label: FrameService.frames[id].label, accent: FrameService.getFrameColor(id) };
                });
                return window.ceremonator.frames.openLargeWindow({ frames: frames,
                    grid: { cols: command.columns, gap: 0 }, frameSize: { width: command.width, height: command.height },
                    feed: command.channel, feedType: command.feedType, fullscreen: command.fullscreen,
                    testMode: $scope.testMode });
            } else {
                throw new Error('Unsupported Stream Deck command.');
            }
            return { ok: true };
        }

        // Frame actions need only the frame id.
        var FRAME_ACTIONS = {
            resetPreview: function (action) { $scope.resetPreview(action.frameId); },
            resetFrame: function (action) { $scope.resetFrame(action.frameId, action.feedType || 'main'); },
            prevSlideForFrame: function (action) { $scope.prevSlideForFrame(action.frameId); },
            nextSlideForFrame: function (action) { $scope.nextSlideForFrame(action.frameId); }
        };

        // Slide actions share one lookup and one stale-slideId guard, applied by runRemoteAction
        // before dispatch — a tablet's slideIndex is only valid against the snapshot it last saw.
        var SLIDE_ACTIONS = {
            showSlide: function (action, slide) { $scope.showSlide(action.frameId, slide); },
            previewSlide: function (action, slide) { $scope.previewSlide(null, action.frameId, slide); },
            toggleState: function (action, slide) { $scope.toggleState(action.frameId, slide, action.state); },
            resetStates: function (action, slide) { $scope.resetStates(action.frameId, slide); },
            updateContext: function (action, slide) {
                slide.context = action.context;
                $scope.updateContext(action.frameId, slide);
            }
        };

        function runRemoteAction(frame, action) {
            if (FRAME_ACTIONS[action.name]) return FRAME_ACTIONS[action.name](action);
            var slide = frame.slides[action.slideIndex];
            if (!slide || (action.slideId && slide.slideId !== action.slideId)) return;
            SLIDE_ACTIONS[action.name](action, slide);
        }

        $scope.remoteConfig = { enabled: true, pin: '173210', port: 17321 };
        $scope.remoteConfigDraft = angular.copy($scope.remoteConfig);
        $scope.remoteConfigDialogOpen = false;
        $scope.remoteConfigSaving = false;
        $scope.remoteConfigError = '';
        $scope.remoteInfo = null;
        if (window.ceremonator && window.ceremonator.remote && window.ceremonator.remote.info) {
            $q.when(window.ceremonator.remote.info()).then(function (info) {
                $scope.remoteInfo = info;
                if (info && info.pin) $scope.remoteConfig.pin = info.pin;
                if (info && info.port) $scope.remoteConfig.port = info.port;
            });
        }

        $scope.openRemoteConfig = function () {
            $scope.remoteConfigDraft = angular.copy($scope.remoteConfig);
            $scope.remoteConfigError = '';
            $scope.remoteConfigDialogOpen = true;
        };

        $scope.openOperator = function () {
            $q.when(window.ceremonator.remote.openOperator(FrameService.activeFrameId)).then(function (result) {
                if (!result || !result.ok) $scope.addNotice('error', (result && result.error) || 'Could not open Operator.');
            }).catch(function (error) { $scope.addNotice('error', error.message || 'Could not open Operator.'); });
        };

        $scope.cancelRemoteConfig = function () {
            if ($scope.remoteConfigSaving) return;
            $scope.remoteConfigDialogOpen = false;
            $scope.remoteConfigError = '';
        };

        $scope.saveRemoteConfig = function () {
            var remoteApi = window.ceremonator && window.ceremonator.remote;
            var pin = String($scope.remoteConfigDraft.pin == null ? '' : $scope.remoteConfigDraft.pin).trim();
            var port = Number($scope.remoteConfigDraft.port);

            $scope.remoteConfigError = '';
            if (!/^\d{6}$/.test(pin)) {
                $scope.remoteConfigError = 'PIN must contain exactly 6 digits.';
                return;
            }
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                $scope.remoteConfigError = 'Port must be between 1 and 65535.';
                return;
            }
            if (!remoteApi || !remoteApi.configure) {
                $scope.remoteConfigError = 'Remote configuration is unavailable.';
                return;
            }

            $scope.remoteConfigSaving = true;
            $q.when(remoteApi.configure({
                enabled: $scope.remoteConfig.enabled !== false,
                pin: pin,
                port: port
            })).then(function (result) {
                $scope.remoteConfigSaving = false;
                if (!result || !result.ok) {
                    $scope.remoteConfigError = (result && result.error) || 'Could not save Remote settings.';
                    return;
                }
                $scope.remoteConfig = angular.copy(result.config);
                $scope.remoteInfo = result.info;
                $scope.remoteConfigDialogOpen = false;
                if ($scope.syncRemote) $scope.syncRemote();
                $scope.addNotice('info', 'Remote settings saved. PIN: ' + result.config.pin + ', port: ' + result.config.port + '.', 'remote-config');
            }).catch(function (error) {
                $scope.remoteConfigSaving = false;
                $scope.remoteConfigError = (error && error.message) || 'Could not save Remote settings.';
            });
        };

        if (window.ceremonator && window.ceremonator.remote && window.ceremonator.remote.onAction) {
            window.ceremonator.remote.onAction(function (action) {
                if (action && action.name === 'operatorHeartbeat') {
                    $scope.$evalAsync(function () { FrameState.syncRemote(); });
                    return;
                }
                if (action && action.name === 'streamDeckCommand') {
                    $scope.$evalAsync(function () {
                        $q.when().then(function () { return runStreamDeckCommand(action.command); }).then(function (result) {
                            window.ceremonator.remote.commandResult(action.requestId, result);
                        }).catch(function (error) {
                            window.ceremonator.remote.commandResult(action.requestId, { ok: false, error: error.message || 'Command failed.' });
                        });
                    });
                    return;
                }
                var frame = action && FrameService.frames[action.frameId];
                if (!frame || !(FRAME_ACTIONS[action.name] || SLIDE_ACTIONS[action.name])) return;
                var apply = function () { runRemoteAction(frame, action); };
                if (!$scope.$$phase) $scope.$apply(apply); else apply();
            });
        }
      };
    });

})();
