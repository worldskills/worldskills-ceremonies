(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, SCREENS) {

        var intercom = Intercom.getInstance();

        $scope.screens = SCREENS;

        $scope.setScreen = function (screen) {

            $scope.screen = screen;

            intercom.on('update.' + $scope.screen, function(data) {
                $scope.$apply(function () {
                    $scope.template = data.template;
                    $scope.context = data.context;
                    $scope.state = data.state;
                });
            });

            intercom.emit('poll.' + $scope.screen);
        };
    });

})();
