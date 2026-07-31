(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $filter, $timeout, $q, SCREENS, TEMPLATE_BASE, FrameService, DevSession) {

        $scope.uploaded = false;
        $scope.FrameService = FrameService;
        $scope.projectDirty = false;

        // Development flags, surfaced as navbar badges (see control.html).
        $scope.dev = {
            enabled: DevSession.enabled,
            forceDefaultTemplate: DevSession.forceDefaultTemplate
        };

        // ── Notification banner ────────────────────────────────────
        $scope.notices = [];

        $scope.addNotice = function (level, text, key) {
            // De-duplicate by key so repeated failures don't stack.
            if (key) {
                $scope.notices = $scope.notices.filter(function (n) { return n.key !== key; });
            }
            var notice = { level: level, text: text, key: key || null };
            $scope.notices.push(notice);
            if (level === 'info') {
                $timeout(function () { $scope.dismissNotice(notice); }, 6000);
            }
            return notice;
        };

        $scope.dismissNotice = function (notice) {
            var idx = $scope.notices.indexOf(notice);
            if (idx >= 0) $scope.notices.splice(idx, 1);
        };

        // ── Display list (for per-frame monitor assignment) ────────────
        $scope.displays = [];
        if (window.ceremonator && window.ceremonator.displays) {
            window.ceremonator.displays.list().then(function (list) {
                $scope.$apply(function () {
                    $scope.displays = (list || []).map(function (d, i) {
                        return { index: i, label: d.label || ('Display ' + (i + 1)) };
                    });
                });
            });
        }

        $scope.frameMonitorChanged = function () {
            $scope.projectDirty = true;
        };

        // NOTE: There is intentionally no autosave-on-close. Saving is an
        // explicit action (Project → Save). The Home button warns before
        // discarding unsaved changes (see exitToStartup).

        // Keyboard navigation: ←/→ drive prev/next on the active frame for
        // faster live operation. Ignored while typing in a field.
        window.addEventListener('keydown', function (e) {
            var target = e.target || {};
            var tag = (target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                $scope.$apply(function () { $scope.nextSlide(); });
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                $scope.$apply(function () { $scope.prevSlide(); });
            }
        });

        $scope.update = function (screen) {
            var frame = $scope.screens[screen];
            var slide = frame.slide;
            if (typeof slide != 'undefined') {
                window.localStorage.setItem('screen-' + screen, angular.toJson({
                    template: TEMPLATE_BASE + slide.template,
                    context: slide.context,
                    state: slide.state,
                    label: slide.label || '',
                    frameLabel: frame.label || screen,
                    accent: FrameService.getFrameColor(screen)
                }));
            }
            $scope.projectDirty = true;
        };

        // skills
        $scope.skills = [];
        var skillsLoaded = $http({method: 'GET', url: 'data/json/skills.json'}).then(function(response) {
            if (!response.data || !response.data.skills) {
                $scope.addNotice('error', 'Skill catalog (data/json/skills.json) is missing its "skills" list. The app cannot build ceremonies.', 'skills-load');
                return;
            }
            $scope.skills = response.data.skills;
        }, function (error) {
            $scope.addNotice('error', 'Failed to load the skill catalog (data/json/skills.json). The app data may be missing from this build. Ceremonies cannot be built until this is resolved.', 'skills-load');
        });

        // members
        $scope.members = [];
        var membersLoaded = $http({method: 'GET', url: 'data/json/members.json'}).then(function(response) {
            $scope.members = (response.data && response.data.members) || [];
        }, function (error) {
            $scope.addNotice('warning', 'Failed to load the member list (data/json/members.json). Member names may be incomplete.', 'members-load');
        });

        function loadProjectConfig() {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.current) {
                return $q.resolve();
            }
            // $q.when bridges the preload promise into the digest, so no $apply.
            return $q.when(window.ceremonator.project.current()).then(function (result) {
                if (!result || !result.project) return;
                var project = result.project;
                $scope.projectName = project.name;
                $scope.displayMode = project.displayMode;
                if (project.gridConfig) {
                    $scope.gridConfig = angular.extend({}, $scope.gridConfig, project.gridConfig);
                }
                if (project.frames) {
                    FrameService.loadFromProject(project.frames);
                }
            });
        }

        // Best of Nation grouping in buildCatalog() reads $scope.members, so the
        // first build has to wait for both catalogs — not just the skills one.
        $q.all([skillsLoaded, membersLoaded])
            .then(loadProjectConfig)
            .then(restoreDevSession)
            .then(function (restored) {
                if (!restored) $scope.buildScreens();
            });

        $scope.upload = function (file) {
            if (!file) return;
            $scope.uploaded = true;
            file.arrayBuffer().then(function (buffer) {
                var data = new Uint8Array(buffer);
                $scope.results = $scope.loadExcel(data);
                $scope.$apply(function () {
                    if (!$scope.results || !$scope.results.length) {
                        $scope.uploaded = false;
                        $scope.addNotice('error', 'Import failed: no result rows were found in that file. Please import a valid WorldSkills results spreadsheet (.xlsx).', 'import');
                        return;
                    }
                    $scope.buildScreens(true);
                    $scope.reportImportSummary();
                    $scope.checkMissingFlags();
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.uploaded = false;
                    $scope.addNotice('error', 'Import failed: the file could not be read as a spreadsheet. Please import a valid WorldSkills results file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import');
                });
            });
        };

        // Warn (before the event) about medalist member codes that have no flag
        // image, so the missing flags can be sourced. On screen these fall back
        // to a neutral placeholder, so this is advisory, not blocking.
        $scope.checkMissingFlags = function () {
            if (!window.ceremonator || !window.ceremonator.flags || !window.ceremonator.flags.list) return;
            if (!$scope.catalog) return;
            var used = {};
            angular.forEach($scope.catalog, function (slides) {
                var list = angular.isArray(slides) ? slides : [slides];
                angular.forEach(list, function (slide) {
                    if (slide && slide.context && slide.context.results) {
                        angular.forEach(slide.context.results, function (result) {
                            if (result.memberCode) used[result.memberCode] = true;
                        });
                    }
                });
            });
            window.ceremonator.flags.list().then(function (available) {
                var have = {};
                angular.forEach(available || [], function (code) { have[code] = true; });
                var missing = Object.keys(used).filter(function (code) { return !have[code]; });
                if (missing.length) {
                    $scope.$apply(function () {
                        $scope.addNotice('warning', 'Missing flag image(s) for: ' + missing.sort().join(', ') +
                            '. These will show a placeholder on screen. Add the PNG(s) to data/flags/ before the event.', 'flags-missing');
                    });
                }
            });
        };

        // Summarize the most recent import: how many result rows were kept vs skipped.
        $scope.reportImportSummary = function () {
            var total = ($scope.results && $scope.results.length) || 0;
            var skipped = $scope.lastImportSkipped || 0;
            if (skipped > 0) {
                $scope.addNotice('warning', 'Imported ' + (total - skipped) + ' of ' + total + ' result rows. ' + skipped + ' row(s) were skipped because a competitor name was missing.', 'import');
            } else {
                $scope.addNotice('info', 'Imported ' + total + ' result rows successfully.', 'import');
            }
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

        // Import the Best of Nation spreadsheet as a separate file (its own
        // dataset, distinct from the competitor results). Rebuilds the catalog
        // and reassembles frames without redistributing skill ordering.
        $scope.uploadBestOfNation = function (file) {
            if (!file) return;
            file.arrayBuffer().then(function (buffer) {
                var data = new Uint8Array(buffer);
                var rows = $scope.loadExcel(data);
                $scope.$apply(function () {
                    if (!rows || !rows.length) {
                        $scope.addNotice('error', 'Import failed: no Best of Nation rows were found in that file. Please import a valid Best of Nation spreadsheet (.xlsx).', 'import-bon');
                        return;
                    }
                    $scope.resultsBestOfNations = rows;
                    $scope.buildScreens();
                    $scope.addNotice('info', 'Imported ' + rows.length + ' Best of Nation row(s).', 'import-bon');
                    $scope.checkMissingFlags();
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.addNotice('error', 'Import failed: the Best of Nation file could not be read as a spreadsheet. Please import a valid Best of Nation file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import-bon');
                });
            });
        };

        // screens
        $scope.screens = SCREENS;

        // Clear stale screen state left by a previous control session, so an open
        // screen window can't keep rendering content this session doesn't know
        // about. In dev this is deferred until we know there is no session to
        // restore — otherwise every hot reload would blank the screens it is
        // about to repopulate. See restoreDevSession().
        function clearScreenStorage() {
            angular.forEach($scope.screens, function(config, screen) {
                window.localStorage.removeItem('screen-' + screen);
            });
        }

        if (!DevSession.enabled) {
            clearScreenStorage();
        }

        $scope.capitalize = function (input) {

            if (input == null) return '';
            input = String(input).toLowerCase();

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

        // Normalize accented characters in skill names to their base letters.
        // Replaces the old single-character 'â'→'a' hack with consistent
        // Unicode (NFD) diacritic stripping.
        $scope.normalizeSkillName = function (text) {
            if (text == null) return '';
            return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        };

        $scope.simplifySkill = function (skill) {
            var s = {};
            s.name = $scope.normalizeSkillName(skill.name.text);
            s.number = skill.number;
            return s;
        };

        $scope.simplifyResult = function (result) {
            var r = {};
            r.position = result['Position'];
            r.score = result['WorldSkills Scale Score'];
            if (result['Medal']) {
                r.medal = $scope.capitalize(result['Medal'].trim());
            }
            r.member = result['Member Name'];
            r.memberCode = result['Member'];
            r.competitor= $scope.capitalize(result['First Name']) + ' ' + $scope.capitalize(result['Last Name']);
            return r;
        };

        // Normalize a skill number for comparison: strip leading zeros so "07" and "7" match.
        function normalizeSkillNum(n) {
            return String(n).trim().replace(/^0+(\d)/, '$1');
        }

        // Lines a column `width` characters wide takes to hold `words`, breaking
        // greedily at spaces — the same algorithm the browser uses.
        function greedyLineCount(words, width) {
            var lines = 1;
            var used = words[0].length;
            for (var i = 1; i < words.length; i++) {
                if (used + 1 + words[i].length <= width) {
                    used += 1 + words[i].length;
                } else {
                    lines++;
                    used = words[i].length;
                }
            }
            return lines;
        }

        // Narrowest column, in characters, that still holds `text` within
        // `maxLines` lines. A single word can't wrap, so it returns its own
        // length.
        //
        // The screens size their text from this: one very long name would
        // otherwise shrink every other name on the slide to fit itself on one
        // line — "Democratic Republic of the Congo" needs 32 characters on one
        // line but only 11 across three, which is 1.7x the font size.
        function narrowestColumn(text, maxLines) {
            var value = String(text == null ? '' : text);
            var words = value.split(' ').filter(function (word) { return !!word; });
            if (words.length < 2 || maxLines < 2) return value.length;

            // No column can be narrower than the longest single word.
            var low = 0;
            angular.forEach(words, function (word) { low = Math.max(low, word.length); });
            var high = value.length;
            while (low < high) {
                var mid = Math.floor((low + high) / 2);
                if (greedyLineCount(words, mid) <= maxLines) {
                    high = mid;
                } else {
                    low = mid + 1;
                }
            }
            return low;
        }

        // The longest of `results` under `measure`, on one line and wrapped over
        // `maxLines` — the pair of inputs every results layout needs. Never 0: a
        // blank name must not turn a "width / chars" formula into Infinity.
        function measureLongest(results, measure, maxLines) {
            var longest = 0;
            var longestWrapped = 0;
            angular.forEach(results, function (result) {
                var text = measure(result);
                longest = Math.max(longest, String(text || '').length);
                longestWrapped = Math.max(longestWrapped, narrowestColumn(text, maxLines));
            });
            return { chars: longest || 1, wrapped: longestWrapped || 1 };
        }

        function competitorsOf(result) {
            return result.competitors.join(', ');
        }

        $scope.buildCatalog = function () {
            var catalog = {};

            // Track rows with incomplete competitor names so the import can warn
            // the operator instead of silently dropping or mis-rendering them.
            $scope.lastImportSkipped = ($scope.results || []).filter(function (result) {
                return !result['First Name'] || !result['Last Name'];
            }).length;

            var empty = {
                label: '• Empty',
                template: 'intro.html',
                states: [],
                context: {}
            };
            catalog['__empty__'] = angular.copy(empty);

            angular.forEach($scope.skills, function(skill, i) {

                var skillResults = Object.values($scope.results
                    .filter(function (result) {
                        return normalizeSkillNum(result['Skill Number']) === normalizeSkillNum(skill.number);
                    }));

                var results = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'].toUpperCase() != 'MEDALLION FOR EXCELLENCE'; })
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
                    var states = [];
                    angular.forEach(results, function(result, i) {
                        if (states.indexOf(result.medal) < 0) {
                            states.unshift(result.medal);
                        }
                    });
                    // The results grid can spare one extra line per row; the
                    // call-up row has height for three lines under the flags.
                    var competitorSize = measureLongest(results, competitorsOf, 2);
                    var memberSize = measureLongest(results, function (result) { return result.member; }, 3);

                    var slideCallup = {
                        label: skill.name.text + ' - Callup',
                        template: 'skill_callup.html',
                        states: ['Countries'],
                        context: {
                            results: $filter('orderBy')(results, 'member'),
                            skill: $scope.simplifySkill(skill),
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
                            results: $filter('orderBy')(results, ['-score', 'member']),
                            skill: $scope.simplifySkill(skill),
                            // Longest competitor row, on one line and wrapped onto
                            // two — sizes the results grid (see .screen-grid).
                            max: competitorSize.chars,
                            maxWrap: competitorSize.wrapped
                        }
                    };

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

                    if (!catalog[skill.number]) catalog[skill.number] = [];
                    catalog[skill.number].push(slideCallup);
                    catalog[skill.number].push(slideMedals);
                }

                var resultsMedallionForExcellence = Object.values(skillResults
                    .filter(function (result) { return result['Medal'] && result['Medal'].toUpperCase() == 'MEDALLION FOR EXCELLENCE'; })
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
                        total += competitorsOf(result).length;
                    });
                    // Never 0 — a blank name must not turn a "width / chars"
                    // font-size formula into a NaN/Infinity value.
                    total = total || 1;
                    var mfeSize = measureLongest(resultsMedallionForExcellence, competitorsOf, 2);

                    var slideMfe = {
                        label: skill.name.text + ' - Medallion for Excellence',
                        template: 'medallion_for_excellence.html',
                        states: ['Name'],
                        context: {
                            results: $filter('orderBy')(resultsMedallionForExcellence, ['-score', 'member']),
                            skill: $scope.simplifySkill(skill),
                            total: total,
                            // Longest name row, on one line and wrapped onto two —
                            // sizes the results grid (see .screen-grid).
                            max: mfeSize.chars,
                            maxWrap: mfeSize.wrapped
                        }
                    };

                    var script = 'And the Medallion(s) for Excellence for ' + skill.name.text + ' go to:\n\n';
                    angular.forEach(slideMfe.context.results, function(result, i) {
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
            angular.forEach($scope.members, function (member) {
                var memberResult = ($scope.resultsBestOfNations || [])
                    .filter(function (result) { return result['Member Name'] && result['Member'] == member.code; })
                    .reduce(function (accumulator, result) {
                        accumulator.competitors.push($scope.capitalize(result['First Name']) + ' ' + $scope.capitalize(result['Last Name']));
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
            var numericScores = $scope.results
                .map(function (result) { return parseFloat(result['WorldSkills Scale Score']); })
                .filter(function (n) { return !isNaN(n); });
            var maxResult = numericScores.length ? Math.max.apply(Math, numericScores) : null;
            var resultsAlbertVidalAward = maxResult === null ? [] : Object.values($scope.results
                .filter(function (result) { return parseFloat(result['WorldSkills Scale Score']) === maxResult; })
                .reduce(function (accumulator, result) {
                    var resultSimplified = $scope.simplifyResult(result);
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

            return catalog;
        };

        $scope.assembleFrame = function (frame, catalog) {
            // Remember the currently active slide so we can restore the reference
            // after rebuilding — angular.copy() creates new objects, which would
            // otherwise break the ng-disabled="screens[id].slide !== slide" check.
            var prevLabel  = frame.slide ? frame.slide.label : null;
            var prevState  = frame.slide ? angular.copy(frame.slide.state || []) : [];
            var prevDone   = frame.slide ? (frame.slide.done || false) : false;

            frame.slides = [];
            frame.slides.push(angular.copy(catalog['__empty__']));

            var skillNumbers = frame.ordering.skillNumbers || [];

            angular.forEach(skillNumbers, function (num) {
                var slides = catalog[num];
                if (slides && slides.length > 0) {
                    angular.forEach(slides, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }
            });

            if (frame.ordering.includeAlbertVidal) {
                var bestOfNation = catalog['__bestOfNation__'];
                if (bestOfNation && bestOfNation.length > 0) {
                    angular.forEach(bestOfNation, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }

                var albertVidal = catalog['__albertVidal__'];
                if (albertVidal && albertVidal.length > 0) {
                    frame.slides.push(angular.copy(albertVidal[0]));
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }
            }

            // Restore the slide pointer to the new copy so ng-disabled stays correct
            if (prevLabel) {
                var restored = null;
                angular.forEach(frame.slides, function (s) {
                    if (!restored && s.label === prevLabel) { restored = s; }
                });
                if (restored) {
                    restored.state = [];
                    restored.done  = prevDone;
                    frame.slide    = restored;
                } else {
                    frame.slide = undefined;
                }
            }
        };

        $scope.buildScreens = function (forceRedistribute) {
            $scope.catalog = $scope.buildCatalog();

            var frameIds = Object.keys(FrameService.frames);
            var anyHasSkills = frameIds.some(function (id) {
                return FrameService.frames[id].ordering.skillNumbers.length > 0;
            });

            if (!anyHasSkills && $scope.results.length > 0) {
                // Fresh state — distribute all skills evenly across frames.
                var skillNums = $scope.skills
                    .filter(function (s) { return !!$scope.catalog[s.number]; })
                    .map(function (s) { return s.number; });
                skillNums.forEach(function (num, i) {
                    var targetId = frameIds[i % frameIds.length];
                    FrameService.frames[targetId].ordering.skillNumbers.push(num);
                });
                FrameService.frames[frameIds[0]].ordering.includeAlbertVidal = true;
            } else if (forceRedistribute && anyHasSkills && $scope.results.length > 0) {
                // Frames already have a saved ordering — only auto-assign skills that
                // are new in this import and not yet assigned to any frame.
                var assignedNums = {};
                frameIds.forEach(function (id) {
                    FrameService.frames[id].ordering.skillNumbers.forEach(function (n) {
                        assignedNums[n] = true;
                    });
                });
                var newSkillNums = $scope.skills
                    .filter(function (s) { return !!$scope.catalog[s.number] && !assignedNums[s.number]; })
                    .map(function (s) { return s.number; });
                newSkillNums.forEach(function (num, i) {
                    var targetId = frameIds[i % frameIds.length];
                    FrameService.frames[targetId].ordering.skillNumbers.push(num);
                });
                var anyHasAV = frameIds.some(function (id) {
                    return FrameService.frames[id].ordering.includeAlbertVidal;
                });
                if (!anyHasAV) {
                    FrameService.frames[frameIds[0]].ordering.includeAlbertVidal = true;
                }
            }

            angular.forEach(FrameService.frames, function (frame, id) {
                $scope.assembleFrame(frame, $scope.catalog);
                if (!frame.slide && frame.slides.length > 0) {
                    frame.slide = frame.slides[0];
                }
                $scope.update(id);
            });

            $scope.rebuildCatalogSkillList();
            $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
            $scope.buildQueueList();
            if ($scope.skillsSelectedSkill) {
                $scope.skillsSelectedSlides = $scope.getSkillQueueSlides($scope.skillsSelectedSkill.number);
            }
        };

        $scope.rebuildCatalogSkillList = function () {
            $scope.catalogSkillList = $scope.skills.filter(function (skill) {
                return !!$scope.catalog[skill.number];
            }).map(function (skill) {
                return {
                    number: skill.number,
                    name: skill.name.text,
                    assignedFrame: $scope.getSkillFrame(skill.number) || ''
                };
            });
        };

        $scope.getSkillFrame = function (skillNumber) {
            var found = null;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (frame.ordering.skillNumbers.indexOf(skillNumber) >= 0) {
                    found = id;
                }
            });
            return found;
        };

        // Re-derive everything that depends on frame→skill ordering so an
        // assignment change made anywhere (All Frames panel, skills navigator,
        // ordering import) propagates across the whole app and to live windows.
        $scope.refreshFramesAfterOrderingChange = function () {
            if ($scope.catalog) {
                angular.forEach(FrameService.frames, function (frame, id) {
                    $scope.assembleFrame(frame, $scope.catalog);
                    if (frame.slides && frame.slides.length && frame.slides.indexOf(frame.slide) < 0) {
                        frame.slide = frame.slides[0];
                    }
                    $scope.update(id);
                });
            }
            $scope.rebuildCatalogSkillList();
            $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
            $scope.buildQueueList();
            if ($scope.skillsSelectedSkill) {
                $scope.skillsSelectedSlides = $scope.getSkillQueueSlides($scope.skillsSelectedSkill.number);
            }
            $scope.projectDirty = true;
        };

        $scope.moveSkillToFrame = function (skillNumber, toFrameId) {
            angular.forEach(FrameService.frames, function (frame) {
                var idx = frame.ordering.skillNumbers.indexOf(skillNumber);
                if (idx >= 0) frame.ordering.skillNumbers.splice(idx, 1);
            });
            if (toFrameId && FrameService.frames[toFrameId]) {
                FrameService.frames[toFrameId].ordering.skillNumbers.push(skillNumber);
            }
            $scope.refreshFramesAfterOrderingChange();
        };

        $scope.getAlbertVidalFrame = function () {
            var found = null;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (frame.ordering.includeAlbertVidal) found = id;
            });
            return found;
        };

        $scope.toggleAlbertVidalForFrame = function (frameId) {
            angular.forEach(FrameService.frames, function (frame, id) {
                frame.ordering.includeAlbertVidal = (id === frameId);
            });
            $scope.refreshFramesAfterOrderingChange();
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

        $scope.setActiveFrame = function (id) {
            FrameService.setActiveFrame(id);
        };

        $scope.addFrame = function () {
            var ids = Object.keys(FrameService.frames);
            var letters = 'abcdefghijklmnopqrstuvwxyz';
            var nextLetter = '';
            for (var i = 0; i < letters.length; i++) {
                if (ids.indexOf(letters[i]) < 0) {
                    nextLetter = letters[i];
                    break;
                }
            }
            if (!nextLetter) return;
            FrameService.addFrame(nextLetter);
            if ($scope.catalog) {
                $scope.assembleFrame(FrameService.frames[nextLetter], $scope.catalog);
            }
            if ($scope.catalogSkillList) {
                $scope.rebuildCatalogSkillList();
            }
            FrameService.setActiveFrame(nextLetter);
        };

        $scope.removeFrame = function (id) {
            if (id === 'a') return;
            var frame = FrameService.frames[id];
            if (!frame) return;
            if (frame.status && frame.status !== 'closed') {
                $scope.addNotice('warning', 'Close the live window for "' + (frame.label || id) + '" before removing this frame.', 'remove-live');
                return;
            }
            if (confirm('Remove frame "' + frame.label + '"?')) {
                window.localStorage.removeItem('screen-' + id);
                FrameService.removeFrame(id);
            }
        };

        $scope.editingFrameId = null;
        $scope.editingFrameLabel = '';

        $scope.startRenameFrame = function (id, currentLabel) {
            $scope.editingFrameId = id;
            $scope.editingFrameLabel = currentLabel;
        };

        // `childLabel` is passed from the ng-repeat child scope where ng-model writes —
        // without it, $scope.editingFrameLabel would read the parent scope's stale value
        // due to AngularJS prototype-chain shadowing.
        $scope.finishRenameFrame = function (id, childLabel) {
            if ($scope.editingFrameId !== id) return;
            var label = (childLabel !== undefined ? childLabel : $scope.editingFrameLabel || '').trim();
            if (label && FrameService.frames[id]) {
                FrameService.frames[id].label = label;
                writeFrameStateToLocalStorage(id);
                $scope.projectDirty = true;
            }
            $scope.editingFrameId = null;
            $scope.editingFrameLabel = '';
        };

        $scope.cancelRenameFrame = function () {
            $scope.editingFrameId = null;
            $scope.editingFrameLabel = '';
        };

        $scope.handleRenameKey = function ($event, id, childLabel) {
            if ($event.key === 'Enter') {
                $scope.finishRenameFrame(id, childLabel);
                $event.preventDefault();
            } else if ($event.key === 'Escape') {
                $scope.cancelRenameFrame();
                $event.preventDefault();
            }
        };

        function scrollToActiveInFrame(frameId) {
            $timeout(function () {
                var card = document.querySelector('[data-frame-id="' + frameId + '"]');
                if (!card) return;
                var cardBody = card.querySelector('.queue-frame-card-body');
                if (!cardBody) return;
                var activeItem = cardBody.querySelector('.list-group-item-primary');
                if (!activeItem) return;
                var bodyRect = cardBody.getBoundingClientRect();
                var itemRect = activeItem.getBoundingClientRect();
                if (itemRect.bottom > bodyRect.bottom) {
                    cardBody.scrollTop += (itemRect.bottom - bodyRect.bottom) + 8;
                } else if (itemRect.top < bodyRect.top) {
                    cardBody.scrollTop -= (bodyRect.top - itemRect.top) + 8;
                }
            }, 30);
        }

        $scope.prevSlideForFrame = function (frameId) {
            var frame = $scope.screens[frameId];
            if (!frame || !frame.slides || !frame.slides.length) return;
            var slide = frame.slide;
            if (!slide) return;
            if (slide.state && slide.state.length > 0) {
                slide.state.splice(slide.state.length - 1, 1);
                $scope.update(frameId);
                return;
            }
            var idx = frame.slides.indexOf(slide);
            if (idx > 0) {
                $scope.showSlide(frameId, frame.slides[idx - 1]);
                scrollToActiveInFrame(frameId);
            }
        };

        $scope.nextSlideForFrame = function (frameId) {
            var frame = $scope.screens[frameId];
            if (!frame || !frame.slides || !frame.slides.length) return;
            var slide = frame.slide;
            if (!slide) return;
            if (slide.states && slide.states.length > 0) {
                for (var i = 0; i < slide.states.length; i++) {
                    if (!$scope.hasState(slide, slide.states[i])) {
                        if (!slide.state) slide.state = [];
                        slide.state.push(slide.states[i]);
                        $scope.update(frameId);
                        return;
                    }
                }
            }
            var idx = frame.slides.indexOf(slide);
            if (idx >= 0 && idx < frame.slides.length - 1) {
                $scope.showSlide(frameId, frame.slides[idx + 1]);
                scrollToActiveInFrame(frameId);
            }
        };

        $scope.prevSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) return;
            $scope.prevSlideForFrame(FrameService.activeFrameId);
        };

        $scope.nextSlide = function () {
            var frame = FrameService.getActiveFrame();
            if (!frame || !frame.slides.length) return;
            $scope.nextSlideForFrame(FrameService.activeFrameId);
        };

        $scope.jumpToSlide = function (slide) {
            $scope.showSlide(FrameService.activeFrameId, slide);
        };

        $scope.getSlidePosition = function (frameId) {
            var frame = $scope.screens[frameId];
            if (!frame || !frame.slides.length) return '—';
            var idx = frame.slides.indexOf(frame.slide);
            return (idx < 0 ? 0 : idx + 1) + '/' + frame.slides.length;
        };

        $scope.projectMenuOpen = false;
        $scope.feedMenuOpen = false;
        $scope.importMenuOpen = false;
        $scope.allFramesViewOpen = false;
        $scope.gridConfigDialogOpen = false;
        $scope.queueViewOpen = false;
        $scope.queueLayout = 'list';
        $scope.skillsSelectedSkill = null;
        $scope.skillsSelectedSlides = [];
        $scope.queueList = [];
        $scope.queueByFrame = {};
        $scope.gridConfig = { cols: null, frameWidth: 1280, frameHeight: 720, splitContainers: false };

        function writeFrameStateToLocalStorage(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            var slide = frame.slide || (frame.slides && frame.slides[0]);
            if (slide) {
                window.localStorage.setItem('screen-' + frameId, angular.toJson({
                    template: TEMPLATE_BASE + slide.template,
                    context: slide.context || {},
                    state: slide.state || [],
                    label: slide.label || '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            } else {
                window.localStorage.setItem('screen-' + frameId, angular.toJson({
                    template: TEMPLATE_BASE + 'empty.html',
                    context: {},
                    state: [],
                    label: '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            }
        }

        // Aspect ratio for the frame's content, derived from its configured size —
        // falls back to 16/9 in screen.js when absent (e.g. an ultra-wide LED
        // ribbon gets 'w/h' instead of the default letterboxed 16:9 island).
        function frameRatio(frame) {
            return (frame.size && frame.size.width && frame.size.height)
                ? (frame.size.width + '/' + frame.size.height)
                : null;
        }

        $scope.openFrameWindow = function (frameId, isPreview) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            // Write current state so the frame window shows live content immediately
            writeFrameStateToLocalStorage(frameId);
            frame.status = 'connecting';
            if (window.ceremonator && window.ceremonator.frames) {
                var ratio = frameRatio(frame);
                if ($scope.gridConfig.splitContainers) {
                    // Two independent windows — one per region. Both currently
                    // share the frame's single configured position/size; the
                    // operator drags the second one to its own physical panel,
                    // same as arranging any other windowed output.
                    ['kv', 'state'].forEach(function (container) {
                        window.ceremonator.frames.openWindow({
                            frameId: frameId,
                            size: frame.size,
                            position: frame.position,
                            preview: !!isPreview,
                            label: frame.label,
                            container: container,
                            ratio: ratio
                        });
                    });
                } else {
                    window.ceremonator.frames.openWindow({
                        frameId: frameId,
                        size: frame.size,
                        position: frame.position,
                        preview: !!isPreview,
                        label: frame.label,
                        ratio: ratio
                    });
                }
            } else {
                var url = 'screen.html?screen=' + frameId + (isPreview ? '&preview=true' : '') + '&label=' + encodeURIComponent(frame.label || frameId);
                window.open(url, '_blank');
                frame.status = 'ready';
            }
        };

        // Panic path — wired to the control toolbar buttons (see control.html)
        // and to the same IPC channel the global keyboard accelerators use.
        $scope.setScreenMode = function (mode) {
            if (window.ceremonator && window.ceremonator.screen && window.ceremonator.screen.setMode) {
                window.ceremonator.screen.setMode(mode);
            }
        };

        $scope.openFrameWindowLive = function (frameId) {
            $scope.openFrameWindow(frameId, false);
        };

        $scope.openFrameWindowPreview = function (frameId) {
            $scope.openFrameWindow(frameId, true);
        };

        $scope.previewAllFrames = function () {
            var count = Object.keys(FrameService.frames).length;
            if (!confirm('Open preview windows for all ' + count + ' frame(s)?')) return;
            angular.forEach(FrameService.frames, function (frame, id) {
                $scope.openFrameWindow(id, true);
            });
        };

        $scope.openAllFramesLive = function () {
            angular.forEach(FrameService.frames, function (frame, id) {
                $scope.openFrameWindow(id, false);
            });
        };

        $scope.reloadFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reloadScreen) {
                frame.status = 'connecting';
                window.ceremonator.app.reloadScreen(frameId);
            }
        };

        $scope.closeFrameWindow = function (frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            if (frame.status && frame.status !== 'closed') {
                if (!confirm('Close the live screen "' + (frame.label || frameId) + '"? The audience display for this frame will go blank.')) {
                    return;
                }
            }
            if (window.ceremonator && window.ceremonator.frames) {
                window.ceremonator.frames.closeWindow({ frameId: frameId });
            }
            frame.status = 'closed';
        };

        // Near-square column count for n cells, ceil-based so it always
        // resolves (n need not have a nice divisor pair) — the grid may end
        // with trailing empty cells rather than forcing a lopsided N×1 row.
        $scope.computeBestCols = function (n) {
            return Math.max(1, Math.ceil(Math.sqrt(n)));
        };

        $scope.getFrameCount = function () {
            return Object.keys(FrameService.frames).length;
        };

        $scope.getGridCellCount = function () {
            var n = $scope.getFrameCount();
            return $scope.gridConfig.splitContainers ? n * 2 : n;
        };

        // Grid columns/rows are computed in FRAME units, then doubled to CELL
        // units when Split is on — this guarantees a frame's kv/state pair
        // always lands in the same row (every row is a whole number of pairs),
        // instead of splitting across a row boundary.
        function gridLayout(frameColsOverride) {
            var frameCount = $scope.getFrameCount();
            var split = $scope.gridConfig.splitContainers;
            var frameCols = frameColsOverride > 0
                ? (split ? Math.max(1, Math.round(frameColsOverride / 2)) : frameColsOverride)
                : $scope.computeBestCols(frameCount);
            var gridCols = split ? frameCols * 2 : frameCols;
            var cellCount = $scope.getGridCellCount();
            var gridRows = Math.ceil(cellCount / gridCols);
            return { cols: gridCols, rows: gridRows };
        }

        $scope.getAutoGridPreview = function () {
            var layout = gridLayout(0);
            return layout.cols + ' × ' + layout.rows;
        };

        $scope.getManualGridPreview = function () {
            var colsInput = parseInt($scope.gridConfig.cols, 10);
            if (!colsInput || colsInput < 1) return '';
            var layout = gridLayout(colsInput);
            return layout.cols + ' × ' + layout.rows + ' (' + $scope.getGridCellCount() + ' windows)';
        };

        $scope.openGridView = function () {
            $scope.gridConfigDialogOpen = true;
        };

        $scope.confirmOpenGridView = function () {
            $scope.gridConfigDialogOpen = false;
            if (!window.ceremonator || !window.ceremonator.frames) return;

            // Write current frame state to localStorage so iframes display content immediately
            angular.forEach(FrameService.frames, function (frame, id) {
                writeFrameStateToLocalStorage(id);
            });

            var colsInput = parseInt($scope.gridConfig.cols, 10);
            var layout = gridLayout(colsInput);

            var frameIds = Object.keys(FrameService.frames);
            var cells = [];
            frameIds.forEach(function (id) {
                var frame = FrameService.frames[id];
                var ratio = frameRatio(frame);
                var label = frame.label || id;
                var accent = FrameService.getFrameColor(id);
                if ($scope.gridConfig.splitContainers) {
                    cells.push({ frameId: id, container: 'kv', ratio: ratio, label: label + ' — Key Info', accent: accent });
                    cells.push({ frameId: id, container: 'state', ratio: ratio, label: label + ' — Results', accent: accent });
                } else {
                    cells.push({ frameId: id, ratio: ratio, label: label, accent: accent });
                }
            });

            window.ceremonator.frames.openLargeWindow({
                frames: cells,
                grid: { cols: layout.cols, rows: layout.rows, gap: 4 },
                frameSize: {
                    width: parseInt($scope.gridConfig.frameWidth, 10) || 1280,
                    height: parseInt($scope.gridConfig.frameHeight, 10) || 720
                }
            });
        };

        $scope.selectSkillForQueue = function (skill) {
            $scope.skillsSelectedSkill = skill;
            $scope.skillsSelectedSlides = $scope.getSkillQueueSlides(skill.number);
        };

        $scope.getSkillQueueSlides = function (skillNumber) {
            if (!$scope.catalog) return [];
            if (skillNumber === '__albertVidal__') {
                var avaFrameId = $scope.albertVidalFrame;
                if (!avaFrameId || !$scope.catalog['__albertVidal__']) return [];
                var avaFrame = $scope.screens[avaFrameId];
                if (!avaFrame || !avaFrame.slides) return [];
                var avaResult = [];
                angular.forEach(avaFrame.slides, function (slide) {
                    if (slide.label === 'Albert Vidal Award') {
                        avaResult.push({ slide: slide, frameId: avaFrameId, frame: avaFrame });
                    }
                });
                return avaResult;
            }
            var frameId = $scope.getSkillFrame(skillNumber);
            if (!frameId) return [];
            var frame = $scope.screens[frameId];
            if (!frame || !frame.slides) return [];
            var catalogSlides = $scope.catalog[skillNumber] || [];
            var result = [];
            angular.forEach(catalogSlides, function (catalogSlide) {
                angular.forEach(frame.slides, function (slide) {
                    if (slide.label === catalogSlide.label) {
                        result.push({ slide: slide, frameId: frameId, frame: frame });
                    }
                });
            });
            return result;
        };

        $scope.showSlideFromSkillsView = function (item) {
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide);
        };

        $scope.skillNext = function () {
            if (!$scope.skillsSelectedSlides.length) return;
            var activeIdx = -1;
            angular.forEach($scope.skillsSelectedSlides, function (item, i) {
                if (activeIdx < 0 && $scope.screens[item.frameId] && $scope.screens[item.frameId].slide === item.slide) {
                    activeIdx = i;
                }
            });
            if (activeIdx < 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[0]);
                return;
            }
            var cur = $scope.skillsSelectedSlides[activeIdx];
            if (cur.slide.states && cur.slide.states.length > 0) {
                for (var i = 0; i < cur.slide.states.length; i++) {
                    if (!$scope.hasState(cur.slide, cur.slide.states[i])) {
                        if (!cur.slide.state) cur.slide.state = [];
                        cur.slide.state.push(cur.slide.states[i]);
                        $scope.update(cur.frameId);
                        return;
                    }
                }
            }
            if (activeIdx < $scope.skillsSelectedSlides.length - 1) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[activeIdx + 1]);
                return;
            }
            // End of skill — reset frame to intro and deselect skill
            cur.slide.done = true;
            var frame = $scope.screens[cur.frameId];
            if (frame && frame.slides && frame.slides.length > 0) {
                frame.slide = frame.slides[0];
                $scope.update(cur.frameId);
            }
            $scope.skillsSelectedSkill = null;
            $scope.skillsSelectedSlides = [];
        };

        $scope.exitToStartup = function () {
            var anyLive = false;
            angular.forEach(FrameService.frames, function (frame) {
                if (frame.status && frame.status !== 'closed') anyLive = true;
            });
            var message = anyLive
                ? 'Return to the start screen? This closes every live projector window and the control panel.'
                : 'Return to the start screen? This closes the control panel.';
            if ($scope.projectDirty) {
                message += '\n\nYou have unsaved changes that will be lost.';
            }
            if (!confirm(message)) return;
            if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.exitToStartup) {
                window.ceremonator.app.exitToStartup();
            }
        };

        $scope.skillPrev = function () {
            if (!$scope.skillsSelectedSlides.length) return;
            var activeIdx = -1;
            angular.forEach($scope.skillsSelectedSlides, function (item, i) {
                if (activeIdx < 0 && $scope.screens[item.frameId] && $scope.screens[item.frameId].slide === item.slide) {
                    activeIdx = i;
                }
            });
            if (activeIdx < 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[$scope.skillsSelectedSlides.length - 1]);
                return;
            }
            var cur = $scope.skillsSelectedSlides[activeIdx];
            if (cur.slide.state && cur.slide.state.length > 0) {
                cur.slide.state.splice(cur.slide.state.length - 1, 1);
                $scope.update(cur.frameId);
                return;
            }
            if (activeIdx > 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[activeIdx - 1]);
            }
        };

        $scope.reassignSkillFrame = function (skillNumber, frameId) {
            // Capture old frame and active slide label before the move
            var oldFrameId = skillNumber === '__albertVidal__'
                ? $scope.albertVidalFrame
                : $scope.getSkillFrame(skillNumber);
            var activeSlideLabel = null;
            var beforeSlides = $scope.getSkillQueueSlides(skillNumber);
            angular.forEach(beforeSlides, function (item) {
                if (!activeSlideLabel && $scope.screens[item.frameId] && $scope.screens[item.frameId].slide === item.slide) {
                    activeSlideLabel = item.slide.label;
                }
            });

            if (skillNumber === '__albertVidal__') {
                $scope.toggleAlbertVidalForFrame(frameId);
            } else {
                $scope.moveSkillToFrame(skillNumber, frameId);
            }

            var newSlides = $scope.getSkillQueueSlides(skillNumber);
            if ($scope.skillsSelectedSkill && $scope.skillsSelectedSkill.number === skillNumber) {
                $scope.skillsSelectedSlides = newSlides;
            }

            // Reset old frame to intro/empty
            if (activeSlideLabel && oldFrameId && oldFrameId !== frameId) {
                var oldFrame = $scope.screens[oldFrameId];
                if (oldFrame && oldFrame.slides && oldFrame.slides.length > 0) {
                    oldFrame.slide = oldFrame.slides[0];
                    $scope.update(oldFrameId);
                }
            }

            // Show matching slide on new frame with fresh state.
            // Bypass showSlide's same-slide guard to guarantee state resets
            // and localStorage is always written.
            if (activeSlideLabel) {
                var shown = false;
                angular.forEach(newSlides, function (item) {
                    if (!shown && item.slide.label === activeSlideLabel) {
                        shown = true;
                        $scope.setActiveFrame(item.frameId);
                        item.slide.done = true;
                        item.slide.state = [];
                        $scope.screens[item.frameId].slide = item.slide;
                        $scope.update(item.frameId);
                    }
                });
            }
        };

        $scope.skillShortLabel = function (fullLabel, skillName) {
            var prefix = skillName + ' - ';
            if (fullLabel && skillName && fullLabel.indexOf(prefix) === 0) {
                return fullLabel.substring(prefix.length);
            }
            return fullLabel;
        };

        $scope.isSkillFullyDisplayed = function (skillNumber) {
            var slides = $scope.getSkillQueueSlides(skillNumber);
            if (!slides || !slides.length) return false;
            return slides.every(function (item) { return item.slide.done; });
        };

        $scope.buildQueueList = function () {
            if (!$scope.catalog) { $scope.queueList = []; return; }
            var list = [];

            // Iterate skills in their canonical order
            angular.forEach($scope.skills, function (skill) {
                var catalogSlides = $scope.catalog[skill.number];
                if (!catalogSlides || !catalogSlides.length) return;
                var frameId = $scope.getSkillFrame(skill.number);
                if (!frameId) return;
                var frame = $scope.screens[frameId];
                if (!frame || !frame.slides) return;

                // assembleFrame does angular.copy so labels are preserved — match by label
                angular.forEach(catalogSlides, function (catalogSlide) {
                    angular.forEach(frame.slides, function (slide) {
                        if (slide.label === catalogSlide.label) {
                            list.push({ slide: slide, frameId: frameId, frame: frame });
                        }
                    });
                });
            });

            // Albert Vidal Award at the end
            var avaFrameId = $scope.getAlbertVidalFrame();
            if (avaFrameId && $scope.catalog['__albertVidal__']) {
                var avaFrame = $scope.screens[avaFrameId];
                if (avaFrame && avaFrame.slides) {
                    angular.forEach(avaFrame.slides, function (slide) {
                        if (slide.label === 'Albert Vidal Award') {
                            list.push({ slide: slide, frameId: avaFrameId, frame: avaFrame });
                        }
                    });
                }
            }

            $scope.queueList = list;

            // Build per-frame map for the card grouped layout
            var byFrame = {};
            angular.forEach(list, function (item) {
                if (!byFrame[item.frameId]) byFrame[item.frameId] = [];
                byFrame[item.frameId].push(item);
            });
            $scope.queueByFrame = byFrame;
        };

        $scope.showSlideFromQueue = function (item, listIdx, frameIdx, frameId) {
            $scope.showSlide(item.frameId, item.slide);
            $timeout(function () {
                if ($scope.queueLayout === 'list' && listIdx != null) {
                    var lookahead = Math.min(listIdx + 2, $scope.queueList.length - 1);
                    var target = document.querySelector('[data-queue-idx="' + lookahead + '"]');
                    if (target) {
                        var container = document.querySelector('.queue-panel .slide-list-area');
                        if (container) {
                            var cBottom = container.getBoundingClientRect().bottom;
                            var tBottom = target.getBoundingClientRect().bottom;
                            if (tBottom > cBottom) {
                                container.scrollTop += (tBottom - cBottom) + 8;
                            }
                        }
                    }
                } else if ($scope.queueLayout === 'grid' && frameIdx != null && frameId) {
                    var fItems = $scope.queueByFrame[frameId] || [];
                    var lookaheadF = Math.min(frameIdx + 2, fItems.length - 1);
                    var card = document.querySelector('[data-frame-id="' + frameId + '"]');
                    var cardBody = card ? card.querySelector('.queue-frame-card-body') : null;
                    if (cardBody) {
                        var items = cardBody.querySelectorAll('.list-group-item');
                        var tEl = items[lookaheadF];
                        if (tEl) {
                            var cbBottom = cardBody.getBoundingClientRect().bottom;
                            var tElBottom = tEl.getBoundingClientRect().bottom;
                            if (tElBottom > cbBottom) {
                                cardBody.scrollTop += (tElBottom - cbBottom) + 8;
                            }
                        }
                    }
                }
            }, 30);
        };

        // Index in the flat queueList of the slide currently shown on the
        // active frame, or -1 if none matches.
        function currentQueueListIndex() {
            for (var i = 0; i < $scope.queueList.length; i++) {
                var it = $scope.queueList[i];
                if (it.frameId === FrameService.activeFrameId &&
                    $scope.screens[it.frameId] && $scope.screens[it.frameId].slide === it.slide) {
                    return i;
                }
            }
            return -1;
        }

        $scope.showFromQueueList = function (idx) {
            var item = $scope.queueList[idx];
            if (!item) return;
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide);
            $timeout(function () {
                var target = document.querySelector('[data-queue-idx="' + idx + '"]');
                var container = document.querySelector('.queue-panel .slide-list-area');
                if (target && container) {
                    var cRect = container.getBoundingClientRect();
                    var tRect = target.getBoundingClientRect();
                    if (tRect.bottom > cRect.bottom) container.scrollTop += (tRect.bottom - cRect.bottom) + 8;
                    else if (tRect.top < cRect.top) container.scrollTop -= (cRect.top - tRect.top) + 8;
                }
            }, 30);
        };

        // Walk the entire queue across all frames in ceremony order (advancing
        // states within a slide first, then moving to the next queue entry —
        // which may belong to a different frame).
        $scope.queueListNext = function () {
            if (!$scope.queueList.length) return;
            var idx = currentQueueListIndex();
            if (idx < 0) { $scope.showFromQueueList(0); return; }
            var slide = $scope.queueList[idx].slide;
            if (slide.states && slide.states.length > 0) {
                for (var i = 0; i < slide.states.length; i++) {
                    if (!$scope.hasState(slide, slide.states[i])) {
                        if (!slide.state) slide.state = [];
                        slide.state.push(slide.states[i]);
                        $scope.update($scope.queueList[idx].frameId);
                        return;
                    }
                }
            }
            if (idx < $scope.queueList.length - 1) $scope.showFromQueueList(idx + 1);
        };

        $scope.queueListPrev = function () {
            if (!$scope.queueList.length) return;
            var idx = currentQueueListIndex();
            if (idx < 0) { $scope.showFromQueueList($scope.queueList.length - 1); return; }
            var slide = $scope.queueList[idx].slide;
            if (slide.state && slide.state.length > 0) {
                slide.state.splice(slide.state.length - 1, 1);
                $scope.update($scope.queueList[idx].frameId);
                return;
            }
            if (idx > 0) $scope.showFromQueueList(idx - 1);
        };

        $scope.importFrameOrdering = function (file) {
            if (!file) return;
            file.arrayBuffer().then(function (buffer) {
                var data = new Uint8Array(buffer);
                var wb = XLSX.read(data, { type: 'array' });
                var ws = wb.Sheets[wb.SheetNames[0]];
                var rows = XLSX.utils.sheet_to_json(ws, { raw: false });

                if (!rows || !rows.length) {
                    alert('Import failed: file is empty or has no data rows.');
                    return;
                }
                if (typeof rows[0]['Skill Number'] === 'undefined' || typeof rows[0]['Frame Name'] === 'undefined') {
                    alert('Import failed: spreadsheet must have "Skill Number" and "Frame Name" columns.');
                    return;
                }

                $scope.$apply(function () {
                    var labelToId = {};
                    angular.forEach(FrameService.frames, function (frame, id) {
                        labelToId[frame.label.toLowerCase()] = id;
                    });

                    rows.forEach(function (row) {
                        var skillNum = row['Skill Number'] ? String(row['Skill Number']).trim() : null;
                        var frameName = row['Frame Name'] ? String(row['Frame Name']).trim() : null;
                        if (!skillNum) return;

                        angular.forEach(FrameService.frames, function (frame) {
                            var idx = frame.ordering.skillNumbers.indexOf(skillNum);
                            if (idx >= 0) frame.ordering.skillNumbers.splice(idx, 1);
                        });

                        var frameId = frameName ? (labelToId[frameName.toLowerCase()] || null) : null;
                        if (frameId && FrameService.frames[frameId]) {
                            FrameService.frames[frameId].ordering.skillNumbers.push(skillNum);
                        }
                    });

                    if ($scope.catalog) {
                        angular.forEach(FrameService.frames, function (frame) {
                            $scope.assembleFrame(frame, $scope.catalog);
                        });
                    }
                    $scope.rebuildCatalogSkillList();
                    $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
                    $scope.buildQueueList();
                    $scope.projectDirty = true;
                });
            });
        };

        $scope.saveProject = function () {
            $scope.projectMenuOpen = false;
            var doSave = function () {
                FrameService.saveProject($scope.projectName || 'Ceremony Project', $scope.displayMode || 'windows', $scope.gridConfig).then(function (result) {
                    if (result && result.ok) {
                        $scope.$apply(function () { $scope.projectDirty = false; });
                    } else if (result && !result.canceled) {
                        alert('Save failed: ' + (result.error || 'unknown error'));
                    }
                });
            };
            // Snapshot current window positions before serializing
            if (window.ceremonator && window.ceremonator.frames && window.ceremonator.frames.getPositions) {
                window.ceremonator.frames.getPositions().then(function (positions) {
                    angular.forEach(positions, function (pos, frameId) {
                        if (FrameService.frames[frameId]) {
                            FrameService.frames[frameId].position.x = pos.x;
                            FrameService.frames[frameId].position.y = pos.y;
                            if (pos.monitor != null) {
                                FrameService.frames[frameId].position.monitor = pos.monitor;
                            }
                            if (pos.width != null && pos.height != null) {
                                FrameService.frames[frameId].size.width = pos.width;
                                FrameService.frames[frameId].size.height = pos.height;
                            }
                        }
                    });
                    doSave();
                });
            } else {
                doSave();
            }
        };

        $scope.saveAsProject = function () {
            $scope.projectMenuOpen = false;
            FrameService.saveAsProject($scope.projectName || 'Ceremony Project', $scope.displayMode || 'windows', $scope.gridConfig).then(function (result) {
                if (result && result.canceled) return;
                if (result && result.ok) {
                    $scope.$apply(function () { $scope.projectDirty = false; });
                } else {
                    alert('Save As failed: ' + (result && result.error ? result.error : 'unknown error'));
                }
            });
        };

        $scope.loadProject = function () {
            $scope.projectMenuOpen = false;
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.open) return;
            window.ceremonator.project.open().then(function (result) {
                if (!result || result.canceled) return;
                if (!result.ok) {
                    alert('Load failed: ' + (result.error || 'unknown error'));
                    return;
                }
                var project = result.project;
                $scope.$apply(function () {
                    $scope.projectName = project.name;
                    $scope.displayMode = project.displayMode;
                    if (project.gridConfig) {
                        $scope.gridConfig = angular.extend({}, $scope.gridConfig, project.gridConfig);
                    }
                    if (project.frames) {
                        FrameService.loadFromProject(project.frames);
                    }
                    if ($scope.catalog) {
                        angular.forEach(FrameService.frames, function (frame) {
                            $scope.assembleFrame(frame, $scope.catalog);
                        });
                        $scope.rebuildCatalogSkillList();
                        $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
                        $scope.buildQueueList();
                    }
                    $scope.projectDirty = false;
                });
            });
        };

        $scope.reloadTemplates = function () {
            $scope.projectMenuOpen = false;
            var t = Date.now();
            angular.forEach(FrameService.frames, function (frame, id) {
                var raw = window.localStorage.getItem('screen-' + id);
                if (!raw) return;
                var entry = angular.fromJson(raw);
                if (!entry) return;
                var base = entry.template ? entry.template.split('?')[0] : (TEMPLATE_BASE + 'empty.html');
                entry.template = base + '?t=' + t;
                window.localStorage.setItem('screen-' + id, angular.toJson(entry));
            });
        };

        // ── Development session (survives hot reload) ──────────────────
        // Only active in a dev run; see js/dev-session.service.js.

        // Replay the snapshot taken before the last reload: the imported rows,
        // the frame configuration, and where each frame was in its slide list.
        // Resolves to whether anything was restored.
        function restoreDevSession() {
            if (!DevSession.enabled) return $q.resolve(false);

            return $q.when(DevSession.load()).then(function (saved) {
                if (!saved) {
                    clearScreenStorage();
                    DevSession.restoring = false;
                    return false;
                }

                if (saved.projectName) $scope.projectName = saved.projectName;
                if (saved.displayMode) $scope.displayMode = saved.displayMode;
                if (saved.gridConfig) {
                    $scope.gridConfig = angular.extend({}, $scope.gridConfig, saved.gridConfig);
                }
                if (saved.frames) FrameService.loadFromProject(saved.frames);

                $scope.results = saved.results || [];
                $scope.resultsBestOfNations = saved.resultsBestOfNations || [];
                $scope.uploaded = !!saved.uploaded;

                // Rebuilds the catalog and reassembles every frame from the
                // restored ordering — no redistribution, so the saved
                // skill→frame assignment is kept as-is.
                $scope.buildScreens();
                DevSession.restoreRuntime(saved.runtime);

                angular.forEach(FrameService.frames, function (frame, id) {
                    writeFrameStateToLocalStorage(id);
                });

                if (saved.activeFrameId) FrameService.setActiveFrame(saved.activeFrameId);
                restoreDevSessionUi(saved.ui || {});
                syncFrameStatuses();
                $scope.projectDirty = !!saved.projectDirty;

                DevSession.restoring = false;
                $scope.addNotice('info', 'Dev: restored session after reload — ' +
                    $scope.results.length + ' result row(s), ' +
                    Object.keys(FrameService.frames).length + ' frame(s).', 'dev-session');
                return true;
            });
        }

        // A dev restart reopens the frame windows before this renderer has its
        // frame list back, so their 'connecting'/'ready' notices arrive too early
        // to land on a frame. Reconcile the badges once, after restoring.
        function syncFrameStatuses() {
            if (!window.ceremonator || !window.ceremonator.frames || !window.ceremonator.frames.openIds) return;
            $q.when(window.ceremonator.frames.openIds()).then(function (ids) {
                angular.forEach(ids || [], function (id) {
                    if (FrameService.frames[id]) FrameService.frames[id].status = 'ready';
                });
            });
        }

        function restoreDevSessionUi(ui) {
            $scope.queueViewOpen = !!ui.queueViewOpen;
            $scope.allFramesViewOpen = !!ui.allFramesViewOpen;
            if (ui.queueLayout) $scope.queueLayout = ui.queueLayout;
            if (ui.selectedSkillNumber) {
                // Reselect from catalogSkillList (rebuilt by buildScreens) so the
                // object is the same shape the skills navigator binds to.
                angular.forEach($scope.catalogSkillList || [], function (skill) {
                    if (skill.number === ui.selectedSkillNumber) {
                        $scope.selectSkillForQueue(skill);
                    }
                });
            }
        }

        if (DevSession.enabled) {
            DevSession.registerCollector(function () {
                return {
                    projectName: $scope.projectName || null,
                    displayMode: $scope.displayMode || null,
                    gridConfig: angular.copy($scope.gridConfig),
                    uploaded: !!$scope.uploaded,
                    projectDirty: !!$scope.projectDirty,
                    activeFrameId: FrameService.activeFrameId,
                    results: $scope.results || [],
                    resultsBestOfNations: $scope.resultsBestOfNations || [],
                    frames: FrameService.serializeForProject(),
                    runtime: DevSession.serializeRuntime(),
                    ui: {
                        queueViewOpen: !!$scope.queueViewOpen,
                        allFramesViewOpen: !!$scope.allFramesViewOpen,
                        queueLayout: $scope.queueLayout,
                        selectedSkillNumber: $scope.skillsSelectedSkill ? $scope.skillsSelectedSkill.number : null
                    }
                };
            });

            // One watcher on a cheap signature, rather than a save call at every
            // mutation site: anything that changes the show state also changes
            // the fingerprint.
            $scope.$watch(function () {
                return DevSession.fingerprint($scope);
            }, function () {
                DevSession.schedule();
            });
        }

        if (window.ceremonator && window.ceremonator.onNotice) {
            window.ceremonator.onNotice(function (data) {
                if (!data || !data.text) return;
                var apply = function () { $scope.addNotice(data.level || 'info', data.text); };
                if (!$scope.$$phase) $scope.$apply(apply); else apply();
            });
        }

        if (window.ceremonator && window.ceremonator.onFrameStatus) {
            window.ceremonator.onFrameStatus(function (data) {
                var frame = FrameService.frames[data.frameId];
                if (!frame) return;
                var apply = function () {
                    frame.status = data.status;
                    if (data.x != null && data.y != null && frame.position) {
                        frame.position.x = data.x;
                        frame.position.y = data.y;
                    }
                    if (data.monitor != null && frame.position) {
                        frame.position.monitor = data.monitor;
                    }
                    if (data.width != null && data.height != null && frame.size) {
                        frame.size.width = data.width;
                        frame.size.height = data.height;
                    }
                };
                if (!$scope.$$phase) $scope.$apply(apply); else apply();
            });
        }

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

    angular.module('ceremoniesApp').directive('autoFocus', function ($timeout) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                scope.$watch(attrs.autoFocus, function (val) {
                    if (val) {
                        $timeout(function () { element[0].focus(); element[0].select(); }, 0);
                    }
                });
            }
        };
    });

    angular.module('ceremoniesApp').directive('jsonText', function ($filter) {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                function into(input) {
                    try {
                        var parsed = JSON.parse(input);
                        ngModel.$setValidity('json', true);
                        return parsed;
                    } catch (e) {
                        // Keep the last valid model value so an in-progress edit
                        // can't silently break a live slide; flag invalidity so
                        // the field can show an error state.
                        ngModel.$setValidity('json', false);
                        return undefined;
                    }
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
