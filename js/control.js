(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, SCREENS) {

        $scope.uploaded = false;

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
        });

        $scope.upload = function (file) {
            $scope.uploaded = true;
            file.arrayBuffer().then(function (buffer) {
                var data = new Uint8Array(buffer);
                $scope.results = $scope.loadExcel(data);
                $scope.$apply(function () {
                    $scope.buildScreens();
                });
            });
        };

        $scope.loadExcel = function (data) {
            var wb = XLSX.read(data, {type:'array'});

            var wsname = wb.SheetNames[0];
            var ws = wb.Sheets[wsname];

            return XLSX.utils.sheet_to_json(ws, {raw:false});
        };

        // results
        $scope.results = [];
        // $http({method: 'GET', url: 'data/cis/Competitor_results.xlsx', responseType: 'arraybuffer'}).then(function(response) {
        //     $scope.results = $scope.loadExcel(response.data);
        //     $scope.buildScreens();
        // });

        // best of nations
        $scope.resultsBestOfNations = [];
        // $http({method: 'GET', url: 'data/cis/Best_of_Nation.xlsx', responseType: 'arraybuffer'}).then(function(response) {
        //     $scope.resultsBestOfNations = $scope.loadExcel(response.data);
        //     $scope.buildScreens();
        // });

        // screens
        $scope.screens = SCREENS;

        // clear local storage
        angular.forEach($scope.screens, function(config, screen) {
            window.localStorage.removeItem('screen-' + screen);
        });

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
            r.score = result['WorldSkills Scale Score'];
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

            var empty = {
                label: '• Empty',
                template: 'intro.html',
                states: [],
                context: {}
            };
            $scope.screens.a.slides.push(angular.copy(empty));

            // intro slide
            var slideIntro = {
                label: 'Intro',
                template: 'intro.html',
                states: [],
                context: {}
            };
            //$scope.screens.a.slides.push(slideIntro);

            // demo slides
            var slideCallup1 = {
                label: 'Demo Callup',
                template: 'skill_callup.html',
                states: ['Countries'],
                context: {
                    results: [{member: 'Country A', memberCode: 'WS'}, {member: 'Country B', memberCode: 'WS'}, {member: 'Country C', memberCode: 'WS'}],
                    skill: {name: 'Skill 1', number: '00'}
                }
            };
            var slideMedals1 = {
                label: 'Demo - Medals',
                template: 'skill_medals.html',
                states: ['Bronze', 'Silver', 'Gold'],
                context: {
                    results: [{medal: 'Gold', memberCode: 'WS', competitors: ['First Name Last Name']}, {medal: 'Silver', memberCode: 'WS', competitors: ['First Name Last Name']}, {medal: 'Bronze', memberCode: 'WS', competitors: ['First Name Last Name']}],
                    skill: {name: 'Skill 1'},
                    max: 23
                }
            };
            var slideMedallionForExcellence1 = {
                label: 'Demo - Medallion for Excellence',
                template: 'medallion_for_excellence.html',
                states: ['Name'],
                context: {
                    results: [{memberCode: 'WS', competitors: ['First Name Last Name']}, {memberCode: 'WS', competitors: ['First Name Last Name']}, {memberCode: 'WS', competitors: ['First Name Last Name']}],
                    skill: {name: 'Skill 1'},
                    total: 69
                }
            };
            //$scope.screens.a.slides.push(slideCallup1);
            //$scope.screens.a.slides.push(slideMedals1);
            //$scope.screens.a.slides.push(slideMedallionForExcellence1);

            // slides for Skills
            angular.forEach($scope.skills, function(skill, i) {

                // find results for skill
                var skillResults = Object.values($scope.results
                    .filter(function (result) { return result['Skill Number'] == skill.number; }));

                var results = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'] != 'Medallion for Excellence'; })
                    .reduce(function (accumulator, result) {
                        var resultSimplified = $scope.simplifyResult(result);
                        if (typeof accumulator[result['Member']] == 'undefined') {
                            accumulator[result['Member']] = resultSimplified;
                            accumulator[result['Member']].competitors = [];
                        }
                        accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                        return accumulator;
                    }, {}));

                if (results.length > 0) {
                    // prepare medals states and competitors max length
                    var states = [];
                    var max = 0;
                    angular.forEach(results, function(result, i) {
                        if (states.indexOf(result.medal) < 0) {
                            states.unshift(result.medal);
                        }
                        max = Math.max(max, result.competitors.join(', ').length);
                    });

                    var slideCallup = {
                        label: skill.name.text + ' - Callup',
                        template: 'skill_callup.html',
                        states: ['Countries'],
                        context: {
                            results: $filter('orderBy')(results, 'member'),
                            skill: $scope.simplifySkill(skill)
                        }
                    };
                    var slideMedals = {
                        label: skill.name.text + ' - Medals',
                        template: 'skill_medals.html',
                        states: states,
                        context: {
                            results: $filter('orderBy')(results, ['-score', 'member']),
                            skill: $scope.simplifySkill(skill),
                            max: max
                        }
                    };

                    // prepare medals for script
                    var scriptMedals = 'And here are the Medallists for ' + skill.name.text + ':\n\n';
                    var scriptMedalsResults = {};
                    angular.forEach(slideMedals.context.results.slice().reverse(), function(result) {
                        if (typeof scriptMedalsResults[result.medal] == 'undefined') {
                            scriptMedalsResults[result.medal] = [];
                        }
                        scriptMedalsResults[result.medal].push(result);
                    });
                    for (var medal in scriptMedalsResults) {
                        scriptMedals += 'The ' + medal + ' medal goes to:\n';
                        angular.forEach(scriptMedalsResults[medal], function(result) {
                            scriptMedals += result.competitors.join(' and ');
                            scriptMedals += ', ' + result.member + '\n';
                        });
                        scriptMedals += '\n';
                    }
                    scriptMedals += 'Congratulations to all of you!';
                    slideMedals.script = scriptMedals;

                    $scope.screens.a.slides.push(slideCallup);
                    $scope.screens.a.slides.push(slideMedals);
                }

                // find results for Medallion for Excellence
                var resultsMedallionForExcellence = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'] == 'Medallion for Excellence'; })
                    .reduce(function (accumulator, result) {
                        var resultSimplified = $scope.simplifyResult(result);
                        if (typeof accumulator[result['Member']] == 'undefined') {
                            accumulator[result['Member']] = resultSimplified;
                            accumulator[result['Member']].competitors = [];
                        }
                        accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                        return accumulator;
                    }, {}));

                if (resultsMedallionForExcellence.length > 0) {

                    var total = 0;
                    angular.forEach(resultsMedallionForExcellence, function(result, i) {
                        total += result.competitors.join(', ').length;
                    });

                    // slides for Medallion for Excellence
                    var slide = {
                        label: skill.name.text + ' - Medallion for Excellence',
                        template: 'medallion_for_excellence.html',
                        states: ['Name'],
                        context: {
                            results: $filter('orderBy')(resultsMedallionForExcellence, ['-score', 'member']),
                            skill: $scope.simplifySkill(skill),
                            total: total
                        }
                    };

                    // prepare script
                    var script = 'And the Medallion(s) for Excellence for ' + skill.name.text + ' go to:\n\n';
                    angular.forEach(slide.context.results, function(result, i) {
                        script += result.competitors.join(' and ');
                        script += ', ' + result.member + '\n';
                    });
                    script += '\nCongratulations!';
                    slide.script = script;

                    $scope.screens.a.slides.push(slide);
                }

                if (skillResults.length > 0) {
                    $scope.screens.a.slides.push(angular.copy(empty));
                }
            });

            // find results for Best of Nation
            var resultsBestOfNationMembers = [];
            angular.forEach($scope.members, function(member, j) {
                var memberResult = $scope.resultsBestOfNations
                    .filter(function (result) { return result['Member Name'] && result['Member'] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push($scope.capitalize(result['First Name']) + ' ' + $scope.capitalize(result['Last Name']));
                        return accumulator;
                    }, {memberCode: member.code, memberName: member.name.text, competitors: []});

                if (memberResult.competitors.length > 0) {
                    resultsBestOfNationMembers.push(memberResult);
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

                //$scope.screens.a.slides.push(slide);
            }

            //$scope.screens.a.slides.push(angular.copy(empty));

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
            //$scope.screens.a.slides.push(slide);

            //$scope.screens.a.slides.push(angular.copy(empty));
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

        $scope.copyPaste = function ($event, text) {
            $event.stopPropagation();

            navigator.permissions.query({name: 'clipboard-write'}).then((result) => {
                if (result.state === 'granted' || result.state === 'prompt') {
                    navigator.clipboard.writeText(text).then(() => {
                        $event.target.style.color = '#379d44';
                    }, () => {
                        alert('Failed to paste to clipboard.')
                    });
                }
            });
        }
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
