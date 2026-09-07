(function () {
    'use strict';

    var app = angular.module('operatorApp', ['ceremoniesControlWorkspace']);

    app.controller('OperatorCtrl', function ($scope, $timeout, $interval, RemoteTransport, SlideRowScope, SlideSnapshot) {
        var LAYOUT_KEY = 'ceremonator:operator:v1';
        var LOST_PENDING = 'Connection lost before confirmation; command outcome unknown. Check the output after reconnecting.';
        var hashPin = new URLSearchParams(location.hash.slice(1)).get('pin') || '';
        var watchdog = null;
        var lastState = 0;
        var pending = {};
        var serial = 0;

        $scope.auth = { pin: '' };
        $scope.status = 'Disconnected';
        $scope.channel = 'live';
        $scope.frames = [];
        $scope.feeds = [];
        $scope.screens = {};
        $scope.feedErrors = {};
        $scope.layout = { width: 80, panels: {} };
        $scope.workspaceCapabilities = { preview: true, copyScript: false, editContext: false };
        $scope.FrameService = {
            // The shared slide-row helpers read the project's feeds through here.
            feedTypes: [],
            getFrameColor: function (id) {
                return ($scope.screens[id] || {}).color;
            }
        };

        $scope.dismissError = function () {
            $scope.error = '';
        };

        $scope.dismissFeedError = function (key) {
            delete $scope.feedErrors[key];
        };

        $scope.saveLayout = function () {
            try {
                localStorage.setItem(LAYOUT_KEY, JSON.stringify(angular.extend({}, $scope.layout, { frameId: $scope.frameId })));
            } catch (error) {
                fail('Layout could not be saved. Browser storage may be unavailable.');
            }
        };

        $scope.resetLayout = function () {
            $scope.layout = { width: 80, panels: {} };
            $scope.saveLayout();
            $scope.$broadcast('layout-reset');
        };

        $scope.selectFrame = function () {
            $scope.frame = selectedFrame();
            if ($scope.frame) {
                $scope.everSelected = true;
            }
            $scope.saveLayout();
        };

        $scope.setChannel = function (channel) {
            $scope.channel = channel;
        };

        $scope.openFullscreen = function () {
            var element = document.documentElement;
            (element.requestFullscreen || element.webkitRequestFullScreen).call(element);
        };

        $scope.showSlide = function (id, slide) {
            slideCommand('show', id, slide);
        };

        $scope.previewSlide = function (event, id, slide) {
            if (event) {
                event.stopPropagation();
            }
            slideCommand('preview', id, slide);
        };

        $scope.toggleState = function (id, slide, state) {
            slideCommand('state', id, slide, state);
        };

        $scope.resetStates = function (id, slide) {
            slideCommand('resetStates', id, slide);
        };

        $scope.updateContext = function (id, slide) {
            if (angular.isDefined(slide.context)) {
                slideCommand('context', id, slide, null, angular.copy(slide.context));
            }
        };

        $scope.command = function (action, feed, index, state, context) {
            if (!$scope.ready) {
                fail('Command was not sent: connection is not ready.');
                return;
            }
            if (!$scope.frame) {
                return;
            }
            if (Object.keys(pending).length >= 32) {
                fail('Command not sent: too many commands are awaiting confirmation.');
                return;
            }

            var command = {
                name: 'operator',
                frameId: $scope.frameId,
                action: action,
                feedType: feed || 'all'
            };
            if (index != null) {
                command.slideIndex = index;
                command.slideId = $scope.frame.slides[index].slideId;
                command.state = state;
            }
            if (action === 'context') {
                command.context = context;
            }

            var id = 'operator-' + (++serial);
            pending[id] = {
                timer: $timeout(function () {
                    settle(id, 'Command timed out; outcome unknown. Check the current output before trying again.');
                }, 10000)
            };

            var payload = JSON.stringify({ type: 'command', id: id, command: command });
            if (new Blob([payload]).size > 64 * 1024) {
                settle(id, 'The edit exceeds the remote command size limit. Apply it in Control.');
                return;
            }
            if (!RemoteTransport.sendRaw(payload)) {
                settle(id, 'Command could not be sent. Check the connection before trying again.');
            }
        };

        $scope.connect = function () {
            $scope.auth.pin = String($scope.auth.pin || '').trim();
            $scope.error = '';
            $scope.connecting = true;
            $scope.ready = false;
            $scope.status = 'Connecting…';
            clearPending('Reconnected before confirmation; command outcome unknown. Check the current output.');
            RemoteTransport.connect($scope.auth.pin, 'operator');
        };

        function fail(message) {
            $scope.error = message;
        }

        function reportDebug(type, message) {
            RemoteTransport.sendRaw({ type: 'debug', debugType: type, message: message });
        }

        function selectedFrame() {
            var selected;
            angular.forEach($scope.frames, function (frame) {
                if (frame.id === $scope.frameId) {
                    selected = frame;
                }
            });
            return selected;
        }

        function restoreLayout() {
            var saved = null;
            try {
                saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
            } catch (error) {
                fail('Saved layout could not be read. Using the default layout.');
            }
            if (saved && saved.panels && typeof saved.panels === 'object') {
                // Panel sizes are re-clamped by operatorPanel's restore().
                $scope.layout = {
                    width: Math.max(25, Math.min(85, Number(saved.width) || 80)),
                    panels: saved.panels
                };
                $scope.frameId = saved.frameId;
            }
        }

        function slideCommand(action, id, slide, state, context) {
            if (!$scope.frame || id !== $scope.frameId) {
                return;
            }
            var index = $scope.frame.slides.indexOf(slide);
            if (index >= 0) {
                $scope.command(action, 'all', index, state, context);
            }
        }

        function reconcileFrames(incoming) {
            var screens = {};
            angular.forEach(incoming, function (frame) {
                frame.slides = SlideSnapshot.mergeSlides(($scope.screens[frame.id] || {}).slides, frame.slides, ($scope.feeds[0] || {}).id);
                frame.slide = frame.slides[frame.slideIndex];
                frame.previewSlide = frame.slides[frame.previewSlideIndex];
                screens[frame.id] = frame;
            });
            $scope.screens = screens;
            $scope.frames = incoming;
        }

        function applySnapshot(snapshot) {
            reconcileFrames(snapshot.frames);
            $scope.feeds = snapshot.feedTypes || [];
            $scope.FrameService.feedTypes = $scope.feeds;
            $scope.testMode = !!snapshot.testMode;
            $scope.frame = selectedFrame();

            if (!$scope.frame && $scope.frames.length) {
                var hadSelection = !!$scope.frameId || $scope.everSelected;
                if (hadSelection) {
                    fail('The selected frame is unavailable. Select a frame to resume.');
                    reportDebug('streaming-display-unavailable', 'The Operator display for frame “' + ($scope.frameId || 'unknown') + '” is no longer available.');
                }
                $scope.frameId = null;
                if (hadSelection) {
                    $scope.everSelected = true;
                } else {
                    $scope.frameId = $scope.frames[0].id;
                    $scope.selectFrame();
                }
            }
            if ($scope.frame) {
                $scope.everSelected = true;
            }

            lastState = Date.now();
            $scope.ready = true;
            $scope.status = 'Connected · synchronized';
        }

        function settle(id, error) {
            if (!pending[id]) {
                return;
            }
            $timeout.cancel(pending[id].timer);
            delete pending[id];
            if (error) {
                fail(error);
            }
        }

        function clearPending(error) {
            var ids = Object.keys(pending);
            angular.forEach(ids, function (id) {
                settle(id);
            });
            if (ids.length && error) {
                fail(error);
            }
        }

        function dropped() {
            $scope.ready = false;
            $scope.connecting = false;
            clearPending(LOST_PENDING);
            $scope.status = 'Disconnected · reconnecting…';
            fail('Connection lost. Controls are disabled while reconnecting.');
        }

        function keydown(event) {
            var tag = (event.target || {}).tagName;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || event.target.isContentEditable) {
                return;
            }

            var key = (event.key || '').toLowerCase();
            var action = null;
            if (event.ctrlKey && key === 'b') {
                action = 'blank';
            } else if (event.ctrlKey && key === 'l') {
                action = 'live';
            } else if (event.key === 'ArrowLeft') {
                action = 'previous';
            } else if (event.key === 'ArrowRight') {
                action = 'next';
            }

            if (!action) {
                return;
            }
            event.preventDefault();
            if (event.repeat) {
                return;
            }
            $scope.$apply(function () {
                $scope.command(action);
            });
        }

        $scope.reportDebug = reportDebug;
        SlideRowScope($scope);
        restoreLayout();
        $scope.frameId = new URLSearchParams(location.search).get('frame') || $scope.frameId;
        $scope.auth.pin = hashPin || RemoteTransport.loadPin();
        history.replaceState(null, '', location.pathname + location.search);

        $scope.$on('remote:authenticated', function (event, message) {
            if (!RemoteTransport.savePin()) {
                fail('Connected, but the PIN could not be saved in this browser.');
            }
            $scope.authenticated = true;
            $scope.connecting = false;
            $scope.token = message.assetToken;
            $scope.languages = message.languages;
            $scope.status = 'Synchronizing…';
            // The cached snapshot the server replays can predate this session; ask for a fresh one.
            RemoteTransport.sendRaw({ type: 'ping' });
        });

        $scope.$on('remote:state', function (event, message) {
            if (message.cached || !message.frames || !Array.isArray(message.frames.frames)) {
                return;
            }
            applySnapshot(message.frames);
        });

        $scope.$on('remote:message', function (event, message) {
            if (message.type === 'command-result') {
                settle(message.id, message.ok ? null : (message.error || 'Command failed.'));
            }
        });

        $scope.$on('remote:invalid-message', function () {
            fail('Invalid response received from the server.');
        });

        $scope.$on('remote:refused', function (event, code) {
            if (code === 4001) {
                RemoteTransport.forgetPin();
            }
            $scope.ready = false;
            $scope.connecting = false;
            $scope.authenticated = false;
            clearPending(LOST_PENDING);
            $scope.status = 'Connection refused';
            if (code === 4008) {
                fail('Too many PIN attempts. Wait one minute before reconnecting.');
            } else {
                fail('Connection refused. Check the PIN and server address.');
            }
        });

        $scope.$on('remote:reconnecting', dropped);
        $scope.$on('remote:connection-failed', dropped);

        // Ready means a snapshot arrived, so a silent link is a stale link — not a slow dial.
        watchdog = $interval(function () {
            if (!$scope.ready) {
                return;
            }
            if (Date.now() - lastState > 15000) {
                $scope.ready = false;
                clearPending(LOST_PENDING);
                fail('No fresh control state for 15 seconds. Reconnecting; check that the control panel is running.');
                RemoteTransport.reconnect();
                return;
            }
            RemoteTransport.sendRaw({ type: 'ping' });
        }, 5000);

        document.addEventListener('keydown', keydown);

        $scope.$on('$destroy', function () {
            document.removeEventListener('keydown', keydown);
            $interval.cancel(watchdog);
            RemoteTransport.close();
            clearPending();
        });

        if ($scope.auth.pin) {
            $scope.connect();
        }
    });

    app.directive('operatorQueue', function ($timeout) {
        return function (scope, element) {
            var queue = element[0];
            var index = -1;
            var timer = null;
            var retries = 0;
            var unwatch;
            var observer;
            var resize;

            function scroll() {
                timer = null;
                var row = queue.querySelector('[data-operator-row="' + index + '"]');
                if (!row || !row.querySelector('.list-group-item') || !queue.clientHeight) {
                    if (index >= 0 && retries++ < 8) {
                        timer = $timeout(scroll, 30, false);
                    }
                    return;
                }

                var top = queue.scrollTop + row.getBoundingClientRect().top - queue.getBoundingClientRect().top - queue.clientTop;
                var bottom = top + row.offsetHeight;
                var target = queue.scrollTop;

                // Keep visible rows still when a reveal or button changes. Move
                // only far enough to bring an off-screen selection into view.
                if (top < target) {
                    target = top - 8;
                } else if (bottom > target + queue.clientHeight) {
                    target = row.offsetHeight > queue.clientHeight ? top : bottom - queue.clientHeight + 8;
                }

                queue.scrollTop = Math.max(0, Math.min(queue.scrollHeight - queue.clientHeight, target));
            }

            function schedule() {
                // Coalesce updates without repeatedly cancelling a pending scroll.
                // The callback always reads the latest index after row layout settles.
                if (timer) {
                    return;
                }
                retries = 0;
                timer = $timeout(scroll, 30, false);
            }

            function rowsChanged(changes) {
                return changes.some(function (change) {
                    if (change.type === 'attributes') {
                        return true;
                    }
                    return Array.prototype.some.call(change.addedNodes, function (node) {
                        return node.nodeType === 1 &&
                            (node.matches('[data-operator-row], .list-group-item') || node.querySelector('[data-operator-row], .list-group-item'));
                    });
                });
            }

            unwatch = scope.$watchGroup([
                'frameId', 'channel', 'frame.slideIndex', 'frame.previewSlideIndex',
                'frame.slide.slideId', 'frame.previewSlide.slideId',
                function () {
                    return angular.toJson(scope.frame && scope.frame.slide && scope.frame.slide.state);
                },
                function () {
                    return angular.toJson(scope.frame && scope.frame.previewState);
                }
            ], function (next, previous) {
                var frame = scope.frame;
                if (!frame) {
                    index = -1;
                    return;
                }

                var liveChanged = next[2] !== previous[2] || next[4] !== previous[4] || next[6] !== previous[6];
                var previewChanged = next[3] !== previous[3] || next[5] !== previous[5] || next[7] !== previous[7];

                if (next[0] !== previous[0] || next[1] !== previous[1] || next === previous) {
                    index = scope.channel === 'preview' && frame.previewSlideIndex >= 0 ? frame.previewSlideIndex : frame.slideIndex;
                } else if (liveChanged) {
                    index = frame.slideIndex;
                } else if (previewChanged) {
                    index = frame.previewSlideIndex >= 0 ? frame.previewSlideIndex : frame.slideIndex;
                }

                schedule();
            });

            // Template insertion and index interpolation can finish after the state watcher.
            observer = new MutationObserver(function (changes) {
                if (rowsChanged(changes)) {
                    schedule();
                }
            });
            observer.observe(queue, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-operator-row']
            });

            resize = new ResizeObserver(schedule);
            resize.observe(queue);

            scope.$on('$destroy', function () {
                unwatch();
                observer.disconnect();
                resize.disconnect();
                if (timer) {
                    $timeout.cancel(timer);
                }
            });
        };
    });

    app.directive('operatorPanel', function () {
        return function (scope, element) {
            var node = element[0];
            var id = scope.feed.id;
            var initialized = false;
            var observer;

            function restore() {
                var size = scope.layout.panels[id] || {};
                node.style.width = Number.isFinite(size.width) ? Math.max(240, Math.min(3000, size.width)) + 'px' : '100%';
                node.style.height = Number.isFinite(size.height) ? Math.max(240, Math.min(2000, size.height)) + 'px' : '360px';
            }

            restore();

            observer = new ResizeObserver(function () {
                // The observer fires once on attach; that first call is the size we just set.
                if (!initialized) {
                    initialized = true;
                    return;
                }
                if (!node.offsetWidth || !node.offsetHeight) {
                    return;
                }
                scope.$evalAsync(function () {
                    scope.layout.panels[id] = { width: node.offsetWidth, height: node.offsetHeight };
                    scope.saveLayout();
                });
            });
            observer.observe(node);

            scope.$on('layout-reset', restore);
            scope.$on('$destroy', function () {
                observer.disconnect();
            });
        };
    });

    app.directive('operatorMonitor', function ($timeout) {
        return function (scope, element) {
            var iframe = document.createElement('iframe');
            var ready = false;
            var timer;
            var observer;

            function scale() {
                var size = scope.feed.gridSize || (scope.frame || {}).size || {};
                var width = Number(size.width) || 1920;
                var height = Number(size.height) || 1080;
                var box = element[0];
                var ratio = Math.min(box.clientWidth / width, box.clientHeight / height);

                iframe.style.width = width + 'px';
                iframe.style.height = height + 'px';
                iframe.style.transform = 'scale(' + ratio + ')';
                iframe.style.left = (box.clientWidth - width * ratio) / 2 + 'px';
                iframe.style.top = (box.clientHeight - height * ratio) / 2 + 'px';
            }

            function publish() {
                scale();
                if (!ready) {
                    return;
                }

                var frame = scope.frame;
                var output = frame && frame.outputs && frame.outputs[scope.feed.id];
                var payload = output && output[scope.channel];
                if (!payload) {
                    payload = { template: 'wstemplate://active/blank.html', context: {}, state: [] };
                }

                // The monitor is a browser page: rewrite the desktop's wstemplate:// URLs
                // onto this session's asset route before handing the payload over.
                payload = JSON.parse(JSON.stringify(payload).replace(/wstemplate:\/\/(active|project)\//g, '/operator-assets/' + scope.token + '/$1/'));
                iframe.contentWindow.postMessage({
                    type: 'operator-feed-state',
                    payload: payload,
                    languages: scope.languages,
                    testMode: scope.testMode
                }, location.origin);
            }

            function message(event) {
                if (event.origin !== location.origin || event.source !== iframe.contentWindow || !event.data) {
                    return;
                }

                if (event.data.type === 'operator-feed-ready') {
                    ready = true;
                    $timeout.cancel(timer);
                    publish();
                    scope.$evalAsync(function () {
                        delete scope.feedErrors[scope.feed.id + ':monitor'];
                    });
                }

                if (event.data.type === 'operator-feed-error' || event.data.type === 'operator-feed-recovered') {
                    scope.$evalAsync(function () {
                        var key = scope.feed.id + ':' + (event.data.category || 'asset');
                        if (event.data.type === 'operator-feed-recovered') {
                            delete scope.feedErrors[key];
                        } else {
                            scope.feedErrors[key] = 'The “' + scope.feed.id + '” Operator feed reported: ' + event.data.error;
                            scope.reportDebug('operator-feed-error', scope.feedErrors[key]);
                        }
                    });
                }
            }

            iframe.title = scope.feed.id + ' feed monitor';
            iframe.tabIndex = -1;
            element[0].appendChild(iframe);

            scope.$watchGroup(['token', 'frameId', 'channel'], function () {
                if (!scope.token || !scope.frameId) {
                    publish();
                    return;
                }

                ready = false;
                $timeout.cancel(timer);
                iframe.src = '/operator-feed.html?screen=' + encodeURIComponent(scope.frameId) +
                    '&preview=true&feed=' + scope.channel +
                    '&feedType=' + scope.feed.id +
                    '&token=' + encodeURIComponent(scope.token);

                timer = $timeout(function () {
                    var error = 'The “' + scope.feed.id + '” Operator monitor did not load. Reconnect or reload Operator.';
                    scope.feedErrors[scope.feed.id + ':monitor'] = error;
                    scope.reportDebug('operator-feed-error', error);
                }, 15000);
            });

            scope.$watch('frame.outputs[feed.id][channel]', publish, true);
            scope.$watch('testMode', publish);
            scope.$watchGroup(['feed.gridSize.width', 'feed.gridSize.height', 'frame.size.width', 'frame.size.height'], scale);

            window.addEventListener('message', message);

            observer = new ResizeObserver(scale);
            observer.observe(element[0]);

            scope.$on('$destroy', function () {
                observer.disconnect();
                window.removeEventListener('message', message);
                $timeout.cancel(timer);
            });
        };
    });

})();
