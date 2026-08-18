(function () {
    'use strict';

    angular.module('ceremoniesControlWorkspace', [])
        .directive('controlWorkspace', function () {
            return {
                restrict: 'E',
                transclude: true,
                templateUrl: 'partials/control-workspace.html'
            };
        })
        .directive('slideRow', function () {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: 'partials/slide-row.html',
                link: function (scope, element, attrs) {
                    scope.rowFrameId = scope.$eval(attrs.frameId);
                    scope.rowSlide = scope.$eval(attrs.slide);
                    scope.rowShowBadge = attrs.showBadge ? !!scope.$eval(attrs.showBadge) : false;
                    scope.rowFrameLabel = attrs.frameLabel ? scope.$eval(attrs.frameLabel) : '';
                    scope.rowQueueIdx = attrs.queueIdx ? scope.$eval(attrs.queueIdx) : null;
                    var liveExpr = attrs.onLive;
                    scope.rowShowLive = function () { scope.$eval(liveExpr); };
                }
            };
        })
        .directive('jsonText', function ($filter) {
            return {
                restrict: 'A',
                require: 'ngModel',
                link: function (scope, element, attr, ngModel) {
                    ngModel.$parsers.push(function (input) {
                        try {
                            var parsed = JSON.parse(input);
                            ngModel.$setValidity('json', true);
                            return parsed;
                        } catch (e) {
                            ngModel.$setValidity('json', false);
                            return undefined;
                        }
                    });
                    ngModel.$formatters.push(function (data) {
                        return $filter('json')(data);
                    });
                }
            };
        });
})();
