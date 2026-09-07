(function () {
    'use strict';

    var app = angular.module('ceremoniesRemoteApp', ['ceremoniesControlWorkspace']);

    app.controller('RemoteCtrl', function ($scope, $document, RemoteTransport, SlideRowScope, SlideSnapshot) {
        var pinFromUrl = new URLSearchParams(window.location.search).get('pin');

        $scope.auth = { pin: '', connecting: false, error: '' };
        $scope.connected = false;
        $scope.reconnecting = false;
        $scope.uploaded = true;
        $scope.screens = {};
        $scope.frameOptions = [];
        $scope.workspaceCapabilities = { manageWindows: false, preview: true, copyScript: false };
        $scope.FrameService = {
            activeFrameId: null,
            feedTypes: [],
            hasFeedType: function (id) {
                return this.feedTypes.some(function (feed) {
                    return feed.id === id;
                });
            },
            getFrameColor: function (id) {
                var frame = $scope.screens[id];
                if (frame && frame.color) {
                    return frame.color;
                }
            }
        };

        $scope.connect = function () {
            if (!$scope.auth.pin) {
                return;
            }
            $scope.auth.connecting = true;
            $scope.auth.error = '';
            RemoteTransport.connect($scope.auth.pin, 'remote');
        };

        $scope.frameChanged = function () {
            $scope.jumpMenuOpen = false;
        };

        $scope.getSlidePosition = function (frameId) {
            var frame = $scope.screens[frameId];
            var index;
            if (!frame || !frame.slides.length) {
                return '—';
            }
            index = frame.slides.indexOf(frame.slide);
            return (index < 0 ? '—' : index + 1) + '/' + frame.slides.length;
        };

        $scope.showSlide = function (frameId, slide) {
            sendSlideAction('showSlide', frameId, slide);
        };

        $scope.previewSlide = function ($event, frameId, slide) {
            if ($event) {
                $event.stopPropagation();
            }
            sendSlideAction('previewSlide', frameId, slide);
        };

        $scope.toggleState = function (frameId, slide, state) {
            sendSlideAction('toggleState', frameId, slide, { state: state });
        };

        $scope.resetStates = function (frameId, slide) {
            sendSlideAction('resetStates', frameId, slide);
        };

        $scope.updateContext = function (frameId, slide) {
            if (angular.isUndefined(slide.context)) {
                return;
            }
            sendSlideAction('updateContext', frameId, slide, { context: angular.copy(slide.context) });
        };

        $scope.resetPreview = function (frameId) {
            RemoteTransport.send({ name: 'resetPreview', frameId: frameId });
        };

        $scope.resetFrame = function (frameId, feedType) {
            RemoteTransport.send({ name: 'resetFrame', frameId: frameId, feedType: feedType });
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
            if ($scope.FrameService.activeFrameId) {
                $scope.showSlide($scope.FrameService.activeFrameId, slide);
            }
        };

        function primaryFeedId() {
            return ($scope.FrameService.feedTypes[0] || {}).id;
        }

        function currentFrame() {
            return $scope.screens[$scope.FrameService.activeFrameId];
        }

        function reconcileFrames(message) {
            // Older controllers sent a raw frame array; current snapshots include feeds.
            var snapshot = angular.isArray(message) ? { frames: message } : (message || {});
            var incoming = snapshot.frames || [];
            var present = {};
            var options = [];

            $scope.FrameService.feedTypes = snapshot.feedTypes || [];

            angular.forEach(incoming, function (source) {
                var frame = $scope.screens[source.id];

                present[source.id] = true;
                options.push({ id: source.id, label: source.label });

                if (!frame) {
                    frame = { id: source.id, slides: [] };
                    $scope.screens[source.id] = frame;
                }

                frame.label = source.label;
                frame.color = source.color;
                frame.status = source.status;
                frame.blankedFeeds = angular.copy(source.blankedFeeds || (source.blanked ? { main: true } : {}));
                frame.previewState = angular.copy(source.previewState || []);
                frame.slides = SlideSnapshot.mergeSlides(frame.slides, source.slides, primaryFeedId());
                frame.slide = source.slideIndex >= 0 ? frame.slides[source.slideIndex] : undefined;
                frame.previewSlide = source.previewSlideIndex >= 0 ? frame.slides[source.previewSlideIndex] : undefined;
            });

            angular.forEach($scope.screens, function (frame, id) {
                if (!present[id]) {
                    delete $scope.screens[id];
                }
            });

            $scope.frameOptions = options;
            if (!$scope.screens[$scope.FrameService.activeFrameId]) {
                $scope.FrameService.activeFrameId = options.length ? options[0].id : null;
            }
        }

        function sendSlideAction(name, frameId, slide, extra) {
            var frame = $scope.screens[frameId];
            var index = frame ? frame.slides.indexOf(slide) : -1;
            var action;

            if (index < 0) {
                return;
            }

            action = angular.extend({
                name: name,
                frameId: frameId,
                slideIndex: index,
                slideId: slide.slideId
            }, extra || {});

            if (!RemoteTransport.send(action)) {
                $scope.auth.error = 'Action not sent — reconnecting.';
            }
        }

        function keydown(event) {
            var target = event.target || {};
            var tag = (target.tagName || '').toLowerCase();

            if (!$scope.connected || !currentFrame()) {
                return;
            }
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                $scope.$apply($scope.nextSlide);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                $scope.$apply($scope.prevSlide);
            } else if ((event.key === 'b' || event.key === 'B') && event.ctrlKey) {
                event.preventDefault();
                $scope.$apply(function () {
                    $scope.resetFrame($scope.FrameService.activeFrameId);
                });
            }
        }

        SlideRowScope($scope);

        $scope.$on('remote:authenticated', function () {
            $scope.auth.connecting = false;
            $scope.auth.error = '';
            $scope.connected = true;
            $scope.reconnecting = false;
            RemoteTransport.savePin();
        });

        $scope.$on('remote:state', function (event, message) {
            reconcileFrames(message.frames);
        });

        $scope.$on('remote:reconnecting', function () {
            $scope.reconnecting = true;
            $scope.connected = false;
        });

        $scope.$on('remote:refused', function (event, code) {
            $scope.auth.connecting = false;
            $scope.connected = false;
            $scope.reconnecting = false;

            if (code === 4008) {
                $scope.auth.error = 'Too many PIN attempts. Wait one minute before reconnecting.';
            } else {
                $scope.auth.error = 'Could not connect — check the PIN.';
            }

            if (code === 4001) {
                RemoteTransport.forgetPin();
            }
        });

        $scope.$on('remote:connection-failed', function () {
            $scope.auth.connecting = false;
            $scope.auth.error = 'Could not reach Ceremonator on this network.';
        });

        $document.on('keydown', keydown);

        $scope.$on('$destroy', function () {
            $document.off('keydown', keydown);
            RemoteTransport.close();
        });

        $scope.auth.pin = pinFromUrl || RemoteTransport.loadPin();
        if ($scope.auth.pin) {
            $scope.connect();
        }
    });

})();
