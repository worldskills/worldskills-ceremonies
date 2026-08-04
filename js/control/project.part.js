(function () {
    'use strict';

    // Import (results / Best of Nation / frame ordering), project save/load,
    // and the project/import/feed menus. See the two invariants above the
    // *Part(scope) calls in js/control.js.
    angular.module('ceremoniesApp').factory('ProjectPart', function (Excel, FrameState, FrameService) {
        return function (scope) {

            scope.projectMenuOpen = false;
            scope.feedMenuOpen = false;
            scope.importMenuOpen = false;

            scope.frameMonitorChanged = function () {
                scope.projectDirty = true;
            };

            // ── Display list (for per-frame monitor assignment) ────────────
            scope.displays = [];
            if (window.ceremonator && window.ceremonator.displays) {
                window.ceremonator.displays.list().then(function (list) {
                    scope.$apply(function () {
                        scope.displays = (list || []).map(function (d, i) {
                            return { index: i, label: d.label || ('Display ' + (i + 1)) };
                        });
                    });
                });
            }

            scope.upload = function (file) {
                if (!file) return;
                scope.uploaded = true;
                Excel.readRows(file).then(function (rows) {
                    scope.results = rows;
                    scope.$apply(function () {
                        if (!scope.results || !scope.results.length) {
                            scope.uploaded = false;
                            scope.addNotice('error', 'Import failed: no result rows were found in that file. Please import a valid WorldSkills results spreadsheet (.xlsx).', 'import');
                            return;
                        }
                        scope.buildScreens(true);
                        scope.reportImportSummary();
                        scope.checkMissingFlags();
                    });
                }).catch(function (error) {
                    scope.$apply(function () {
                        scope.uploaded = false;
                        scope.addNotice('error', 'Import failed: the file could not be read as a spreadsheet. Please import a valid WorldSkills results file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import');
                    });
                });
            };

            // Warn (before the event) about medalist member codes that have no flag
            // image, so the missing flags can be sourced. On screen these fall back
            // to a neutral placeholder, so this is advisory, not blocking.
            scope.checkMissingFlags = function () {
                if (!window.ceremonator || !window.ceremonator.flags || !window.ceremonator.flags.list) return;
                if (!scope.catalog) return;
                var used = {};
                angular.forEach(scope.catalog, function (slides) {
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
                        scope.$apply(function () {
                            scope.addNotice('warning', 'Missing flag image(s) for: ' + missing.sort().join(', ') +
                                '. These will show a placeholder on screen. Add the PNG(s) to data/flags/ before the event.', 'flags-missing');
                        });
                    }
                });
            };

            // Summarize the most recent import: how many result rows were kept vs skipped.
            scope.reportImportSummary = function () {
                var total = (scope.results && scope.results.length) || 0;
                var skipped = scope.lastImportSkipped || 0;
                if (skipped > 0) {
                    scope.addNotice('warning', 'Imported ' + (total - skipped) + ' of ' + total + ' result rows. ' + skipped + ' row(s) were skipped because a competitor name was missing.', 'import');
                } else {
                    scope.addNotice('info', 'Imported ' + total + ' result rows successfully.', 'import');
                }
            };

            // Import the Best of Nation spreadsheet as a separate file (its own
            // dataset, distinct from the competitor results). Rebuilds the catalog
            // and reassembles frames without redistributing skill ordering.
            scope.uploadBestOfNation = function (file) {
                if (!file) return;
                Excel.readRows(file).then(function (rows) {
                    scope.$apply(function () {
                        if (!rows || !rows.length) {
                            scope.addNotice('error', 'Import failed: no Best of Nation rows were found in that file. Please import a valid Best of Nation spreadsheet (.xlsx).', 'import-bon');
                            return;
                        }
                        scope.resultsBestOfNations = rows;
                        scope.buildScreens();
                        scope.addNotice('info', 'Imported ' + rows.length + ' Best of Nation row(s).', 'import-bon');
                        scope.checkMissingFlags();
                    });
                }).catch(function (error) {
                    scope.$apply(function () {
                        scope.addNotice('error', 'Import failed: the Best of Nation file could not be read as a spreadsheet. Please import a valid Best of Nation file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import-bon');
                    });
                });
            };

            scope.importFrameOrdering = function (file) {
                if (!file) return;
                Excel.readRows(file).then(function (rows) {
                    if (!rows || !rows.length) {
                        alert('Import failed: file is empty or has no data rows.');
                        return;
                    }
                    if (typeof rows[0]['Skill Number'] === 'undefined' || typeof rows[0]['Frame Name'] === 'undefined') {
                        alert('Import failed: spreadsheet must have "Skill Number" and "Frame Name" columns.');
                        return;
                    }

                    scope.$apply(function () {
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

                        if (scope.catalog) {
                            angular.forEach(FrameService.frames, function (frame) {
                                scope.assembleFrame(frame, scope.catalog);
                            });
                        }
                        scope.rebuildCatalogSkillList();
                        scope.albertVidalFrame = scope.getAlbertVidalFrame() || '';
                        scope.buildQueueList();
                        scope.projectDirty = true;
                    });
                });
            };

            scope.saveProject = function () {
                scope.projectMenuOpen = false;
                var doSave = function () {
                    FrameService.saveProject(scope.projectName || 'Ceremony Project', scope.displayMode || 'windows', scope.gridConfig).then(function (result) {
                        if (result && result.ok) {
                            scope.$apply(function () { scope.projectDirty = false; });
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

            scope.saveAsProject = function () {
                scope.projectMenuOpen = false;
                FrameService.saveAsProject(scope.projectName || 'Ceremony Project', scope.displayMode || 'windows', scope.gridConfig).then(function (result) {
                    if (result && result.canceled) return;
                    if (result && result.ok) {
                        scope.$apply(function () { scope.projectDirty = false; });
                    } else {
                        alert('Save As failed: ' + (result && result.error ? result.error : 'unknown error'));
                    }
                });
            };

            scope.loadProject = function () {
                scope.projectMenuOpen = false;
                if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.open) return;
                window.ceremonator.project.open().then(function (result) {
                    if (!result || result.canceled) return;
                    if (!result.ok) {
                        alert('Load failed: ' + (result.error || 'unknown error'));
                        return;
                    }
                    var project = result.project;
                    scope.$apply(function () {
                        scope.projectName = project.name;
                        scope.displayMode = project.displayMode;
                        if (project.gridConfig) {
                            scope.gridConfig = angular.extend({}, scope.gridConfig, project.gridConfig);
                        }
                        if (project.frames) {
                            FrameService.loadFromProject(project.frames);
                        }
                        if (scope.catalog) {
                            angular.forEach(FrameService.frames, function (frame) {
                                scope.assembleFrame(frame, scope.catalog);
                            });
                            scope.rebuildCatalogSkillList();
                            scope.albertVidalFrame = scope.getAlbertVidalFrame() || '';
                            scope.buildQueueList();
                        }
                        scope.projectDirty = false;
                    });
                });
            };

            scope.reloadTemplates = function () {
                scope.projectMenuOpen = false;
                FrameState.reloadTemplates();
            };

            scope.exitToStartup = function () {
                var anyLive = false;
                angular.forEach(FrameService.frames, function (frame) {
                    if (frame.status && frame.status !== 'closed') anyLive = true;
                });
                var message = anyLive
                    ? 'Return to the start screen? This closes every live projector window and the control panel.'
                    : 'Return to the start screen? This closes the control panel.';
                if (scope.projectDirty) {
                    message += '\n\nYou have unsaved changes that will be lost.';
                }
                if (!confirm(message)) return;
                if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.exitToStartup) {
                    window.ceremonator.app.exitToStartup();
                }
            };
        };
    });

})();
