(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, auth, SCREENS, WORLDSKILLS_API_EVENTS, WORLDSKILLS_API_RESULTS, WORLDSKILLS_EVENT_ID) {

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

        $scope.update = function (screen) {
            var slide = $scope.screens[screen].slide;
            if (typeof slide != 'undefined') {
                intercom.emit('update.' + screen, {template: 'screens/' + slide.template, context: slide.context});
            }
        };

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
                    $scope.buildScreens();
                }).
                error(function(data, status, headers, config) {
                    $scope.skillsLoading = false;
                });
        };
        $scope.clearSkills = function () {
            $scope.skills = [];
            localStorage.removeItem(SKILLS_STORAGE_KEY);
        };

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
                    $scope.buildScreens();
                }).
                error(function(data, status, headers, config) {
                    $scope.resultsLoading = false;
                });
        };
        $scope.clearResults = function () {
            $scope.results = [];
            localStorage.removeItem(RESULTS_STORAGE_KEY);
        };

        // screens
        $scope.screens = SCREENS;

        $scope.buildScreens = function () {

            $scope.screens.a.slides = [];
            $scope.screens.b.slides = [];

            // slides for Skills
            angular.forEach($scope.skills, function(skill, i) {

                // find results for skill
                var results = [];
                angular.forEach($scope.results, function(result, i) {
                    if (result.skill.id == skill.id) {
                        results.push(result);
                    }
                });

                var slideCallup = {
                    label: skill.number + ' ' + skill.name.text + ' Callup',
                    template: 'skill_callup.html',
                    context: {
                        skill: skill,
                        results: $filter('orderBy')(results, 'member.name.text')
                    }
                };
                var slideMedals = {
                    label: skill.number + ' ' + skill.name.text + ' Medals',
                    template: 'skill_medals.html',
                    context: {
                        skill: skill,
                        results: $filter('orderBy')(results, 'position')
                    }
                };
    
                if (i % 2 == 1) {
                    $scope.screens.a.slides.push(slideCallup);
                    $scope.screens.a.slides.push(slideMedals);
                } else {
                    $scope.screens.b.slides.push(slideCallup);
                    $scope.screens.b.slides.push(slideMedals);
                }
            });

            // slides for Best of Nation
            for (var i = 1; i <= 10; i++) {

                // find results for Best of Nation
                var results = [];
                angular.forEach($scope.results, function(result, j) {
                    if (j < 6) {
                        results.push(result);
                    }
                });

                var slide = {
                    label: 'Best of Nation ' + i,
                    template: 'best_of_nation.html',
                    context: {
                        results: results
                    }
                };
                if (i % 2 == 1) {
                    $scope.screens.a.slides.push(slide);
                } else {
                    $scope.screens.b.slides.push(slide);
                }
            }

            // find results for Best of Nation
            var results = [];
            angular.forEach($scope.results, function(result, j) {
                if (j < 1) {
                    results.push(result);
                }
            });

            // slides for Albert Vidal Award
            var slide = {
                label: 'Albert Vidal Award',
                template: 'albert_vidal_award.html',
                context: {
                    results: results
                }
            };
            $scope.screens.a.slides.push(slide);
        };

        $scope.buildScreens();

        $scope.showSlide = function (screen, slide) {
            slide.done = true;
            $scope.screens[screen].slide = slide;
            $scope.update(screen);
        };

        // screen polling
        angular.forEach($scope.screens, function(screen, id) {
            intercom.on('poll.' + id, function () {
                $scope.update(id);
            });
        });
    });

})();
