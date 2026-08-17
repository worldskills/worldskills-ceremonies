(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, TEMPLATE_BASE) {

        $scope.languages = [];

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

        // F11 only in preview — on a live window a stray keystroke must not desync DOM fullscreen from Electron's native fullscreen.
        window.addEventListener('keydown', function (e) {
            if (!$scope.preview) return;
            if (e.key === 'F11') {
                e.preventDefault();
                $scope.enableFullscreen();
            }
        });

        // Preview windows read a separate '-preview' channel (see frame-state.service.js) so
        // Preview can show a different slide than what's live — the key this window listens on.
        $scope.storageKey = function () {
            return 'screen-' + $scope.screen + ($scope.feed === 'preview' ? '-preview' : '');
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
            $scope.feed = feed || 'live';

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
                $scope.slideLabel = '';
                $scope.frame = { id: $scope.screen, label: $scope.screen, color: '', video: '', feed: $scope.feed };
                document.title = 'Ceremonies ' + ($scope.feed === 'preview' ? 'Preview ' : '') + $scope.screen;
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
                feed: $scope.feed
            };
            document.body.dataset.frame = $scope.frame.id;
            document.body.dataset.frameLabel = $scope.frame.label;
            document.title = 'Ceremonies ' + ($scope.feed === 'preview' ? 'Preview ' : '') + $scope.frame.label;

            if (data.accent) {
                document.documentElement.style.setProperty('--frame-accent', data.accent);
            }

            $scope.states = [];
            angular.forEach(data.state, function (state) {
                $scope.states.push('screen-state-' + state);
            });

            $scope.template = data.template;
            $scope.context = data.context;
            $scope.slideLabel = data.label || '';
        };

        // $location.search() is unreliable for file:// URLs in AngularJS's hashbang mode — read query params directly.
        $scope.loadScreen = function () {
            var params = new URLSearchParams(window.location.search);
            var screen = params.get('screen');
            var preview = params.get('preview');
            var feed = params.get('feed'); // 'preview' | null (live)
            var container = params.get('container'); // 'kv' | 'state'
            if (container) {
                document.body.classList.add('screen-container-' + container);
            }
            if (screen) {
                $scope.setScreen(screen, preview, feed);
            }
        };

        $scope.calculateResolution = function () {
            document.documentElement.style.setProperty('--screen-real-width', window.innerWidth);
            document.documentElement.style.setProperty('--screen-real-height', window.innerHeight);
        };

        window.addEventListener('resize', $scope.calculateResolution);

        $scope.loadScreen();
        $scope.calculateResolution();
    });

})();
