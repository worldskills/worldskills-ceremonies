(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['ceremoniesControlWorkspace', 'ngFileUpload', 'pascalprecht.translate']);

    var FRAMES_WINDOW_STATUS = {
        CLOSED: 'closed',
        CONNECTING: 'connecting',
        READY: 'ready'
    };

    var screens = {
        a: {
            id: 'a',
            label: 'Main Stage',
            slides: [],
            slide: undefined,
            previewSlide: undefined,
            size: { width: 1920, height: 1080 },
            position: { monitor: 0, x: null, y: null, fullscreen: false },
            ordering: { mode: 'skills', skillNumbers: [], sourceFile: null },
            status: FRAMES_WINDOW_STATUS.CLOSED,
            windows: { live: 0, preview: 0 }
        }
    };

    ceremoniesApp.constant('FRAMES_WINDOW_STATUS', FRAMES_WINDOW_STATUS);

    ceremoniesApp.constant('SCREENS', screens);

    ceremoniesApp.constant('TEMPLATE_BASE', 'wstemplate://active/');

    // The two localStorage/window channels a screen can read — see frame-state.service.js.
    ceremoniesApp.constant('FEED', {
        LIVE: 'live',
        PREVIEW: 'preview'
    });

    ceremoniesApp.constant('DATA_BASE', 'wstemplate://project/data/');

    // Primed into $templateCache when a screen window boots, so the first switch to a template
    // never waits on a fetch (which would blank the slide for a frame). Same filenames
    // Catalog.build emits; a project missing one just fails that one request silently.
    ceremoniesApp.constant('SCREEN_TEMPLATES', [
        'empty.html',
        'skill_callup.html',
        'skill_medals.html',
        'medal_for_excellence.html',
        'best_of_nation.html',
        'albert_vidal_award.html'
    ]);

    // Sentinel keys shared by Catalog/FrameState/Queue — not real skill
    // numbers, so they never collide with one.
    ceremoniesApp.constant('SLIDE_KEYS', {
        BEST_OF_NATION: '__bestOfNation__',
        ALBERT_VIDAL: '__albertVidal__'
    });

    ceremoniesApp.constant('ALBERT_VIDAL_AWARD_LABEL', 'Albert Vidal Award');

    // Flat-list / card-grouped-by-frame / navigate-by-skill — the three Queue view layouts.
    ceremoniesApp.constant('QUEUE_LAYOUTS', {
        LIST: 'list',
        GRID: 'grid',
        SKILLS: 'skills'
    });

    // Setup (import/assign/save) vs Run (live show operation) — the two operator workspace modes.
    ceremoniesApp.constant('WORKSPACE_MODES', {
        SETUP: 'setup',
        RUN: 'run'
    });

    // CIS results-spreadsheet column headers, shared by Catalog (row filtering/grouping) and
    // ResultFormat (per-row simplification) so both always read the same header names.
    ceremoniesApp.constant('EXCEL_COLUMNS', {
        POSITION: 'Position',
        MEMBER: 'Member',
        MEMBER_NAME: 'Member Name',
        SKILL_NUMBER: 'Skill Number',
        MEDAL: 'Medal',
        FIRST_NAME: 'First Name',
        LAST_NAME: 'Last Name',
        SCALE_SCORE: 'WorldSkills Scale Score'
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
