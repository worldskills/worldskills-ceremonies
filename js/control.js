(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', []);

    ceremoniesApp.controller('ControlCtrl', function ($scope) {

        var intercom = Intercom.getInstance();

        $scope.template = 'screens/skill_callup.html';

        $scope.context = {};
        $scope.context.skill = 'Web Design'; 
        $scope.context.results = [];
        $scope.context.results.push({first_name: "Fredrik", last_name: "Glanrup"});
        $scope.context.results.push({first_name: "Max", last_name: "Muster"});

        $scope.typeOf = function (value) {
            return typeof value;
        };

        $scope.update = function () {
            intercom.emit('update', {template: $scope.template, context: $scope.context});
        };

        $scope.update();

        intercom.on('poll', function () {
            $scope.update();
        });
    });

})();
