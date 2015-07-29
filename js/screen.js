(function () {
    'use strict';

    var cermoniesScreenApp = angular.module('cermoniesScreenApp', []);

    cermoniesScreenApp.controller('ScreenCtrl', function ($scope, $sce) {

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
