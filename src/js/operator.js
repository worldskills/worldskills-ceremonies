(function () {
    'use strict';
    var app = angular.module('operatorApp', ['ceremoniesControlWorkspace']);
    app.controller('OperatorCtrl', function ($scope, $timeout, $interval) {
        var socket, retry, watchdog, attempts = 0, lastState = 0, pending = {}, serial = 0;
        var storageKey = 'ceremonator:operator:v1';
        var pinStorageKey = 'ceremonator:remotePin';
        $scope.auth = { pin: new URLSearchParams(location.hash.slice(1)).get('pin') || '' };
        history.replaceState(null, '', location.pathname + location.search);
        $scope.status = 'Disconnected'; $scope.channel = 'live'; $scope.frames = []; $scope.feeds = [];
        $scope.layout = { width: 80, panels: {} };
        $scope.screens = {};
        $scope.feedErrors = {};
        $scope.dismissError = function () { $scope.error = ''; };
        $scope.dismissFeedError = function (key) { delete $scope.feedErrors[key]; };
        $scope.workspaceCapabilities = { preview: true, copyScript: false, editContext: false };
        $scope.FrameService = { getFrameColor: function (id) { return ($scope.screens[id] || {}).color; } };
        function fail(message) { $scope.error = message; }
        function reportDebug(type, message) {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'debug', debugType: type, message: message }));
            }
        }
        $scope.reportDebug = reportDebug;
        try {
            if (!$scope.auth.pin) $scope.auth.pin = localStorage.getItem(pinStorageKey) || '';
        } catch (error) { fail('The saved PIN could not be read. Enter it to connect.'); }
        try {
            var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (saved && saved.panels && typeof saved.panels === 'object') {
                // Panel sizes are re-clamped by operatorPanel's restore().
                $scope.layout = { width: Math.max(25, Math.min(85, Number(saved.width) || 80)), panels: saved.panels };
                $scope.frameId = saved.frameId;
            }
        } catch (error) { fail('Saved layout could not be read. Using the default layout.'); }
        $scope.frameId = new URLSearchParams(location.search).get('frame') || $scope.frameId;
        function selectedFrame() {
            var selected;
            angular.forEach($scope.frames, function (frame) { if (frame.id === $scope.frameId) selected = frame; });
            return selected;
        }
        $scope.saveLayout = function () {
            try { localStorage.setItem(storageKey, JSON.stringify(angular.extend({}, $scope.layout, { frameId: $scope.frameId }))); }
            catch (error) { fail('Layout could not be saved. Browser storage may be unavailable.'); }
        };
        $scope.resetLayout = function () { $scope.layout = { width: 80, panels: {} }; $scope.saveLayout(); $scope.$broadcast('layout-reset'); };
        $scope.selectFrame = function () {
            $scope.frame = selectedFrame();
            if ($scope.frame) $scope.everSelected = true;
            $scope.saveLayout();
        };
        $scope.setChannel = function (channel) { $scope.channel = channel; };
        $scope.openFullscreen = function () {
            (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullScreen).call(document.documentElement);
        };
        $scope.isPreviewingSlide = function (id, slide) { return !!$scope.screens[id] && $scope.screens[id].previewSlide === slide; };
        $scope.canEditSlide = function (id, slide) {
            return !!slide && !!$scope.screens[id] && ($scope.screens[id].slide === slide || $scope.isPreviewingSlide(id, slide));
        };
        $scope.rowHasState = function (id, slide, state) {
            return (($scope.isPreviewingSlide(id, slide) ? $scope.screens[id].previewState : (slide && slide.state)) || []).indexOf(state) >= 0;
        };
        $scope.stateFeedLabel = function (slide, state) { return slide && slide.stateFeedTypes && slide.stateFeedTypes[state] === 'secondary' ? 'S' : 'M'; };
        function slideCommand(action, id, slide, state, context) {
            if (!$scope.frame || id !== $scope.frameId) return;
            var index = $scope.frame.slides.indexOf(slide);
            if (index >= 0) $scope.command(action, 'all', index, state, context);
        }
        $scope.showSlide = function (id, slide) { slideCommand('show', id, slide); };
        $scope.previewSlide = function (event, id, slide) { if (event) event.stopPropagation(); slideCommand('preview', id, slide); };
        $scope.toggleState = function (id, slide, state) { slideCommand('state', id, slide, state); };
        $scope.resetStates = function (id, slide) { slideCommand('resetStates', id, slide); };
        $scope.updateContext = function (id, slide) {
            if (angular.isDefined(slide.context)) slideCommand('context', id, slide, null, angular.copy(slide.context));
        };
        function reconcileFrames(incoming) {
            var screens = {};
            angular.forEach(incoming, function (frame) {
                var existing = {};
                angular.forEach(($scope.screens[frame.id] || {}).slides || [], function (slide) { existing[slide.slideId] = slide; });
                frame.slides = (frame.slides || []).map(function (source) {
                    var slide = existing[source.slideId] || {};
                    var editing = !!slide.edit, draft = slide.context;
                    angular.extend(slide, source);
                    slide.edit = editing;
                    if (editing) slide.context = draft;
                    return slide;
                });
                frame.slide = frame.slides[frame.slideIndex];
                frame.previewSlide = frame.slides[frame.previewSlideIndex];
                screens[frame.id] = frame;
            });
            $scope.screens = screens;
            $scope.frames = incoming;
        }
        function settle(id, error) {
            if (!pending[id]) return;
            $timeout.cancel(pending[id].timer);
            delete pending[id];
            if (error) fail(error);
        }
        function clearPending(error) {
            var ids = Object.keys(pending);
            angular.forEach(ids, function (id) { settle(id); });
            if (ids.length && error) fail(error);
        }
        $scope.command = function (action, feed, index, state, context) {
            if (!$scope.ready || !socket || socket.readyState !== WebSocket.OPEN) { fail('Command was not sent: connection is not ready.'); return; }
            if (!$scope.frame) return;
            if (Object.keys(pending).length >= 32) { fail('Command not sent: too many commands are awaiting confirmation.'); return; }
            var command = { name: 'operator', frameId: $scope.frameId, action: action, feedType: feed || 'all' };
            if (index != null) { command.slideIndex = index; command.slideId = $scope.frame.slides[index].slideId; command.state = state; }
            if (action === 'context') command.context = context;
            var id = 'operator-' + (++serial);
            pending[id] = { timer: $timeout(function () { settle(id, 'Command timed out; outcome unknown. Check the current output before trying again.'); }, 10000) };
            try {
                var payload = JSON.stringify({ type: 'command', id: id, command: command });
                if (new Blob([payload]).size > 64 * 1024) { settle(id, 'The edit exceeds the remote command size limit. Apply it in Control.'); return; }
                socket.send(payload);
            }
            catch (error) { settle(id, 'Command could not be sent. Check the connection before trying again.'); }
        };
        function open() {
            $scope.connecting = true; $scope.ready = false; $scope.status = 'Connecting…';
            var connection = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
            socket = connection;
            lastState = Date.now();
            connection.onopen = function () { if (socket === connection) connection.send(JSON.stringify({ type: 'auth', pin: $scope.auth.pin, client: 'operator' })); };
            connection.onmessage = function (event) {
                if (socket !== connection) return;
                var message;
                try { message = JSON.parse(event.data); } catch (error) { $scope.$evalAsync(function () { fail('Invalid response received from the server.'); }); return; }
                $scope.$evalAsync(function () {
                    if (message.type === 'auth-ok') {
                        try { localStorage.setItem(pinStorageKey, $scope.auth.pin); }
                        catch (error) { fail('Connected, but the PIN could not be saved in this browser.'); }
                        $scope.authenticated = true; $scope.connecting = false; $scope.token = message.assetToken;
                        $scope.languages = message.languages; $scope.status = 'Synchronizing…';
                        connection.send(JSON.stringify({ type: 'ping' }));
                    } else if (message.type === 'state' && !message.cached && message.frames && Array.isArray(message.frames.frames)) {
                        reconcileFrames(message.frames.frames); $scope.feeds = message.frames.feedTypes || [];
                        $scope.testMode = !!message.frames.testMode;
                        $scope.frame = selectedFrame();
                        if (!$scope.frame && $scope.frames.length) {
                            var hadSelection = !!$scope.frameId || $scope.everSelected;
                            if (hadSelection) {
                                fail('The selected frame is unavailable. Select a frame to resume.');
                                reportDebug('streaming-display-unavailable', 'The Operator display for frame “' + ($scope.frameId || 'unknown') + '” is no longer available.');
                            }
                            $scope.frameId = null;
                            if (!hadSelection) { $scope.frameId = $scope.frames[0].id; $scope.selectFrame(); }
                            else $scope.everSelected = true;
                        }
                        if ($scope.frame) $scope.everSelected = true;
                        lastState = Date.now(); attempts = 0; $scope.ready = true; $scope.status = 'Connected · synchronized';
                    } else if (message.type === 'command-result') settle(message.id, message.ok ? null : (message.error || 'Command failed.'));
                });
            };
            connection.onerror = function () { /* onclose handles connection failures. */ };
            connection.onclose = function (event) {
                if (socket !== connection) return;
                socket = null;
                $scope.$evalAsync(function () {
                    $scope.ready = false; $scope.connecting = false;
                    clearPending('Connection lost before confirmation; command outcome unknown. Check the output after reconnecting.');
                    if (event.code === 4001 || event.code === 4008 || event.code === 4003) {
                        if (event.code === 4001) {
                            try { localStorage.removeItem(pinStorageKey); }
                            catch (error) { /* Keep the authentication error visible below. */ }
                        }
                        $scope.authenticated = false; $scope.status = 'Connection refused';
                        fail(event.code === 4008 ? 'Too many PIN attempts. Wait one minute before reconnecting.' : 'Connection refused. Check the PIN and server address.');
                        return;
                    }
                    $scope.status = 'Disconnected · reconnecting…'; fail('Connection lost. Controls are disabled while reconnecting.');
                    retry = $timeout(open, Math.min(15000, 1000 * Math.pow(2, attempts++)) + Math.random() * 500);
                });
            };
        }
        $scope.connect = function () {
            $scope.auth.pin = String($scope.auth.pin || '').trim();
            if (retry) $timeout.cancel(retry);
            if (socket) { var previous = socket; socket = null; previous.close(); }
            $scope.error = ''; attempts = 0; open();
            clearPending('Reconnected before confirmation; command outcome unknown. Check the current output.');
        };
        watchdog = $interval(function () {
            if (!socket) return;
            if (Date.now() - lastState > 15000) {
                $scope.ready = false; fail('No fresh control state for 15 seconds. Reconnecting; check that the control panel is running.');
                socket.close(); return;
            }
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
        }, 5000);
        function keydown(event) {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target || {}).tagName) || event.target.isContentEditable) return;
            var action = event.ctrlKey && event.key.toLowerCase() === 'b' ? 'blank' : event.ctrlKey && event.key.toLowerCase() === 'l' ? 'live' : event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : null;
            if (!action) return;
            event.preventDefault(); if (event.repeat) return;
            $scope.$apply(function () { $scope.command(action); });
        }
        document.addEventListener('keydown', keydown);
        $scope.$on('$destroy', function () { document.removeEventListener('keydown', keydown); $interval.cancel(watchdog); if (retry) $timeout.cancel(retry); if (socket) { var old = socket; socket = null; old.close(); } clearPending(); });
        if ($scope.auth.pin) $scope.connect();
    });

    app.directive('operatorQueue', function ($timeout) {
        return function (scope, element) {
            var queue = element[0], index = -1, timer = null, retries = 0;
            function scroll() {
                timer = null;
                var row = queue.querySelector('[data-operator-row="' + index + '"]');
                if (!row || !row.querySelector('.list-group-item') || !queue.clientHeight) {
                    if (index >= 0 && retries++ < 8) timer = $timeout(scroll, 30, false);
                    return;
                }
                var top = queue.scrollTop + row.getBoundingClientRect().top - queue.getBoundingClientRect().top - queue.clientTop;
                var bottom = top + row.offsetHeight;
                var target = queue.scrollTop;
                // Keep visible rows still when a reveal or button changes. Move
                // only far enough to bring an off-screen selection into view.
                if (top < target) target = top - 8;
                else if (bottom > target + queue.clientHeight) {
                    target = row.offsetHeight > queue.clientHeight ? top : bottom - queue.clientHeight + 8;
                }
                queue.scrollTop = Math.max(0, Math.min(queue.scrollHeight - queue.clientHeight, target));
            }
            function schedule() {
                // Coalesce updates without repeatedly cancelling a pending scroll.
                // The callback always reads the latest index after row layout settles.
                if (timer) return;
                retries = 0;
                timer = $timeout(scroll, 30, false);
            }
            var unwatch = scope.$watchGroup([
                'frameId', 'channel', 'frame.slideIndex', 'frame.previewSlideIndex',
                'frame.slide.slideId', 'frame.previewSlide.slideId',
                function () { return angular.toJson(scope.frame && scope.frame.slide && scope.frame.slide.state); },
                function () { return angular.toJson(scope.frame && scope.frame.previewState); }
            ], function (next, previous) {
                var frame = scope.frame;
                if (!frame) { index = -1; return; }
                var liveChanged = next[2] !== previous[2] || next[4] !== previous[4] || next[6] !== previous[6];
                var previewChanged = next[3] !== previous[3] || next[5] !== previous[5] || next[7] !== previous[7];
                if (next[0] !== previous[0] || next[1] !== previous[1] || next === previous) {
                    index = scope.channel === 'preview' && frame.previewSlideIndex >= 0 ? frame.previewSlideIndex : frame.slideIndex;
                } else if (liveChanged) index = frame.slideIndex;
                else if (previewChanged) index = frame.previewSlideIndex >= 0 ? frame.previewSlideIndex : frame.slideIndex;
                schedule();
            });
            // Template insertion and index interpolation can finish after the state watcher.
            var observer = new MutationObserver(function (changes) {
                var rowsChanged = changes.some(function (change) {
                    if (change.type === 'attributes') return true;
                    return Array.prototype.some.call(change.addedNodes, function (node) {
                        return node.nodeType === 1 && (node.matches('[data-operator-row], .list-group-item') || node.querySelector('[data-operator-row], .list-group-item'));
                    });
                });
                if (rowsChanged) schedule();
            });
            observer.observe(queue, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-operator-row'] });
            var resize = new ResizeObserver(schedule);
            resize.observe(queue);
            scope.$on('$destroy', function () {
                unwatch(); observer.disconnect(); resize.disconnect();
                if (timer) $timeout.cancel(timer);
            });
        };
    });
    app.directive('operatorPanel', function () {
        return function (scope, element, attrs) {
            var node = element[0], id = scope.feed.id, initialized = false;
            function restore() {
                var size = scope.layout.panels[id] || {};
                node.style.width = Number.isFinite(size.width) ? Math.max(240, Math.min(3000, size.width)) + 'px' : '100%';
                node.style.height = Number.isFinite(size.height) ? Math.max(240, Math.min(2000, size.height)) + 'px' : '360px';
            }
            restore();
            var observer = new ResizeObserver(function () {
                if (!initialized) { initialized = true; return; }
                if (!node.offsetWidth || !node.offsetHeight) return;
                scope.$evalAsync(function () {
                    scope.layout.panels[id] = { width: node.offsetWidth, height: node.offsetHeight }; scope.saveLayout();
                });
            });
            observer.observe(node); scope.$on('layout-reset', restore); scope.$on('$destroy', function () { observer.disconnect(); });
        };
    });
    app.directive('operatorMonitor', function ($timeout) {
        return function (scope, element) {
            var iframe = document.createElement('iframe'), ready = false, timer;
            iframe.title = scope.feed.id + ' feed monitor'; iframe.tabIndex = -1;
            element[0].appendChild(iframe);
            function scale() {
                var size = scope.feed.gridSize || (scope.frame || {}).size || {};
                var width = Number(size.width) || 1920, height = Number(size.height) || 1080;
                var box = element[0], ratio = Math.min(box.clientWidth / width, box.clientHeight / height);
                iframe.style.width = width + 'px'; iframe.style.height = height + 'px'; iframe.style.transform = 'scale(' + ratio + ')';
                iframe.style.left = (box.clientWidth - width * ratio) / 2 + 'px'; iframe.style.top = (box.clientHeight - height * ratio) / 2 + 'px';
            }
            function publish() {
                scale(); if (!ready) return;
                var frame = scope.frame, output = frame && frame.outputs && frame.outputs[scope.feed.id];
                var payload = output && output[scope.channel];
                if (!payload) payload = { template: 'wstemplate://active/blank.html', context: {}, state: [] };
                payload = JSON.parse(JSON.stringify(payload).replace(/wstemplate:\/\/(active|project)\//g, '/operator-assets/' + scope.token + '/$1/'));
                iframe.contentWindow.postMessage({ type: 'operator-feed-state', payload: payload, languages: scope.languages, testMode: scope.testMode }, location.origin);
            }
            scope.$watchGroup(['token', 'frameId', 'channel'], function () {
                if (!scope.token || !scope.frameId) { publish(); return; }
                ready = false; $timeout.cancel(timer);
                iframe.src = '/operator-feed.html?screen=' + encodeURIComponent(scope.frameId) + '&preview=true&feed=' + scope.channel + '&feedType=' + scope.feed.id + '&token=' + encodeURIComponent(scope.token);
                timer = $timeout(function () {
                    var error = 'The “' + scope.feed.id + '” Operator monitor did not load. Reconnect or reload Operator.';
                    scope.feedErrors[scope.feed.id + ':monitor'] = error;
                    scope.reportDebug('operator-feed-error', error);
                }, 15000);
            });
            scope.$watch('frame.outputs[feed.id][channel]', publish, true);
            scope.$watch('testMode', publish);
            scope.$watchGroup(['feed.gridSize.width', 'feed.gridSize.height', 'frame.size.width', 'frame.size.height'], scale);
            function message(event) {
                if (event.origin !== location.origin || event.source !== iframe.contentWindow || !event.data) return;
                if (event.data.type === 'operator-feed-ready') {
                    ready = true; $timeout.cancel(timer); publish();
                    scope.$evalAsync(function () { delete scope.feedErrors[scope.feed.id + ':monitor']; });
                }
                if (event.data.type === 'operator-feed-error' || event.data.type === 'operator-feed-recovered') {
                    scope.$evalAsync(function () {
                        var key = scope.feed.id + ':' + (event.data.category || 'asset');
                        if (event.data.type === 'operator-feed-recovered') delete scope.feedErrors[key];
                        else {
                            scope.feedErrors[key] = 'The “' + scope.feed.id + '” Operator feed reported: ' + event.data.error;
                            scope.reportDebug('operator-feed-error', scope.feedErrors[key]);
                        }
                    });
                }
            }
            window.addEventListener('message', message);
            var observer = new ResizeObserver(scale); observer.observe(element[0]);
            scope.$on('$destroy', function () { observer.disconnect(); window.removeEventListener('message', message); $timeout.cancel(timer); });
        };
    });
})();
