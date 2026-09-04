(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, $templateRequest, TEMPLATE_BASE, SCREEN_TEMPLATES, FEED, StorageKeys) {

        $scope.FEED = FEED;
        $scope.languages = [];

        // ── Test Mode ──────────────────────────────────────────────────
        $scope.testMode = false;
        $scope.testIdx = 0;
        $scope.gridCols = 0;

        if (window.ceremonator && window.ceremonator.project && window.ceremonator.project.current) {
            window.ceremonator.project.current().then(function (result) {
                var configured = result && result.project && result.project.languages;
                var languages = (configured && configured.length) ? configured : [{ lang_code: 'en' }];
                if (!$scope.$$phase) {
                    $scope.$apply(function () { $scope.languages = languages; });
                } else {
                    $scope.languages = languages;
                }
            });
        }

        $scope.enableFullscreen = function () {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
                (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullScreen).call(document.documentElement);
            }
        };

        $scope.storageKey = function () {
            return $scope.feed === FEED.PREVIEW ? StorageKeys.previewKey($scope.screen) : StorageKeys.screenKey($scope.screen);
        };

        window.addEventListener('storage', function (e) {
            if (e.key == $scope.storageKey()) {
                if (!$scope.$$phase) {
                    $scope.$apply(function () {
                        $scope.render();
                    });
                } else {
                    $scope.render();
                }
            }
        });

        $scope.setScreen = function (screen, preview, feed) {
            $scope.screen = screen;
            $scope.preview = (preview === 'true' || preview === true);
            $scope.feed = feed || FEED.LIVE;

            $scope.render();
        };



        $scope.render = function () {
            var data = null;
            try {
                data = angular.fromJson(window.localStorage.getItem($scope.storageKey()));
            } catch (_error) {
                data = null;
            }

            if (!data) {
                $scope.template = TEMPLATE_BASE + 'empty.html';
                $scope.context = {};
                $scope.states = [];
                $scope.state = [];
                $scope.slideLabel = '';
                $scope.frame = { id: $scope.screen, label: $scope.screen, color: '', video: '', feed: $scope.feed, testMode: $scope.testMode, testIdx: $scope.testIdx, gridCols: $scope.gridCols };
                document.title = 'Ceremonies ' + ($scope.feed === FEED.PREVIEW ? 'Preview ' : '') + $scope.screen;
                return;
            }

            if (data.template != $scope.template) {
                $scope.context = {};
            }

            $scope.frame = {
                id: $scope.screen,
                label: data.frameLabel || $scope.screen,
                color: data.accent || '',
                video: data.video || '',
                feed: $scope.feed,
                testMode: $scope.testMode,
                testIdx: $scope.testIdx,
                gridCols: $scope.gridCols
            };
            document.body.dataset.frame = $scope.frame.id;
            document.body.dataset.frameLabel = $scope.frame.label;
            // Lets a template's own opaque background step aside for the persistent bg video,
            // which now sits behind .screen-content instead of inside it.
            document.body.classList.toggle('has-bg-video', !!$scope.frame.video);
            document.title = 'Ceremonies ' + ($scope.feed === FEED.PREVIEW ? 'Preview ' : '') + $scope.frame.label;

            if (data.accent) {
                document.documentElement.style.setProperty('--frame-accent', data.accent);
            }

            $scope.states = [];
            angular.forEach(data.state, function (state) {
                $scope.states.push('screen-state-' + state);
            });

            $scope.state = data.state || [];

            $scope.template = data.template;
            $scope.context = data.context;
            $scope.slideLabel = data.label || '';
        };

        $scope.loadScreen = function () {
            var params = new URLSearchParams(window.location.search);
            var screen = params.get('screen');
            var preview = params.get('preview');
            var feed = params.get('feed');
            var testMode = params.get('testMode') === '1' || localStorage.getItem('ceremonator:testMode') === '1';
            var testIdx = parseInt(params.get('testIdx'), 10) || 0;
            var gridCols = parseInt(params.get('gridCols'), 10) || 0;
            var container = params.get('container');
            if (container) {
                document.body.classList.add('screen-container-' + container);
            }
            if (screen) {
                $scope.testMode = testMode;
                $scope.testIdx = testIdx;
                $scope.gridCols = gridCols;
                $scope.setScreen(screen, preview, feed);
            }
        };

        $scope.loadScreen();

        // Listen for test mode changes from other windows (control panel toggle)
        window.addEventListener('storage', function (e) {
            if (e.key === 'ceremonator:testMode') {
                var enabled = e.newValue === '1';
                if (!$scope.$$phase) {
                    $scope.$apply(function () {
                        $scope.testMode = enabled;
                    });
                } else {
                    $scope.testMode = enabled;
                }
            }
        });

        angular.forEach(SCREEN_TEMPLATES, function (name) {
            $templateRequest(TEMPLATE_BASE + name, true).catch(angular.noop);
        });

        window.addEventListener('keydown', function (e) {
            if (!$scope.preview) return;
            if (e.key === 'F11') {
                e.preventDefault();
                $scope.enableFullscreen();
            }
        });
    });

})();
