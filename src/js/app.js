(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['ceremoniesControlWorkspace', 'ngFileUpload', 'pascalprecht.translate']);

    var screens = {
        a: {
            id: 'a',
            label: 'Main Stage',
            slides: [],
            slide: undefined,
            previewSlide: undefined,
            size: { width: 1920, height: 1080 },
            position: { monitor: 0, x: null, y: null, fullscreen: false, kiosk: false },
            ordering: { mode: 'skills', skillNumbers: [], sourceFile: null },
            status: 'closed',
            windows: { live: 0, preview: 0 }
        }
    };

    ceremoniesApp.constant('SCREENS', screens);

    ceremoniesApp.constant('TEMPLATE_BASE', 'wstemplate://active/');

    ceremoniesApp.constant('DATA_BASE', 'wstemplate://project/data/');

    // Sentinel keys shared by Catalog/FrameState/Queue — not real skill
    // numbers, so they never collide with one.
    ceremoniesApp.constant('SLIDE_KEYS', {
        BEST_OF_NATION: '__bestOfNation__',
        ALBERT_VIDAL: '__albertVidal__'
    });

    ceremoniesApp.config(function ($sceDelegateProvider, $compileProvider) {
        $sceDelegateProvider.resourceUrlWhitelist(['self', 'wstemplate://active/**', 'wstemplate://project/**']);

        // Angular's img[ng-src] sanitizer checks scheme separately from $sce.RESOURCE_URL above —
        // without this, flag <img ng-src="wstemplate://project/..."> gets rewritten to "unsafe:...".
        $compileProvider.imgSrcSanitizationWhitelist(/^\s*((https?|ftp|file|blob|wstemplate):|data:image\/)/);
    });

    ceremoniesApp.config(function ($translateProvider) {
        $translateProvider.useLoader('TranslationsLoader');
        $translateProvider.preferredLanguage('en'); // IDs are English, so the 'en' table is empty
        $translateProvider.useSanitizeValueStrategy(null); // trusted content; set explicitly to silence the 2.x startup warning
    });

})();
