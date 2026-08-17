(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('ProjectPart', function (Excel, FrameState, FrameService) {
      return function ($scope) {
        $scope.projectMenuOpen = false;
        $scope.feedMenuOpen = false;
        $scope.importMenuOpen = false;
        $scope.bestOfNationImportDialogOpen = false;
        $scope.pendingBestOfNationFile = null;

        $scope.frameMonitorChanged = function () {
            $scope.projectDirty = true;
        };

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

        $scope.upload = function (file) {
            if (!file) return;
            $scope.uploaded = true;
            Excel.readRows(file).then(function (rows) {
                $scope.results = rows;
                $scope.$apply(function () {
                    if (!$scope.results || !$scope.results.length) {
                        $scope.uploaded = false;
                        $scope.addNotice('error', 'Import failed: no result rows were found in that file. Please import a valid CIS results spreadsheet (.xlsx).', 'import');
                        return;
                    }
                    $scope.buildScreens(true);

                    var total = ($scope.results && $scope.results.length) || 0;
                    var skipped = $scope.lastImportSkipped || 0;
                    if (skipped > 0) {
                        $scope.addNotice('warning', 'Imported ' + (total - skipped) + ' of ' + total + ' result rows. ' + skipped + ' row(s) were skipped because a competitor name was missing.', 'import');
                    } else {
                        $scope.addNotice('info', 'Imported ' + total + ' result rows successfully.', 'import');
                    }
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.uploaded = false;
                    $scope.addNotice('error', 'Import failed: the file could not be read as a spreadsheet. Please import a valid CIS results file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import');
                });
            });
        };

        $scope.uploadBestOfNation = function (file) {
            if (!file) return;
            $scope.pendingBestOfNationFile = file;
            $scope.bestOfNationGroupSize = $scope.bestOfNationGroupSize || 5;
            $scope.bestOfNationImportDialogOpen = true;
        };

        $scope.cancelBestOfNationImport = function () {
            $scope.bestOfNationImportDialogOpen = false;
            $scope.pendingBestOfNationFile = null;
        };

        $scope.confirmBestOfNationImport = function () {
            var file = $scope.pendingBestOfNationFile;
            $scope.bestOfNationImportDialogOpen = false;
            $scope.pendingBestOfNationFile = null;
            if (!file) return;
            if (!($scope.bestOfNationGroupSize > 0)) $scope.bestOfNationGroupSize = 5;

            Excel.readRows(file).then(function (rows) {
                $scope.$apply(function () {
                    if (!rows || !rows.length) {
                        $scope.addNotice('error', 'Import failed: no Best of Nation rows were found in that file. Please import a valid CIS spreadsheet (.xlsx).', 'import-bon');
                        return;
                    }
                    $scope.resultsBestOfNations = rows;
                    $scope.buildScreens();
                    $scope.addNotice('info', 'Imported ' + rows.length + ' Best of Nation row(s), ' + $scope.bestOfNationGroupSize + ' per slide.', 'import-bon');
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.addNotice('error', 'Import failed: the Best of Nation file could not be read as a spreadsheet. Please import a valid CIS file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import-bon');
                });
            });
        };

        $scope.importTranslations = function (file) {
            if (!file) return;

            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.writeTranslations) {
                $scope.addNotice('error', 'Import failed: translations are unavailable outside the desktop app.', 'import-translations');
                return;
            }

            Excel.readRows(file).then(function (rows) {
                $scope.$apply(function () {
                    if (!rows || !rows.length || typeof rows[0]['Key'] === 'undefined') {
                        $scope.addNotice('error', 'Import failed: spreadsheet must have a "Key" column plus one column per language code.', 'import-translations');
                        return;
                    }

                    var langCodes = Object.keys(rows[0]).filter(function (h) { return h !== 'Key'; });
                    var languages = {};
                    var keyCount = 0;

                    rows.forEach(function (row) {
                        var key = row['Key'] ? String(row['Key']).trim() : null;
                        if (!key) return;
                        keyCount++;
                        langCodes.forEach(function (code) {
                            var val = row[code];
                            if (val === undefined || val === null || String(val).trim() === '') return;
                            if (!languages[code]) languages[code] = {};
                            languages[code][key] = String(val).trim();
                        });
                    });

                    window.ceremonator.project.writeTranslations(languages).then(function (result) {
                        $scope.$apply(function () {
                            if (!result || !result.ok) {
                                $scope.addNotice('error', 'Import failed: ' + (result && result.error ? result.error : 'no active project.'), 'import-translations');
                                return;
                            }

                            angular.forEach(FrameService.frames, function (frame, id) {
                                if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reloadScreen) {
                                    window.ceremonator.app.reloadScreen(id);
                                }
                            });

                            var declaredCodes = ($scope.languages || []).map(function (l) { return l.lang_code; });
                            var undeclared = langCodes.filter(function (c) { return declaredCodes.indexOf(c) < 0; });

                            $scope.addNotice('info', 'Imported ' + keyCount + ' translation key(s) across ' + langCodes.length + ' language column(s).', 'import-translations');
                            if (undeclared.length) {
                                $scope.addNotice('warning', 'Column(s) not listed in this project\'s languages: ' + undeclared.join(', ') + '. Saved, but won\'t show on screen until added to project.json → languages.', 'import-translations');
                            }
                        });
                    });
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.addNotice('error', 'Import failed: the file could not be read as a spreadsheet. Please import a valid Key/language-code file (.xlsx). (' + (error && error.message ? error.message : 'unknown error') + ')', 'import-translations');
                });
            });
        };

        /**
         * Excel format:
         * Skill Number | Frame Name
         * 01 | Podium Red
         * 02 | Podium Yellow
         * @param file
         */
        $scope.importFrameOrdering = function (file) {
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

                    $scope.refreshFramesAfterOrderingChange();
                });
            }).catch(function (error) {
                $scope.$apply(function () {
                    $scope.addNotice('error', 'Ordering import failed: ' + (error && error.message ? error.message : 'invalid spreadsheet'), 'ordering-import');
                });
            });
        };

        $scope.saveProject = function () {
            $scope.projectMenuOpen = false;

            var doSave = function () {
                FrameService.saveProject($scope.projectName || 'Ceremony Project', $scope.displayMode || 'windows', $scope.gridConfig, $scope.languages, $scope.bestOfNationGroupSize).then(function (result) {
                    if (result && result.ok) {
                        $scope.$apply(function () { $scope.projectDirty = false; });
                    } else if (result && !result.canceled) {
                        alert('Save failed: ' + (result.error || 'unknown error'));
                    }
                });
            };

            // Snapshot window positions before doSave() serializes them.
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

      };
    });

})();
