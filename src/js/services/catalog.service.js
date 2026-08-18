(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Catalog', function ($filter, ResultFormat, SLIDE_KEYS, EXCEL_COLUMNS, ALBERT_VIDAL_AWARD_LABEL) {

        function groupByMember(filteredResults) {
            return Array.from(filteredResults.reduce(function (accumulator, result) {
                var resultSimplified = ResultFormat.simplifyResult(result);
                // A missing member code must not merge unrelated winners; Map also makes
                // prototype-like codes such as "__proto__" safe.
                var memberCode = result[EXCEL_COLUMNS.MEMBER];
                var key = memberCode ? String(memberCode) : '__missing__' + accumulator.size;
                if (!accumulator.has(key)) {
                    resultSimplified.competitors = [];
                    accumulator.set(key, resultSimplified);
                }
                accumulator.get(key).competitors.push(resultSimplified.competitor);
                return accumulator;
            }, new Map()).values());
        }

        function build(input) {
            var skills = input.skills || [];
            var members = input.members || [];
            var rawResults = input.results || [];
            var results = rawResults.filter(function (result) {
                return result && result[EXCEL_COLUMNS.FIRST_NAME] && result[EXCEL_COLUMNS.LAST_NAME];
            });
            var resultsBestOfNations = input.bestOfNation || [];
            var bestOfNationGroupSize = input.bestOfNationGroupSize > 0 ? input.bestOfNationGroupSize : 5;

            var catalog = {};

            var skippedRows = rawResults.length - results.length;

            angular.forEach(skills, function (skill, i) {

                var skillResults = Object.values(results
                    .filter(function (result) {
                        return ResultFormat.normalizeSkillNum(result[EXCEL_COLUMNS.SKILL_NUMBER]) === ResultFormat.normalizeSkillNum(skill.number);
                    }));

                /**
                 * Medal results (Gold, Silver, Bronze) calculation
                 */

                var skillMedalResults = groupByMember(
                    skillResults
                        .filter(function (result) { return result[EXCEL_COLUMNS.MEDAL] && result[EXCEL_COLUMNS.MEDAL].toUpperCase() != 'MEDAL FOR EXCELLENCE'; })
                );

                if (skillMedalResults.length > 0) {
                    var states = [];
                    angular.forEach(skillMedalResults, function (result, i) {
                        if (states.indexOf(result.medal) < 0) {
                            states.unshift(result.medal);
                        }
                    });
                    var slideCallup = {
                        label: skill.name.text + ' - Callup',
                        template: 'skill_callup.html',
                        states: ['Countries'],
                        context: {
                            results: $filter('orderBy')(skillMedalResults, 'member'),
                            skill: ResultFormat.simplifySkill(skill)
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

                    // Create script:
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

                // Medal for Excellence calculation

                var resultsMedalForExcellence = groupByMember(
                    skillResults
                        .filter(function (result) { return result[EXCEL_COLUMNS.MEDAL] && result[EXCEL_COLUMNS.MEDAL].toUpperCase() == 'MEDAL FOR EXCELLENCE'; })
                );

                if (resultsMedalForExcellence.length > 0) {
                    var total = 0;
                    angular.forEach(resultsMedalForExcellence, function (result, i) {
                        total += ResultFormat.competitorsOf(result).length;
                    });

                    total = total || 1;

                    var slideMfe = {
                        label: skill.name.text + ' - Medal for Excellence',
                        template: 'medal_for_excellence.html',
                        states: ['Name'],
                        context: {
                            results: $filter('orderBy')(resultsMedalForExcellence, ['-score', 'member']),
                            skill: ResultFormat.simplifySkill(skill),
                            total: total
                        }
                    };

                    // Create script:

                    var script = 'And the Medal(s) for Excellence for ' + skill.name.text + ' go to:\n\n';
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

            /**
             * Best of nation slides
             */

            var resultsBestOfNationMembers = [];
            angular.forEach(members, function (member) {
                var memberResult = (resultsBestOfNations || [])
                    .filter(function (result) { return result && result[EXCEL_COLUMNS.MEMBER_NAME] && result[EXCEL_COLUMNS.FIRST_NAME] && result[EXCEL_COLUMNS.LAST_NAME] && result[EXCEL_COLUMNS.MEMBER] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push(ResultFormat.capitalize(result[EXCEL_COLUMNS.FIRST_NAME]) + ' ' + ResultFormat.capitalize(result[EXCEL_COLUMNS.LAST_NAME]));
                        return accumulator;
                    }, { memberCode: member.code, memberName: member.name.text, competitors: [] });

                if (memberResult.competitors.length > 0) {
                    resultsBestOfNationMembers.push(memberResult);
                }
            });

            if (resultsBestOfNationMembers.length > 0) {
                var bestOfNationSlides = [];
                for (var bon = 1; bon <= 99 && resultsBestOfNationMembers.length > 0; bon++) {
                    var bestOfNationSlice = resultsBestOfNationMembers.splice(0, bestOfNationGroupSize);
                    var slideBon = {
                        label: 'Best of Nation ' + bon,
                        template: 'best_of_nation.html',
                        states: ['Name'],
                        context: {
                            results: bestOfNationSlice
                        }
                    };
                    bestOfNationSlides.push(slideBon);
                }
                catalog[SLIDE_KEYS.BEST_OF_NATION] = bestOfNationSlides;
            }

            // Parse scores numerically, ignoring blank/non-numeric cells so one bad cell can't poison Math.max into NaN.
            var numericScores = results
                .map(function (result) { return parseFloat(result[EXCEL_COLUMNS.SCALE_SCORE]); })
                .filter(function (n) { return !isNaN(n); });

            var maxResult = numericScores.length ? Math.max.apply(Math, numericScores) : null;

            // Create Albert Vidal Reward slide

            var resultsAlbertVidalAward = maxResult === null ? [] : groupByMember(results
                .filter(function (result) {
                    return parseFloat(result[EXCEL_COLUMNS.SCALE_SCORE]) === maxResult;
                }));

            var slideAlbertVidal = {
                label: ALBERT_VIDAL_AWARD_LABEL,
                template: 'albert_vidal_award.html',
                states: ['Name'],
                context: {
                    results: $filter('orderBy')(resultsAlbertVidalAward, 'member'),
                }
            };
            catalog[SLIDE_KEYS.ALBERT_VIDAL] = [slideAlbertVidal];

            return { slides: catalog, skippedRows: skippedRows };
        }

        return { build: build };
    });

})();
