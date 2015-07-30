(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ScreenCtrl', function ($scope, $sce, SCREENS) {

        var intercom = Intercom.getInstance();
        intercom.on('update', function(data) {
            $scope.$apply(function () {
                $scope.template = data.template;
                $scope.context = data.context;
            });
        });
        intercom.emit('poll');
    });

})();
