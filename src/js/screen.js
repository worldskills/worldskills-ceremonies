(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, SCREENS, TEMPLATE_BASE) {

        $scope.screens = SCREENS;
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

        window.addEventListener('storage', function (e) {
            if (e.key == 'screen-' + $scope.screen) {
                if (!$scope.$$phase) {
                    $scope.$apply(function () {
                        $scope.render();
                    });
                } else {
                    $scope.render();
                }
            }
        });

        $scope.setScreen = function (screen, preview) {
            $scope.screen = screen;
            $scope.preview = (preview === 'true' || preview === true);

            var screenConfig = $scope.screens[screen] || { label: screen };
            document.title = 'Ceremonies ' + ($scope.preview ? 'Preview ' : '') + screenConfig.label;

            $scope.render();
        };

        $scope.render = function () {
            var data = angular.fromJson(window.localStorage.getItem('screen-' + $scope.screen));

            if (!data) {
                $scope.template = TEMPLATE_BASE + 'empty.html';
                $scope.context = {};
                $scope.states = [];
                return;
            }

            if (data.template != $scope.template) {
                $scope.context = {};
            }

            if (data.accent) {
                document.documentElement.style.setProperty('--frame-accent', data.accent);
            }

            $scope.states = [];
            angular.forEach(data.state, function (state) {
                $scope.states.push('screen-state-' + state);
            });

            $scope.template = data.template;
            $scope.context = data.context;
        };

        // $location.search() is unreliable for file:// URLs in AngularJS's hashbang mode — read query params directly.
        $scope.loadScreen = function () {
            var params = new URLSearchParams(window.location.search);
            var screen = params.get('screen');
            var preview = params.get('preview');
            var container = params.get('container'); // 'kv' | 'state'
            if (container) {
                document.body.classList.add('screen-container-' + container);
            }
            if (screen) {
                $scope.setScreen(screen, preview);
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
