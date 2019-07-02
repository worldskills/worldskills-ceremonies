(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', []);

    var screens = {
        a: {label: 'Screen Pink', slides: []},
        b: {label: 'Screen Blue', slides: []}
    };

    ceremoniesApp.constant('SCREENS', screens);

})();
