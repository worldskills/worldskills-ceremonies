(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, SCREENS) {

        var intercom = Intercom.getInstance();

        $scope.screens = SCREENS;

        $scope.enableFullscreen = function () {
            document.documentElement.webkitRequestFullScreen();
        };

        $scope.setScreen = function (screen, preview) {

            $scope.screen = screen;

            intercom.on('update.' + $scope.screen, function(data) {
                $scope.$apply(function () {

                    if (data.template != $scope.template) {
                        // clear context before loading new template
                        $scope.context = {};
                    }

                    if (preview) {
                        $scope.state = 'Preview';
                    } else {
                        $scope.state = data.state;
                    }

                    $scope.template = data.template;
                    $scope.context = data.context;
                });
            });

            intercom.emit('poll.' + $scope.screen);
        };
    });

})();
