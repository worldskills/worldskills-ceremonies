(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, SCREENS) {

        $scope.update = function (screen) {
            var slide = $scope.screens[screen].slide;
            if (typeof slide != 'undefined') {
                window.localStorage.setItem('screen-' + screen, angular.toJson({template: 'screens/' + slide.template, context: slide.context, state: slide.state}));
            }
        };

        // skills
        $scope.skills = [];
        $http({method: 'GET', url: 'data/json/skills.json'}).then(function(response) {
            $scope.skills = response.data.skills;
            $scope.buildScreens();
        });

        // members
        $scope.members = [];
        $http({method: 'GET', url: 'data/json/members.json'}).then(function(response) {
            $scope.members = response.data.members;
            $scope.buildScreens();
        });

        $scope.loadExcel = function (data) {
            var wb = XLSX.read(data, {type:'array'});

            var wsname = wb.SheetNames[0];
            var ws = wb.Sheets[wsname];

            return XLSX.utils.sheet_to_json(ws, {raw:false});
        };

        // results
        $scope.results = [];
        $http({method: 'GET', url: 'data/cis/Competitor_results.xlsx', responseType: 'arraybuffer'}).then(function(response) {
            $scope.results = $scope.loadExcel(response.data);
            $scope.buildScreens();
        });

        // best of nations
        $scope.resultsBestOfNations = [];
        $http({method: 'GET', url: 'data/cis/Best_of_Nation.xlsx', responseType: 'arraybuffer'}).then(function(response) {
            $scope.resultsBestOfNations = $scope.loadExcel(response.data);
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
            input = inputPieces.join(' ');

            inputPieces = input.split('-');
            for (var i = 0; i < inputPieces.length; i++){
                inputPieces[i] = $scope.capitalizeString(inputPieces[i]);
            }
            input = inputPieces.join('-');

            return input;
        };

        $scope.capitalizeString = function (inputString) {
            return inputString.substring(0, 1).toUpperCase() + inputString.substring(1);
        };

        $scope.simplifySkill = function (skill) {
            var s = {};
            s.name = skill.name.text.replace('â', 'a');
            s.number = skill.number;
            return s;
        };

        $scope.simplifyResult = function (result) {
            var r = {};
            r.position = result['Position'];
            if (result['Medal']) {
                r.medal = $scope.capitalize(result['Medal']);
            }
            r.member = result['Member Name'];
            r.memberCode = result['Member'];
            r.competitor= $scope.capitalize(result['First Name']) + ' ' + $scope.capitalize(result['Last Name']);
            return r;
        };

        $scope.buildScreens = function () {

            $scope.screens.a.slides = [];
            $scope.screens.b.slides = [];

            var previousSector = '';
            var c = 0;

            var empty = {
                label: '• Empty',
                template: 'empty.html',
                states: [],
                context: {}
            };

            var sectorsTotal = $scope.skills.reduce(function (accumulator, skill) {
              accumulator[skill.sector.id] = accumulator[skill.sector.id] + 1 || 1;
              return accumulator;
            }, {});

            var sectorCount = 0;

            // demo slides
            var slideCallup = {
                label: 'Demo Callup',
                template: 'skill_callup.html',
                states: ['Countries'],
                context: {
                    results: [{member: 'Country A', memberCode: 'WS'}, {member: 'Country B', memberCode: 'WS'}, {member: 'Country C', memberCode: 'WS'}],
                    skill: {name: 'Skill Name', number: '00'}
                }
            };
            var slideMedals = {
                label: 'Demo Medals',
                template: 'skill_medals.html',
                states: ['Bronze', 'Silver', 'Gold'],
                context: {
                    results: [{medal: 'Gold', memberCode: 'WS', competitors: ['Alice']}, {medal: 'Silver', memberCode: 'WS', competitors: ['Bob']}, {medal: 'Bronze', memberCode: 'WS', competitors: ['Eve']}],
                    skill: {name: 'Skill Name'},
                    total: 3
                }
            };
            $scope.screens.a.slides.push(angular.copy(slideCallup));
            $scope.screens.a.slides.push(angular.copy(slideMedals));
            $scope.screens.b.slides.push(angular.copy(slideCallup));
            $scope.screens.b.slides.push(angular.copy(slideMedals));

            // slides for Skills
            angular.forEach($scope.skills, function(skill, i) {

                sectorCount += 1;

                // check sector
                var currentSector = skill.sector.name.text;
                if (currentSector != previousSector) {
                    previousSector = currentSector;
                    $scope.screens.a.slides.push(angular.copy(empty));
                    $scope.screens.b.slides.push(angular.copy(empty));
                    sectorCount = 1;
                } else {
    
                    // check large sectors
                    if (sectorsTotal[skill.sector.id] >= 12 && sectorCount > sectorsTotal[skill.sector.id] / 2) {
                        $scope.screens.a.slides.push(angular.copy(empty));
                        $scope.screens.b.slides.push(angular.copy(empty));

                        // set to zero for last skill in sector
                        sectorCount = 0;
                    }

                }

                // find results for skill
                var results = Object.values($scope.results
                    .filter(function (result) { return result['Skill Number'] == skill.number && result['Medal'] && result['Medal'] != 'Medallion For Excellence'; })
                    .reduce(function (accumulator, result) {
                        var resultSimplified = $scope.simplifyResult(result);
                        if (typeof accumulator[result['Member']] == 'undefined') {
                            accumulator[result['Member']] = resultSimplified;
                            accumulator[result['Member']].competitors = [];
                        }
                        accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                        return accumulator;
                    }, {}));

                // prepare medals states and competitors total
                var states = [];
                var total = 0;
                angular.forEach(results, function(result, i) {
                    if (states.indexOf(result.medal) < 0) {
                        states.unshift(result.medal);
                    }
                    total += result.competitors.length;
                });

                var slideCallup = {
                    label: skill.name.text + ' Callup',
                    template: 'skill_callup.html',
                    states: ['Countries'],
                    context: {
                        results: $filter('orderBy')(results, 'member'),
                        skill: $scope.simplifySkill(skill)
                    }
                };
                var slideMedals = {
                    label: skill.name.text + ' Medals',
                    template: 'skill_medals.html',
                    states: states,
                    context: {
                        results: $filter('orderBy')(results, ['position', 'member']),
                        skill: $scope.simplifySkill(skill),
                        total: total
                    }
                };

                if (c++ % 2 == 0) {
                    $scope.screens.b.slides.push(slideCallup);
                    $scope.screens.b.slides.push(slideMedals);
                } else {
                    $scope.screens.a.slides.push(slideCallup);
                    $scope.screens.a.slides.push(slideMedals);
                }
            });

            $scope.screens.a.slides.push(angular.copy(empty));
            $scope.screens.b.slides.push(angular.copy(empty));

            // find results for Best of Nation
            var resultsBestOfNationMembers = [];
            var resultBestOfNationHost;
            angular.forEach($scope.members, function(member, j) {
                var memberResult = $scope.resultsBestOfNations
                    .filter(function (result) { return result['Member Name'] && result['Member'] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push($scope.capitalize(result['First Name']) + ' ' + $scope.capitalize(result['Last Name']));
                        return accumulator;
                    }, {memberCode: member.code, memberName: member.name.text, competitors: []});

                if (memberResult.competitors.length > 0) {
                    if (member.code != 'RU') {
                        resultsBestOfNationMembers.push(memberResult);
                    } else {
                        resultBestOfNationHost = memberResult;
                    }
                }
            });

            var c = 0;

            // slides for Best of Nation
            for (var i = 1; i <= 99 && resultsBestOfNationMembers.length > 0; i++) {

                var resultsBestOfNationSlice = resultsBestOfNationMembers.splice(0, 5);
                var states = [];
                angular.forEach(resultsBestOfNationSlice, function(result, i) {
                    states.push(i + 1);
                });

                var slide = {
                    label: 'Best of Nation ' + i,
                    template: 'best_of_nation.html',
                    states: states,
                    context: {
                        results: resultsBestOfNationSlice,
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
                template: 'best_of_nation_host.html',
                states: ['Name'],
                context: {
                    results: [resultBestOfNationHost],
                }
            };

            $scope.screens.a.slides.push(slide);
            $scope.screens.b.slides.push(angular.copy(slide));

            $scope.screens.a.slides.push(angular.copy(empty));
            $scope.screens.b.slides.push(angular.copy(empty));

            // find results for Albert Vidal Award
            var maxResult = Math.max.apply(Math, $scope.results.map(function (result) { return result['WorldSkills Scale Score']; }));
            var resultsAlbertVidalAward = Object.values($scope.results
                .filter(function (result) { return result['WorldSkills Scale Score'] == maxResult; })
                .reduce(function (accumulator, result) {
                    var resultSimplified = $scope.simplifyResult(result);
                    if (typeof accumulator[result['Member']] == 'undefined') {
                        accumulator[result['Member']] = resultSimplified;
                        accumulator[result['Member']].competitors = [];
                    }
                    accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                    return accumulator;
                }, {}));

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

            $scope.screens.a.slides.push(angular.copy(empty));
            $scope.screens.b.slides.push(angular.copy(empty));
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
