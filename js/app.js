(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['ngFileUpload']);

    var screens = {
        a: {label: 'Screen', slides: []}
    };

    ceremoniesApp.constant('SCREENS', screens);

})();
