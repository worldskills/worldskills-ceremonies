(function () {
    'use strict';

    // Whitelisted remote-control actions — each maps a RemoteCtrl-sent action name onto the exact
    // same local scope function the operator UI itself calls (see control.js's `remote:action` wiring).
    angular.module('ceremoniesApp').factory('RemotePart', function ($q, FrameService) {
      return function ($scope) {
        var REMOTE_ACTIONS = {
            showSlide: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    $scope.showSlide(action.frameId, slide);
                }
            },
            previewSlide: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    $scope.previewSlide(null, action.frameId, slide);
                }
            },
            toggleState: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    $scope.toggleState(action.frameId, slide, action.state);
                }
            },
            resetStates: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    $scope.resetStates(action.frameId, slide);
                }
            },
            updateContext: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    slide.context = action.context;
                    $scope.updateContext(action.frameId, slide);
                }
            },
            resetPreview: function (frame, action) {
                $scope.resetPreview(action.frameId);
            },
            resetFrame: function (frame, action) {
                $scope.resetFrame(action.frameId, action.feedType || 'main');
            },
            prevSlideForFrame: function (frame, action) {
                $scope.prevSlideForFrame(action.frameId);
            },
            nextSlideForFrame: function (frame, action) {
                $scope.nextSlideForFrame(action.frameId);
            }
        };

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
                var handler = action && REMOTE_ACTIONS[action.name];
                var frame = action && FrameService.frames[action.frameId];
                if (!handler || !frame) return;
                var apply = function () { handler(frame, action); };
                if (!$scope.$$phase) $scope.$apply(apply); else apply();
            });
        }
      };
    });

})();
