(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['ngFileUpload', 'pascalprecht.translate']);

    var screens = {
        a: {
            id: 'a',
            label: 'Main Stage',
            slides: [],
            slide: undefined,
            size: { width: 1920, height: 1080 },
            position: { monitor: 0, x: null, y: null, fullscreen: false, kiosk: false },
            ordering: { mode: 'skills', skillNumbers: [], sourceFile: null },
            status: 'closed'
        }
    };

    ceremoniesApp.constant('SCREENS', screens);

    ceremoniesApp.constant('TEMPLATE_BASE', 'wstemplate://active/');

    ceremoniesApp.config(function ($sceDelegateProvider) {
        $sceDelegateProvider.resourceUrlWhitelist(['self', 'wstemplate://active/**']);
    });

    ceremoniesApp.config(function ($translateProvider) {
        $translateProvider.useLoader('TranslationsLoader');
        $translateProvider.preferredLanguage('en'); // IDs are English, so the 'en' table is empty
        $translateProvider.useSanitizeValueStrategy(null); // trusted content; set explicitly to silence the 2.x startup warning
    });

})();
