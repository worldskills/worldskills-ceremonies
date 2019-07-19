(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $location, $sce, SCREENS) {

        $scope.screens = SCREENS;

        $scope.enableFullscreen = function () {
            document.documentElement.webkitRequestFullScreen();
        };

        window.addEventListener('storage', function (e) {
            if (e.key == 'screen-' + $scope.screen) {
                $scope.$apply(function () {
                    $scope.render();
                })
            }
        });

        $scope.setScreen = function (screen, preview) {

            $location.search('screen', screen)
            $location.search('preview', preview + '');

            $scope.screen = screen;
            $scope.preview = (preview == 'true');

            document.title = 'Ceremonator ' + ($scope.preview ? 'Preview ' : '') + $scope.screens[screen].label;

            $scope.render();
        };

        $scope.render = function () {

            var data = angular.fromJson(window.localStorage.getItem('screen-' + $scope.screen));

            if (data.template != $scope.template) {
                // clear context before loading new template
                $scope.context = {};
            }

            $scope.states = [];
            if ($scope.preview) {
                $scope.states.push('screen-state-Preview');
            } else {
                angular.forEach(data.state, function(state) {
                    $scope.states.push('screen-state-' + state);
                });
            }

            $scope.template = data.template;
            $scope.context = data.context;
        };

        $scope.loadScreen = function () {
            var parameter = $location.search();
            if (typeof parameter.screen !== 'undefined') {
                $scope.setScreen(parameter.screen, parameter.preview)
            }
        };

        $scope.$on("$locationChangeSuccess", function () {
           $scope.loadScreen();
        });

        $scope.loadScreen();
    });

})();
