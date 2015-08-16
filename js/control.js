(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, auth, SCREENS, WORLDSKILLS_API_EVENTS, WORLDSKILLS_API_RESULTS, WORLDSKILLS_EVENT_ID) {

        var intercom = Intercom.getInstance();

        $scope.auth = auth;

        $scope.update = function (screen) {
            var slide = $scope.screens[screen].slide;
            if (typeof slide != 'undefined') {
                intercom.emit('update.' + screen, {template: 'screens/' + slide.template, context: slide.context, state: slide.state});
            }
        };

        $scope.rehearsal = false;
        $scope.toggleRehearsal = function () {
            $scope.rehearsal = !$scope.rehearsal;
            $scope.buildScreens();
            angular.forEach($scope.screens, function(screen, id) {
                screen.slide = {
                    template: 'empty.html',
                    context: {},
                    state: ''
                };
                $scope.update(id);
            });
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

            $http({method: 'GET', url: WORLDSKILLS_API_EVENTS + '/' + WORLDSKILLS_EVENT_ID + '/skills', params: {sort: 'sector_name_asc', l: 'en', limit: 50}})
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
            if (!$scope.rehearsal) {
                r.member = result.member.name.text;
                r.member_1058 = result.member.name_1058.text;
                r.memberCode = result.member.code;
                r.competitors = [];
                angular.forEach(result.competitors, function (competitor) {
                    r.competitors.push(competitor.first_name + ' ' + competitor.last_name);
                });
            } else {
                r.member = 'Principality of Liechtenstein';
                r.member_1058 = 'Liechtenstein';
                r.memberCode = 'LI';
                r.competitors = [];
                angular.forEach(result.competitors, function (competitor, i) {
                    r.competitors.push('Hansueli Zimmermann ' + i);
                });
            }
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
                    states: ['Countries'],
                    context: {
                        results: $filter('orderBy')(results, 'member_1058'),
                        skill: $scope.simplifySkill(skill)
                    }
                };
                var slideMedals = {
                    label: skill.number + ' ' + skill.name.text + ' Medals',
                    template: 'skill_medals.html',
                    states: ['Bronze', 'Silver', 'Gold'],
                    context: {
                        results: $filter('orderBy')(results, ['position', 'member_1058']),
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

            // find results for Best of Nation
            var resultsBestOfNation = [];
            angular.forEach($scope.results, function(result, j) {
                if (result.best_of_nation) {
                    resultsBestOfNation.push($scope.simplifyResult(result));
                }
            });
            resultsBestOfNation = $filter('orderBy')(resultsBestOfNation, 'member_1058');

            // slides for Best of Nation
            for (var i = 1; i <= 99 && resultsBestOfNation.length > 0; i++) {

                var slide = {
                    label: 'Best of Nation ' + i,
                    template: 'best_of_nation.html',
                    states: ['Countries'],
                    context: {
                        results: resultsBestOfNation.splice(0, 4),
                    }
                };

                $scope.screens.b.slides.push(slide);
            }

            // find results for Albert Vidal Award
            var resultsAlbertVidalAward = [];
            angular.forEach($scope.results, function(result, j) {
                if (result.albert_vidal_award) {
                    resultsAlbertVidalAward.push($scope.simplifyResult(result));
                }
            });

            // slides for Albert Vidal Award
            var slide = {
                label: 'Albert Vidal Award',
                template: 'albert_vidal_award.html',
                states: ['Name'],
                context: {
                    results: $filter('orderBy')(resultsAlbertVidalAward, 'member_1058'),
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
            if ($scope.screens[screen].slide != slide) {
                slide.done = true;
                slide.state = '';
                $scope.screens[screen].slide = slide;
                $scope.update(screen);
            }
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
