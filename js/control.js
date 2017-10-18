(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, SCREENS) {

        var intercom = Intercom.getInstance();

        $scope.update = function (screen) {
            var slide = $scope.screens[screen].slide;
            if (typeof slide != 'undefined') {
                intercom.emit('update.' + screen, {template: 'screens/' + slide.template, context: slide.context, state: slide.state});
            }
        };

        // skills
        $scope.skills = [];
        $http({method: 'GET', url: 'data/json/skills.json'}).then(function(response) {
            $scope.skills = response.data.skills;
            $scope.buildScreens();
        });

        // results
        $scope.results = [];
        $http({method: 'GET', url: 'data/json/results.json'}).then(function(response) {
            $scope.results = response.data.results;
            $scope.buildScreens();
        });

        // screens
        $scope.screens = SCREENS;

        $scope.capitalize = function (input) {

            input = input.toLowerCase();

            var inputPieces = input.split(' ');

            for (var i = 0; i < inputPieces.length; i++){
                inputPieces[i] = $scope.capitalizeString(inputPieces[i]);
            }

            return inputPieces.toString().replace(/,/g, ' ');
        };

        $scope.capitalizeString = function (inputString) {
            return inputString.substring(0, 1).toUpperCase() + inputString.substring(1);
        };

        $scope.simplifySkill = function (skill) {
            var s = {};
            s.name = skill.name.text;
            return s;
        };

        $scope.simplifyResult = function (result) {
            var r = {};
            r.position = result.position;
            if (result.medal) {
                r.medal = result.medal.name.text;
            }
            r.member = result.member.name.text;
            r.member_1058 = result.member.name_1058.text;
            r.memberCode = result.member.code;
            r.competitors = [];
            angular.forEach(result.competitors, function (competitor) {
                r.competitors.push($scope.capitalize(competitor.first_name) + ' ' + $scope.capitalize(competitor.last_name));
            });
            return r;
        };

        $scope.buildScreens = function () {

            $scope.screens.a.slides = [];
            $scope.screens.b.slides = [];

            var previousSector = '';
            var c = 0;

            // slides for Skills
            angular.forEach($scope.skills, function(skill, i) {

                // check sector
                var currentSector = skill.sector.name.text;
                if (currentSector != previousSector) {
                    //c = 0;
                    previousSector = currentSector;
                }

                // find results for skill
                var results = [];
                angular.forEach($scope.results, function(result, i) {
                    if (result.skill.id == skill.id && result.medal && result.medal.code != 'MFE') {
                        results.push($scope.simplifyResult(result));
                    }
                });

                // prepare medals states
                var states = [];
                angular.forEach(results, function(result, i) {
                    if (states.indexOf(result.medal) < 0) {
                        states.unshift(result.medal);
                    }
                });

                var slideName = {
                    label: skill.number + ' ' + skill.name.text + ' Name',
                    template: 'skill_name.html',
                    states: [],
                    context: {
                        skill: skill
                    }
                };
                var slideCallup = {
                    label: skill.number + ' ' + skill.name.text + ' Callup',
                    template: 'skill_callup.html',
                    states: [],
                    context: {
                        results: $filter('orderBy')(results, 'member_1058'),
                        skill: $scope.simplifySkill(skill)
                    }
                };
                var slideMedals = {
                    label: skill.number + ' ' + skill.name.text + ' Medals',
                    template: 'skill_medals.html',
                    states: states,
                    context: {
                        results: $filter('orderBy')(results, ['position', 'member_1058']),
                        skill: $scope.simplifySkill(skill)
                    }
                };

                if (c++ % 2 == 0) {
                    $scope.screens.a.slides.push(slideName);
                    $scope.screens.a.slides.push(slideCallup);
                    $scope.screens.a.slides.push(slideMedals);
                } else {
                    $scope.screens.b.slides.push(slideName);
                    $scope.screens.b.slides.push(slideCallup);
                    $scope.screens.b.slides.push(slideMedals);
                }
            });

            // find results for Best of Nation
            var resultsBestOfNation = [];
            var resultBestOfNationHost;
            angular.forEach($scope.results, function(result, j) {
                if (result.best_of_nation) {
                    if (result.member.code != 'AE') {
                        resultsBestOfNation.push($scope.simplifyResult(result));
                    } else {
                        resultBestOfNationHost = $scope.simplifyResult(result);
                    }
                }
            });
            resultsBestOfNation = $filter('orderBy')(resultsBestOfNation, 'member_1058');

            var c = 0;

            // slides for Best of Nation
            for (var i = 1; i <= 99 && resultsBestOfNation.length > 0; i++) {

                var slide = {
                    label: 'Best of Nation ' + i,
                    template: 'best_of_nation.html',
                    states: ['Countries'],
                    context: {
                        results: resultsBestOfNation.splice(0, 5),
                    }
                };

                if (c++ % 2 == 0) {
                    $scope.screens.a.slides.push(slide);
                } else {
                    $scope.screens.b.slides.push(slide);
                }
            }

            var slide = {
                label: 'Best of Nation Host',
                template: 'best_of_nation.html',
                states: ['Countries'],
                context: {
                    results: [resultBestOfNationHost],
                }
            };

            $scope.screens.a.slides.push(slide);
            $scope.screens.b.slides.push(angular.copy(slide));

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
            $scope.screens.b.slides.push(angular.copy(slide));
        };

        $scope.hasState = function (slide, state) {
            if (slide.state != undefined) {
                return !(slide.state.indexOf(state) < 0);
            }
            return false;
        };

        $scope.toggleState = function (screen, slide, state) {
            if ($scope.hasState(slide, state)) {
                slide.state.splice(slide.state.indexOf(state), 1);
            } else {
                slide.state.push(state);
            }
            $scope.update(screen);
        };

        $scope.resetStates = function (screen, slide) {
            slide.state = [];
            $scope.update(screen);
        };

        $scope.updateContext = function (screen, slide) {
            $scope.update(screen);
        };

        $scope.showSlide = function (screen, slide) {
            if ($scope.screens[screen].slide != slide) {
                slide.done = true;
                slide.state = [];
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
