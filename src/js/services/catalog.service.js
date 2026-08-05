(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Catalog', function ($filter, ResultFormat, TextFit, SLIDE_KEYS) {

        var COL = {
            MEMBER: 'Member',
            MEMBER_NAME: 'Member Name',
            SKILL_NUMBER: 'Skill Number',
            MEDAL: 'Medal',
            FIRST_NAME: 'First Name',
            LAST_NAME: 'Last Name',
            SCALE_SCORE: 'WorldSkills Scale Score'
        };

        function groupByMember(filteredResults) {
            return Object.values(filteredResults.reduce(function (accumulator, result) {
                var resultSimplified = ResultFormat.simplifyResult(result);
                if (typeof accumulator[result[COL.MEMBER]] == 'undefined') {
                    accumulator[result[COL.MEMBER]] = resultSimplified;
                    accumulator[result[COL.MEMBER]].competitors = [];
                }
                accumulator[result[COL.MEMBER]].competitors.push(resultSimplified.competitor);
                return accumulator;
            }, {}));
        }

        function build(input) {
            var skills = input.skills || [];
            var members = input.members || [];
            var results = input.results || [];
            var resultsBestOfNations = input.bestOfNation || [];

            var catalog = {};

            var skippedRows = results.filter(function (result) {
                return !result[COL.FIRST_NAME] || !result[COL.LAST_NAME];
            }).length;

            var empty = {
                label: '• Empty',
                template: 'intro.html',
                states: [],
                context: {}
            };
            catalog[SLIDE_KEYS.EMPTY] = angular.copy(empty);

            angular.forEach(skills, function (skill, i) {

                var skillResults = Object.values(results
                    .filter(function (result) {
                        return ResultFormat.normalizeSkillNum(result[COL.SKILL_NUMBER]) === ResultFormat.normalizeSkillNum(skill.number);
                    }));

                var skillMedalResults = groupByMember(skillResults
                    .filter(function (result) { return result[COL.MEDAL] && result[COL.MEDAL].toUpperCase() != 'MEDALLION FOR EXCELLENCE'; }));

                if (skillMedalResults.length > 0) {
                    var states = [];
                    angular.forEach(skillMedalResults, function (result, i) {
                        if (states.indexOf(result.medal) < 0) {
                            states.unshift(result.medal);
                        }
                    });
                    // Per-row sizing (2-line max): medal grid rows can spare a line; callup rows get 3 (see .screen-medal in screen.css).
                    TextFit.annotateEach(skillMedalResults, ResultFormat.competitorsOf, 2, 'nameChars', 'nameWrapped');
                    var memberSize = TextFit.measureLongest(skillMedalResults, function (result) { return result.member; }, 3);

                    var slideCallup = {
                        label: skill.name.text + ' - Callup',
                        template: 'skill_callup.html',
                        states: ['Countries'],
                        context: {
                            results: $filter('orderBy')(skillMedalResults, 'member'),
                            skill: ResultFormat.simplifySkill(skill),
                            // Longest member name (1-line / 3-line wrap) sizes the call-up row (see .screen-table-countries).
                            maxMemberLen: memberSize.chars,
                            maxMemberWrap: memberSize.wrapped
                        }
                    };
                    var slideMedals = {
                        label: skill.name.text + ' - Medals',
                        template: 'skill_medals.html',
                        states: states,
                        context: {
                            results: $filter('orderBy')(skillMedalResults, ['-score', 'member']),
                            skill: ResultFormat.simplifySkill(skill)
                        }
                    };

                    var scriptMedals = 'And here are the Medallists for ' + skill.name.text + ':\n\n';
                    var scriptMedalsResults = {};
                    angular.forEach(slideMedals.context.results.slice().reverse(), function (result) {
                        if (typeof scriptMedalsResults[result.medal] == 'undefined') {
                            scriptMedalsResults[result.medal] = [];
                        }
                        scriptMedalsResults[result.medal].push(result);
                    });
                    for (var medal in scriptMedalsResults) {
                        scriptMedals += 'The ' + medal + ' medal goes to:\n';
                        angular.forEach(scriptMedalsResults[medal], function (result) {
                            scriptMedals += result.competitors.join(' and ');
                            scriptMedals += ', ' + result.member + '\n';
                        });
                        scriptMedals += '\n';
                    }
                    scriptMedals += 'Congratulations to all of you!';
                    slideMedals.script = scriptMedals;

                    if (!catalog[skill.number]) catalog[skill.number] = [];
                    catalog[skill.number].push(slideCallup);
                    catalog[skill.number].push(slideMedals);
                }

                var resultsMedallionForExcellence = groupByMember(skillResults
                    .filter(function (result) { return result[COL.MEDAL] && result[COL.MEDAL].toUpperCase() == 'MEDALLION FOR EXCELLENCE'; }));

                if (resultsMedallionForExcellence.length > 0) {
                    var total = 0;
                    angular.forEach(resultsMedallionForExcellence, function (result, i) {
                        total += ResultFormat.competitorsOf(result).length;
                    });
                    // Never 0 — a blank name must not turn a "width / chars" formula into NaN/Infinity.
                    total = total || 1;
                    // Per-row sizing, not per-slide (see .screen-medal in screen.css).
                    TextFit.annotateEach(resultsMedallionForExcellence, ResultFormat.competitorsOf, 2, 'nameChars', 'nameWrapped');

                    var slideMfe = {
                        label: skill.name.text + ' - Medallion for Excellence',
                        template: 'medallion_for_excellence.html',
                        states: ['Name'],
                        context: {
                            results: $filter('orderBy')(resultsMedallionForExcellence, ['-score', 'member']),
                            skill: ResultFormat.simplifySkill(skill),
                            total: total
                        }
                    };

                    var script = 'And the Medallion(s) for Excellence for ' + skill.name.text + ' go to:\n\n';
                    angular.forEach(slideMfe.context.results, function (result, i) {
                        script += result.competitors.join(' and ');
                        script += ', ' + result.member + '\n';
                    });
                    script += '\nCongratulations!';
                    slideMfe.script = script;

                    if (!catalog[skill.number]) catalog[skill.number] = [];
                    catalog[skill.number].push(slideMfe);
                }
            });

            var resultsBestOfNationMembers = [];
            angular.forEach(members, function (member) {
                var memberResult = (resultsBestOfNations || [])
                    .filter(function (result) { return result[COL.MEMBER_NAME] && result[COL.MEMBER] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push(ResultFormat.capitalize(result[COL.FIRST_NAME]) + ' ' + ResultFormat.capitalize(result[COL.LAST_NAME]));
                        return accumulator;
                    }, { memberCode: member.code, memberName: member.name.text, competitors: [] });

                if (memberResult.competitors.length > 0) {
                    resultsBestOfNationMembers.push(memberResult);
                }
            });

            if (resultsBestOfNationMembers.length > 0) {
                var bestOfNationSlides = [];
                for (var bon = 1; bon <= 99 && resultsBestOfNationMembers.length > 0; bon++) {
                    var bestOfNationSlice = resultsBestOfNationMembers.splice(0, 5);
                    var bestOfNationStates = [];
                    angular.forEach(bestOfNationSlice, function (result, si) {
                        bestOfNationStates.push(si + 1);
                    });
                    bestOfNationSlides.push({
                        label: 'Best of Nation ' + bon,
                        template: 'best_of_nation.html',
                        states: bestOfNationStates,
                        context: {
                            results: bestOfNationSlice
                        }
                    });
                }
                catalog[SLIDE_KEYS.BEST_OF_NATION] = bestOfNationSlides;
            }

            // Parse scores numerically, ignoring blank/non-numeric cells so one bad cell can't poison Math.max into NaN.
            var numericScores = results
                .map(function (result) { return parseFloat(result[COL.SCALE_SCORE]); })
                .filter(function (n) { return !isNaN(n); });
            var maxResult = numericScores.length ? Math.max.apply(Math, numericScores) : null;
            var resultsAlbertVidalAward = maxResult === null ? [] : groupByMember(results
                .filter(function (result) { return parseFloat(result[COL.SCALE_SCORE]) === maxResult; }));

            catalog[SLIDE_KEYS.ALBERT_VIDAL] = [{
                label: 'Albert Vidal Award',
                template: 'albert_vidal_award.html',
                states: ['Name'],
                context: {
                    results: $filter('orderBy')(resultsAlbertVidalAward, 'member'),
                }
            }];

            return { slides: catalog, skippedRows: skippedRows };
        }

        return { build: build };
    });

})();
