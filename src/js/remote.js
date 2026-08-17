(function () {
    'use strict';

    var app = angular.module('ceremoniesRemoteApp', ['ceremoniesControlWorkspace']);

    app.factory('RemoteTransport', function ($rootScope, $timeout) {
        var socket = null;
        var retry = null;
        var pin = '';
        var authenticated = false;
        var wasAuthenticated = false;
        var listeners = {};

        function emit(name, data) {
            $rootScope.$evalAsync(function () {
                angular.forEach(listeners[name] || [], function (listener) {
                    listener(data);
                });
            });
        }

        function on(name, listener) {
            if (!listeners[name]) listeners[name] = [];
            listeners[name].push(listener);
        }

        function open() {
            var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            var connection;
            retry = null;
            authenticated = false;
            connection = new WebSocket(protocol + '//' + window.location.host + '/ws');
            socket = connection;

            connection.onopen = function () {
                if (socket !== connection) return;
                connection.send(JSON.stringify({ type: 'auth', pin: pin }));
            };

            connection.onmessage = function (event) {
                var message;
                if (socket !== connection) return;
                try {
                    message = JSON.parse(event.data);
                } catch (e) {
                    return;
                }

                if (message.type === 'auth-ok') {
                    authenticated = true;
                    wasAuthenticated = true;
                    emit('authenticated');
                } else if (message.type === 'state') {
                    emit('state', message.frames || []);
                }
            };

            connection.onclose = function (event) {
                if (socket !== connection) return;
                socket = null;
                authenticated = false;

                if (event.code === 4001) {
                    wasAuthenticated = false;
                    emit('authentication-failed');
                    return;
                }

                if (wasAuthenticated) {
                    emit('reconnecting');
                    retry = $timeout(open, 3000);
                } else {
                    emit('connection-failed');
                }
            };
        }

        function connect(nextPin) {
            if (retry) {
                $timeout.cancel(retry);
                retry = null;
            }
            if (socket) socket.close();
            pin = String(nextPin || '').trim();
            wasAuthenticated = false;
            open();
        }

        function send(action) {
            if (!authenticated || !socket || socket.readyState !== WebSocket.OPEN) return false;
            socket.send(JSON.stringify({ type: 'action', action: action }));
            return true;
        }

        return { connect: connect, send: send, on: on };
    });

    app.controller('RemoteCtrl', function ($scope, $document, RemoteTransport) {
        $scope.auth = { pin: '', connecting: false, error: '' };
        $scope.connected = false;
        $scope.reconnecting = false;
        $scope.uploaded = true;
        $scope.screens = {};
        $scope.frameOptions = [];
        $scope.workspaceCapabilities = { manageWindows: false, preview: true, copyScript: false };
        $scope.FrameService = {
            activeFrameId: null,
            getFrameColor: function (id) {
                var frame = $scope.screens[id];
                if (frame && frame.color) return frame.color;
            }
        };

        function currentFrame() {
            return $scope.screens[$scope.FrameService.activeFrameId];
        }

        function reconcileSlide(target, source) {
            var editing = !!target.edit;
            var draft = target.context;
            target.label = source.label;
            target.slideId = source.slideId;
            target.state = angular.copy(source.state || []);
            target.states = angular.copy(source.states || []);
            target.done = !!source.done;
            if (!editing) target.context = angular.copy(source.context || {});
            else target.context = draft;
            target.edit = editing;
        }

        function reconcileFrames(incoming) {
            var present = {};
            var options = [];

            angular.forEach(incoming, function (source) {
                var frame = $scope.screens[source.id];
                var index, existingById = {};
                present[source.id] = true;
                options.push({ id: source.id, label: source.label });

                if (!frame) {
                    frame = { id: source.id, slides: [] };
                    $scope.screens[source.id] = frame;
                }

                frame.label = source.label;
                frame.color = source.color;
                frame.status = source.status;
                frame.blanked = !!source.blanked;
                frame.previewState = angular.copy(source.previewState || []);

                angular.forEach(frame.slides, function (slide) {
                    if (slide.slideId) existingById[slide.slideId] = slide;
                });
                var reconciled = [];
                for (index = 0; index < (source.slides || []).length; index++) {
                    var sourceSlide = source.slides[index];
                    var targetSlide = (sourceSlide.slideId && existingById[sourceSlide.slideId]) || {};
                    reconcileSlide(targetSlide, sourceSlide);
                    reconciled.push(targetSlide);
                }
                frame.slides = reconciled;
                frame.slide = source.slideIndex >= 0 ? frame.slides[source.slideIndex] : undefined;
                frame.previewSlide = source.previewSlideIndex >= 0 ? frame.slides[source.previewSlideIndex] : undefined;
            });

            angular.forEach($scope.screens, function (frame, id) {
                if (!present[id]) delete $scope.screens[id];
            });

            $scope.frameOptions = options;
            if (!$scope.screens[$scope.FrameService.activeFrameId]) {
                $scope.FrameService.activeFrameId = options.length ? options[0].id : null;
            }
        }

        function slideIndex(frameId, slide) {
            var frame = $scope.screens[frameId];
            return frame ? frame.slides.indexOf(slide) : -1;
        }

        function sendSlideAction(name, frameId, slide, extra) {
            var index = slideIndex(frameId, slide);
            var action;
            if (index < 0) return;
            action = angular.extend({ name: name, frameId: frameId, slideIndex: index, slideId: slide.slideId }, extra || {});
            if (!RemoteTransport.send(action)) $scope.auth.error = 'Action not sent — reconnecting.';
        }

        function statesFor(frame, slide) {
            if (frame && frame.previewSlide === slide) return frame.previewState || [];
            return (slide && slide.state) || [];
        }

        $scope.connect = function () {
            if (!$scope.auth.pin) return;
            $scope.auth.connecting = true;
            $scope.auth.error = '';
            RemoteTransport.connect($scope.auth.pin);
        };

        $scope.frameChanged = function () {
            $scope.jumpMenuOpen = false;
        };

        $scope.getSlidePosition = function (frameId) {
            var frame = $scope.screens[frameId];
            var index;
            if (!frame || !frame.slides.length) return '—';
            index = frame.slides.indexOf(frame.slide);
            return (index < 0 ? '—' : index + 1) + '/' + frame.slides.length;
        };

        $scope.canEditSlide = function (frameId, slide) {
            var frame = $scope.screens[frameId];
            return !!frame && (frame.slide === slide || frame.previewSlide === slide);
        };

        $scope.isPreviewingSlide = function (frameId, slide) {
            var frame = $scope.screens[frameId];
            return !!frame && frame.previewSlide === slide;
        };

        $scope.rowHasState = function (frameId, slide, state) {
            return statesFor($scope.screens[frameId], slide).indexOf(state) >= 0;
        };

        $scope.showSlide = function (frameId, slide) {
            sendSlideAction('showSlide', frameId, slide);
        };

        $scope.previewSlide = function ($event, frameId, slide) {
            if ($event) $event.stopPropagation();
            sendSlideAction('previewSlide', frameId, slide);
        };

        $scope.toggleState = function (frameId, slide, state) {
            sendSlideAction('toggleState', frameId, slide, { state: state });
        };

        $scope.resetStates = function (frameId, slide) {
            sendSlideAction('resetStates', frameId, slide);
        };

        $scope.updateContext = function (frameId, slide) {
            if (angular.isUndefined(slide.context)) return;
            sendSlideAction('updateContext', frameId, slide, { context: angular.copy(slide.context) });
        };

        $scope.resetPreview = function (frameId) {
            RemoteTransport.send({ name: 'resetPreview', frameId: frameId });
        };

        $scope.resetFrame = function (frameId) {
            RemoteTransport.send({ name: 'resetFrame', frameId: frameId });
        };

        $scope.prevSlide = function () {
            if ($scope.FrameService.activeFrameId) {
                RemoteTransport.send({ name: 'prevSlideForFrame', frameId: $scope.FrameService.activeFrameId });
            }
        };

        $scope.nextSlide = function () {
            if ($scope.FrameService.activeFrameId) {
                RemoteTransport.send({ name: 'nextSlideForFrame', frameId: $scope.FrameService.activeFrameId });
            }
        };

        $scope.jumpToSlide = function (slide) {
            if ($scope.FrameService.activeFrameId) $scope.showSlide($scope.FrameService.activeFrameId, slide);
        };

        function keydown(event) {
            var target = event.target || {};
            var tag = (target.tagName || '').toLowerCase();
            if (!$scope.connected || !currentFrame()) return;
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return;
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                $scope.$apply($scope.nextSlide);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                $scope.$apply($scope.prevSlide);
            }
        }

        RemoteTransport.on('authenticated', function () {
            $scope.auth.connecting = false;
            $scope.auth.error = '';
            $scope.connected = true;
            $scope.reconnecting = false;
        });
        RemoteTransport.on('state', reconcileFrames);
        RemoteTransport.on('reconnecting', function () {
            $scope.reconnecting = true;
            $scope.connected = false;
        });
        RemoteTransport.on('authentication-failed', function () {
            $scope.auth.connecting = false;
            $scope.auth.error = 'Could not connect — check the PIN.';
            $scope.connected = false;
            $scope.reconnecting = false;
        });
        RemoteTransport.on('connection-failed', function () {
            $scope.auth.connecting = false;
            $scope.auth.error = 'Could not reach Ceremonator on this network.';
        });

        $document.on('keydown', keydown);
        $scope.$on('$destroy', function () { $document.off('keydown', keydown); });

        var pinFromUrl = new URLSearchParams(window.location.search).get('pin');
        if (pinFromUrl) {
            $scope.auth.pin = pinFromUrl;
            $scope.connect();
        }
    });
})();
