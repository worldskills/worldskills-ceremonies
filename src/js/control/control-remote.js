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
                if (slide) $scope.showSlide(action.frameId, slide);
            },
            previewSlide: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.previewSlide(null, action.frameId, slide);
            },
            toggleState: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.toggleState(action.frameId, slide, action.state);
            },
            resetStates: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.resetStates(action.frameId, slide);
            },
            updateContext: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    slide.context = action.context;
                    $scope.updateContext(action.frameId, slide);
                }
            },
            resetPreview: function (frame, action) { $scope.resetPreview(action.frameId); },
            resetFrame: function (frame, action) { $scope.resetFrame(action.frameId); },
            prevSlideForFrame: function (frame, action) { $scope.prevSlideForFrame(action.frameId); },
            nextSlideForFrame: function (frame, action) { $scope.nextSlideForFrame(action.frameId); }
        };

        $scope.remoteInfo = null;
        if (window.ceremonator && window.ceremonator.remote && window.ceremonator.remote.info) {
            $q.when(window.ceremonator.remote.info()).then(function (info) {
                $scope.remoteInfo = info;
            });
        }

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
