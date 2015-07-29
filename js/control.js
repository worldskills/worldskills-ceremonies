(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['worldskills.utils']);

    ceremoniesApp.constant('WORLDSKILLS_CLIENT_ID', '88625bde16aa');
    ceremoniesApp.constant('WORLDSKILLS_EVENT_ID', '7');
    ceremoniesApp.constant('WORLDSKILLS_API_EVENTS', 'http://localhost:8080/events');
    ceremoniesApp.constant('WORLDSKILLS_API_RESULTS', 'http://localhost:8080/results');
    ceremoniesApp.constant('WORLDSKILLS_API_AUTH', 'http://localhost:8080/auth');
    ceremoniesApp.constant('WORLDSKILLS_AUTHORIZE_URL', 'http://worldskills-auth.dev/oauth/authorize');
    ceremoniesApp.constant('WORLDSKILLS_API_EVENTS', 'https://api.worldskills.org/events');
    ceremoniesApp.constant('WORLDSKILLS_API_RESULTS', 'https://api.worldskills.org/results');
    ceremoniesApp.constant('WORLDSKILLS_API_AUTH', 'https://api.worldskills.org/auth');
    ceremoniesApp.constant('WORLDSKILLS_AUTHORIZE_URL', 'https://auth.worldskills.org/oauth/authorize');

    ceremoniesApp.controller('ControlCtrl', function ($scope, $http, auth, WORLDSKILLS_API_EVENTS, WORLDSKILLS_API_RESULTS, WORLDSKILLS_EVENT_ID) {

        var intercom = Intercom.getInstance();

        $scope.tab = 'skills';

        $scope.switchTab = function (tab) {
            $scope.tab = tab;            
        };

        $scope.auth = auth;

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

        // skills
        var SKILLS_STORAGE_KEY = 'worldskills.ceremonies.skills';
        var skills = localStorage.getItem(SKILLS_STORAGE_KEY);
        if (skills) {
            $scope.skills = JSON.parse(skills).skills;
        } else {
            $scope.skills = [];
        }

        $scope.fetchSkills = function () {
            $scope.skillsLoading = true;

            $http({method: 'GET', url: WORLDSKILLS_API_EVENTS + '/' + WORLDSKILLS_EVENT_ID + '/skills', params: {limit: 50}})
                .success(function(data, status, headers, config) {
                    $scope.skills = data.skills;
                    localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(data));
                    $scope.skillsLoading = false;
                }).
                error(function(data, status, headers, config) {
                    $scope.skillsLoading = false;
                });
        };
        $scope.clearSkills = function () {
            $scope.skills = [];
            localStorage.removeItem(SKILLS_STORAGE_KEY);
        };

        // screens
        $scope.screens = [];

        angular.forEach($scope.skills, function(skill) {
            $scope.screens.push(skill.name.text);
        }); 

        // results
        var RESULTS_STORAGE_KEY = 'worldskills.ceremonies.results';
        var results = localStorage.getItem(RESULTS_STORAGE_KEY);
        if (results) {
            $scope.results = JSON.parse(results).results;
        } else {
            $scope.results = [];
        }

        $scope.fetchResults = function () {
            $scope.resultsLoading = true;

            $http({method: 'GET', url: WORLDSKILLS_API_RESULTS + '/events/' + WORLDSKILLS_EVENT_ID})
                .success(function(data, status, headers, config) {
                    $scope.results = data.results;
                    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(data));
                    $scope.resultsLoading = false;
                }).
                error(function(data, status, headers, config) {
                    $scope.resultsLoading = false;
                });
        };
        $scope.clearResults = function () {
            $scope.results = [];
            localStorage.removeItem(RESULTS_STORAGE_KEY);
        };
    });

})();
