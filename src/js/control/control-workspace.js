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
                    // ng-repeat can reuse this row's scope/DOM across rebuilds (e.g. "track by
                    // $index" on frame.slides, whose entries are replaced wholesale on every
                    // assembleFrame run) without relinking — a one-time $eval here would freeze
                    // rowSlide/rowFrameId to whatever they were at first link, leaving a stale
                    // row that no longer matches any real slide (and reads as non-clickable,
                    // since canEditSlide etc. compare against the frozen object). Watch instead.
                    scope.$watch(attrs.frameId, function (v) { scope.rowFrameId = v; });
                    scope.$watch(attrs.slide, function (v) { scope.rowSlide = v; });
                    scope.rowShowBadge = attrs.showBadge ? !!scope.$eval(attrs.showBadge) : false;
                    if (attrs.frameLabel) {
                        scope.$watch(attrs.frameLabel, function (v) { scope.rowFrameLabel = v; });
                    } else {
                        scope.rowFrameLabel = '';
                    }
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
