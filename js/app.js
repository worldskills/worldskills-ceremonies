(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', []);

    var screens = {
        a: {label: 'Screen Orange', slides: []},
        b: {label: 'Screen Blue', slides: []}
    };

    ceremoniesApp.constant('SCREENS', screens);

})();
