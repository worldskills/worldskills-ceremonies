(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, SCREENS, TEMPLATE_BASE) {

        $scope.screens = SCREENS;
        $scope.showToolbar = true;
        $scope.frameLabel = '';
        $scope.slideLabel = '';

        $scope.enableFullscreen = function () {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
                (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullScreen).call(document.documentElement);
            }
        };

        // These keys are debug/rehearsal aids only. On a live (non-preview)
        // window a stray keystroke must never paint a toolbar over the wall
        // or desync DOM fullscreen against Electron's native fullscreen.
        window.addEventListener('keydown', function (e) {
            if (!$scope.preview) return;
            if (e.key === 'F11') {
                e.preventDefault();
                $scope.enableFullscreen();
            }
            if (e.key === 't' || e.key === 'T') {
                if (!$scope.$$phase) {
                    $scope.$apply(function () {
                        $scope.showToolbar = !$scope.showToolbar;
                    });
                } else {
                    $scope.showToolbar = !$scope.showToolbar;
                }
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
            $scope.showToolbar = $scope.preview;

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
                $scope.slideLabel = '';
                return;
            }

            if (data.template != $scope.template) {
                $scope.context = {};
            }

            if (data.frameLabel) {
                $scope.frameLabel = data.frameLabel;
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
            $scope.slideLabel = data.label || '';
        };

        // Read URL query params directly — $location.search() is unreliable
        // for file:// URLs in AngularJS's default hashbang mode.
        $scope.loadScreen = function () {
            var params = new URLSearchParams(window.location.search);
            var screen = params.get('screen');
            var preview = params.get('preview');
            var label = params.get('label');
            var container = params.get('container'); // 'kv' | 'state'
            if (container) {
                document.body.classList.add('screen-container-' + container);
            }
            if (screen) {
                var screenConfig = $scope.screens[screen];
                $scope.frameLabel = label || (screenConfig && screenConfig.label) || screen;
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
