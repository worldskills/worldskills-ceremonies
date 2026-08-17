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
