(function () {
    'use strict';

    angular.module('ceremoniesApp').directive('autoFocus', function ($timeout) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                scope.$watch(attrs.autoFocus, function (val) {
                    if (val) {
                        $timeout(function () { element[0].focus(); element[0].select(); }, 0);
                    }
                });
            }
        };
    });

    angular.module('ceremoniesApp').directive('jsonText', function ($filter) {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                function into(input) {
                    try {
                        var parsed = JSON.parse(input);
                        ngModel.$setValidity('json', true);
                        return parsed;
                    } catch (e) {
                        // Return undefined, not partial data, so an in-progress
                        // edit can't break a live slide; validity flag drives
                        // the error state.
                        ngModel.$setValidity('json', false);
                        return undefined;
                    }
                }
                function out(data) {
                    return $filter('json')(data);
                }
                ngModel.$parsers.push(into);
                ngModel.$formatters.push(out);
            }
        };
    });

})();
