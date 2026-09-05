(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, $templateRequest, TEMPLATE_BASE, SCREEN_TEMPLATES, FEED, StorageKeys) {

        $scope.FEED = FEED;
        $scope.languages = [];
        $scope.sponsorName = function (sponsor) {
            sponsor = sponsor || {};
            var name = sponsor.name || sponsor.title || sponsor.partnerName || '';
            return (name && name.text) || name || '';
        };
        $scope.partnerGridColumns = function (count) {
            // Choose the most balanced full-ish grid for the current count. A
            // 3-up row is a deliberate exception because it reads better than
            // a 2-by-2 grid with an empty cell on a 16:9 output.
            count = Math.max(1, parseInt(count, 10) || 1);
            if (count === 3) return 3;
            var bestColumns = 1;
            var bestScore = Infinity;
            for (var columns = 1; columns <= count; columns++) {
                var rows = Math.ceil(count / columns);
                var emptyCells = columns * rows - count;
                var score = Math.abs((columns / rows) - 1.5) + emptyCells * 0.3;
                if (score < bestScore) {
                    bestColumns = columns;
                    bestScore = score;
                }
            }
            return bestColumns;
        };

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
            return $scope.feed === FEED.PREVIEW ? StorageKeys.previewKey($scope.screen, $scope.feedType) : StorageKeys.screenKey($scope.screen, $scope.feedType);
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

        $scope.setScreen = function (screen, preview, feed, feedType) {
            $scope.screen = screen;
            $scope.preview = (preview === 'true' || preview === true);
            $scope.feed = feed === FEED.PREVIEW ? FEED.PREVIEW : FEED.LIVE;
            $scope.feedType = feedType === 'secondary' ? 'secondary' : 'main';

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
                $scope.frame = { id: $scope.screen, label: $scope.screen, color: '', video: '', feed: $scope.feed, feedType: $scope.feedType, testMode: $scope.testMode, testIdx: $scope.testIdx, gridCols: $scope.gridCols };
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
                feedType: $scope.feedType,
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
            var feedType = params.get('feedType');
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
                $scope.setScreen(screen, preview, feed, feedType);
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
