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

        $scope.typeOf = function (value) {
            return typeof value;
        };

        $scope.update = function (screen) {
            var slide = $scope.screens[screen].slide;
            if (typeof slide != 'undefined') {
                intercom.emit('update.' + screen, {template: 'screens/' + slide.template, context: slide.context, state: slide.state});
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
            $scope.buildScreens();
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
            $scope.buildScreens();
            localStorage.removeItem(RESULTS_STORAGE_KEY);
        };

        // screens
        $scope.screens = SCREENS;

        $scope.simplifySkill = function (skill) {
            var s = {};
            s.name = skill.name.text;
            return s;
        };

        $scope.simplifyResult = function (result) {
            var r = {};
            r.position = result.position;
            r.medal = result.medal.name.text;
            r.member = result.member.name.text;
            r.memberCode = result.member.code;
            r.competitors = [];
            angular.forEach(result.competitors, function(competitor) {
                r.competitors.push(competitor.first_name + ' ' + competitor.last_name);
            });
            return r;
        };

        $scope.buildScreens = function () {

            $scope.screens.a.slides = [];
            $scope.screens.b.slides = [];

            // slides for Skills
            angular.forEach($scope.skills, function(skill, i) {

                // find results for skill
                var results = [];
                angular.forEach($scope.results, function(result, i) {
                    if (result.skill.id == skill.id) {
                        results.push($scope.simplifyResult(result));
                    }
                });

                var slideCallup = {
                    label: skill.number + ' ' + skill.name.text + ' Callup',
                    template: 'skill_callup.html',
                    context: {
                        results: $filter('orderBy')(results, 'member.name.text'),
                        skill: $scope.simplifySkill(skill)
                    }
                };
                var slideMedals = {
                    label: skill.number + ' ' + skill.name.text + ' Medals',
                    template: 'skill_medals.html',
                    states: ['Bronze', 'Silver', 'Gold'],
                    context: {
                        results: $filter('orderBy')(results, 'position'),
                        skill: $scope.simplifySkill(skill)
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
                        results.push($scope.simplifyResult(result));
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
                    results.push($scope.simplifyResult(result));
                }
            });

            // slides for Albert Vidal Award
            var slide = {
                label: 'Albert Vidal Award',
                template: 'albert_vidal_award.html',
                states: ['Name'],
                context: {
                    results: results
                }
            };
            $scope.screens.a.slides.push(slide);
        };

        $scope.buildScreens();

        $scope.setState = function (screen, slide, state) {
            slide.state = state;
            $scope.update(screen);
        };
        
        $scope.updateContext = function (screen, slide) {
            $scope.update(screen);
        };

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
    
    angular.module('ceremoniesApp').directive('jsonText', function ($filter) {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {            
              function into(input) {
                console.log(JSON.parse(input));
                return JSON.parse(input);
              }
              function out(data) {
                return $filter('json')(data);
              }
              ngModel.$parsers.push(into);
              ngModel.$formatters.push(out);
            }
        };
    });
})();
