(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Catalog', function ($filter, ResultFormat, TextFit) {

        // input: {skills, members, results, bestOfNation}
        // returns: {slides: catalog, skippedRows: count}
        function build(input) {
            var skills = input.skills || [];
            var members = input.members || [];
            var results = input.results || [];
            var resultsBestOfNations = input.bestOfNation || [];

            var catalog = {};

            // Track rows with incomplete competitor names so the import can warn
            // the operator instead of silently dropping or mis-rendering them.
            var skippedRows = results.filter(function (result) {
                return !result['First Name'] || !result['Last Name'];
            }).length;

            var empty = {
                label: '• Empty',
                template: 'intro.html',
                states: [],
                context: {}
            };
            catalog['__empty__'] = angular.copy(empty);

            angular.forEach(skills, function (skill, i) {

                var skillResults = Object.values(results
                    .filter(function (result) {
                        return ResultFormat.normalizeSkillNum(result['Skill Number']) === ResultFormat.normalizeSkillNum(skill.number);
                    }));

                var skillMedalResults = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'].toUpperCase() != 'MEDALLION FOR EXCELLENCE'; })
                    .reduce(function (accumulator, result) {
                        var resultSimplified = ResultFormat.simplifyResult(result);
                        if (typeof accumulator[result['Member']] == 'undefined') {
                            accumulator[result['Member']] = resultSimplified;
                            accumulator[result['Member']].competitors = [];
                        }
                        accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                        return accumulator;
                    }, {}));

                if (skillMedalResults.length > 0) {
                    var states = [];
                    angular.forEach(skillMedalResults, function (result, i) {
                        if (states.indexOf(result.medal) < 0) {
                            states.unshift(result.medal);
                        }
                    });
                    // Each competitor row sizes its own font from its own name
                    // length (see .screen-grid .screen-medal in screen.css) —
                    // the results grid can spare one extra line per row. The
                    // call-up row has height for three lines under the flags.
                    TextFit.annotateEach(skillMedalResults, ResultFormat.competitorsOf, 2, 'nameChars', 'nameWrapped');
                    var memberSize = TextFit.measureLongest(skillMedalResults, function (result) { return result.member; }, 3);

                    var slideCallup = {
                        label: skill.name.text + ' - Callup',
                        template: 'skill_callup.html',
                        states: ['Countries'],
                        context: {
                            results: $filter('orderBy')(skillMedalResults, 'member'),
                            skill: ResultFormat.simplifySkill(skill),
                            // Longest country name, on one line and wrapped over
                            // three — sizes the call-up row (see .screen-table-countries).
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

                var resultsMedallionForExcellence = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'].toUpperCase() == 'MEDALLION FOR EXCELLENCE'; })
                    .reduce(function (accumulator, result) {
                        var resultSimplified = ResultFormat.simplifyResult(result);
                        if (typeof accumulator[result['Member']] == 'undefined') {
                            accumulator[result['Member']] = resultSimplified;
                            accumulator[result['Member']].competitors = [];
                        }
                        accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                        return accumulator;
                    }, {}));

                if (resultsMedallionForExcellence.length > 0) {
                    var total = 0;
                    angular.forEach(resultsMedallionForExcellence, function (result, i) {
                        total += ResultFormat.competitorsOf(result).length;
                    });
                    // Never 0 — a blank name must not turn a "width / chars"
                    // font-size formula into a NaN/Infinity value.
                    total = total || 1;
                    // Each row sizes its own font from its own name length
                    // (see .screen-grid .screen-medal in screen.css).
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

            // Best of Nation — group the imported Best of Nation rows by member
            // (using the member catalog for display names), keep members that have
            // at least one competitor, and split them into slides of five nations.
            var resultsBestOfNationMembers = [];
            angular.forEach(members, function (member) {
                var memberResult = (resultsBestOfNations || [])
                    .filter(function (result) { return result['Member Name'] && result['Member'] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push(ResultFormat.capitalize(result['First Name']) + ' ' + ResultFormat.capitalize(result['Last Name']));
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
                catalog['__bestOfNation__'] = bestOfNationSlides;
            }

            // Albert Vidal Award — highest WorldSkills Scale Score.
            // Parse scores numerically and ignore blank/non-numeric cells so a
            // single empty score cannot poison the maximum (NaN) and blank the list.
            var numericScores = results
                .map(function (result) { return parseFloat(result['WorldSkills Scale Score']); })
                .filter(function (n) { return !isNaN(n); });
            var maxResult = numericScores.length ? Math.max.apply(Math, numericScores) : null;
            var resultsAlbertVidalAward = maxResult === null ? [] : Object.values(results
                .filter(function (result) { return parseFloat(result['WorldSkills Scale Score']) === maxResult; })
                .reduce(function (accumulator, result) {
                    var resultSimplified = ResultFormat.simplifyResult(result);
                    if (typeof accumulator[result['Member']] == 'undefined') {
                        accumulator[result['Member']] = resultSimplified;
                        accumulator[result['Member']].competitors = [];
                    }
                    accumulator[result['Member']].competitors.push(resultSimplified.competitor);
                    return accumulator;
                }, {}));

            catalog['__albertVidal__'] = [{
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
