(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', []);

    var screens = {
        a: {label: 'Screen Blue', slides: []},
        b: {label: 'Screen Pink', slides: []}
    };

    ceremoniesApp.constant('SCREENS', screens);

})();
