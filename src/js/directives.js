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

})();
