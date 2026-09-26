(function () {
    'use strict';

    angular
        .module('ceremoniesApp')
        .controller(
            'ControlCtrl',
            function (
                $scope,
                $http,
                $q,
                DATA_BASE,
                Displays,
                FrameService,
                FrameState,
                Catalog,
                Scripts,
                DebugLog,
                Notices,
                Routing,
                SessionSnapshot,
                SlideRowScope,
                StorageKeys,
                WORKSPACE_MODES,
                FramesPart,
                QueuePart,
                ProjectPart,
                SessionPart,
                RemotePart
            ) {
                var debug = DebugLog.log;

                // Clear transient effects before session restoration can reopen outputs.
                FrameState.clearDynamicState();
                $scope.setDynamicFunctionality = FrameState.setDynamicFunctionality;
                $scope.clearDynamicGroup = FrameState.clearDynamicGroup;

                $scope.uploaded = false;
                $scope.FrameService = FrameService;
                $scope.displays = Displays.list;
                $scope.workspaceCapabilities = { manageWindows: true, preview: true, copyScript: true };
                $scope.projectDirty = false;
                $scope.WORKSPACE_MODES = WORKSPACE_MODES;
                $scope.workspaceMode = WORKSPACE_MODES.SETUP;
                $scope.windowsManagerOpen = false;
                $scope.openOutputs = [];
                $scope.forceQuit = window.ceremonator?.app?.forceQuit;
                $scope.showWindowsManager = function () {
                    $scope.windowsManagerOpen = !$scope.windowsManagerOpen;
                    if ($scope.windowsManagerOpen) {
                        refreshOpenOutputs();
                    }
                };

                function refreshOpenOutputs() {
                    window.ceremonator.outputs.list().then(function (outputs) {
                        $scope.$evalAsync(function () {
                            $scope.openOutputs = outputs;
                        });
                    });
                }

                $scope.closeOutput = function (output) {
                    window.ceremonator.outputs.close({ type: output.type, id: output.id });
                };

                if (window.ceremonator) {
                    window.ceremonator.outputs.onChanged(function () {
                        if ($scope.windowsManagerOpen) {
                            refreshOpenOutputs();
                        }
                    });
                }

                // ── Test Mode ──────────────────────────────────────────────────
                $scope.testMode = StorageKeys.testMode();
                $scope.toggleTestMode = function () {
                    $scope.testMode = !$scope.testMode;
                    StorageKeys.setTestMode($scope.testMode);
                    angular.forEach(FrameService.frames, function (_frame, id) {
                        FrameState.publish(id);
                    });
                };
                $scope.skills = [];
                $scope.members = [];
                $scope.results = [];

                $scope.resultsBestOfNations = [];
                $scope.scriptTranslations = {};
                $scope.scriptConfig = {};
                // Loaded from project, 5 by default
                $scope.bestOfNationGroupSize = 5;

                $scope.notices = Notices.list;
                $scope.addNotice = Notices.add;
                $scope.dismissNotice = Notices.dismiss;

                $scope.update = function (id) {
                    FrameState.publish(id);
                };

                $scope.syncRemote = FrameState.syncRemote;

                $scope.loadCatalogs = function () {
                    var skillsLoaded = $http.get(DATA_BASE + 'skills.json').then(
                        function (response) {
                            var skills = angular.isArray(response.data) ? response.data : [];
                            if (!skills.length) {
                                $scope.addNotice(
                                    'error',
                                    'Skill catalog (' +
                                        DATA_BASE +
                                        'skills.json) is empty. The app cannot build ceremonies.',
                                    'skills-load'
                                );
                            }
                            $scope.skills = skills;
                        },
                        function (error) {
                            $scope.addNotice(
                                'error',
                                'Failed to load the skill catalog (' +
                                    DATA_BASE +
                                    'skills.json). The app data may be missing from this build. Ceremonies cannot be built until this is resolved.',
                                'skills-load'
                            );
                        }
                    );

                    var membersLoaded = $http.get(DATA_BASE + 'members.json').then(
                        function (response) {
                            $scope.members = angular.isArray(response.data) ? response.data : [];
                        },
                        function (error) {
                            $scope.addNotice(
                                'warning',
                                'Failed to load the member list (' +
                                    DATA_BASE +
                                    'members.json). Member names may be incomplete.',
                                'members-load'
                            );
                        }
                    );

                    return $q.all([skillsLoaded, membersLoaded]);
                };

                function scriptOptions() {
                    return {
                        skills: $scope.skills,
                        members: $scope.members,
                        languages: $scope.languages,
                        translations: $scope.scriptTranslations,
                        scripts: $scope.scriptConfig,
                    };
                }

                $scope.applyScripts = function () {
                    Scripts.applyFrames(FrameService.frames, scriptOptions());
                };

                $scope.setScriptTranslations = function (translations) {
                    $scope.scriptTranslations = angular.copy(translations || {});
                    Scripts.applyCatalog($scope.catalog, scriptOptions());
                    $scope.applyScripts();
                };

                $scope.loadScriptTranslations = function () {
                    var project = window.ceremonator && window.ceremonator.project;
                    if (!project || !project.readTranslations) {
                        $scope.setScriptTranslations({});
                        return $q.resolve();
                    }
                    return $q.when(project.readTranslations()).then(
                        function (result) {
                            $scope.setScriptTranslations((result && result.ok && result.languages) || {});
                        },
                        function () {
                            $scope.setScriptTranslations({});
                        }
                    );
                };

                $scope.loadScriptConfig = function () {
                    var project = window.ceremonator && window.ceremonator.project;
                    if (!project || !project.readScripts) {
                        $scope.scriptConfig = {};
                        return $q.resolve();
                    }
                    return $q.when(project.readScripts()).then(
                        function (result) {
                            $scope.scriptConfig = angular.copy((result && result.ok && result.scripts) || {});
                            if (!result || !result.ok) {
                                $scope.addNotice(
                                    'warning',
                                    (result && result.error) || 'Project scripts could not be loaded.',
                                    'project-scripts'
                                );
                            }
                        },
                        function () {
                            $scope.scriptConfig = {};
                            $scope.addNotice('warning', 'Project scripts could not be loaded.', 'project-scripts');
                        }
                    );
                };

                var gridConfigDefaults;
                function applyProjectConfig(result) {
                    if (!result || !result.project) {
                        return;
                    }
                    if (result.orderingWarning) {
                        $scope.addNotice('warning', result.orderingWarning, 'ordering-corrupt');
                    }

                    var project = result.project;
                    $scope.projectName = project.name;
                    $scope.displayMode = project.displayMode;
                    $scope.bestOfNationGroupSize = project.bestOfNationGroupSize || 5;
                    $scope.languages =
                        project.languages && project.languages.length ? project.languages : [{ lang_code: 'en' }];
                    $scope.remoteConfig = angular.copy(project.remote || {});

                    FrameService.setFeedTypes(project.feedTypes);
                    FrameService.freeSlides = angular.copy(project.freeSlides || []);
                    FrameService.dynamicFunctionalities = angular.copy(project.dynamicFunctionalities || []);
                    FrameService.dynamicFunctionalityGroups = angular.copy(project.dynamicFunctionalityGroups || {});
                    Routing.set(project.routing);
                    FrameService.awardingSequence = angular.copy(project.awardingSequence || null);

                    if (!gridConfigDefaults) {
                        gridConfigDefaults = angular.copy($scope.gridConfig);
                    }
                    var gridDefaults = angular.copy(gridConfigDefaults);
                    if (FrameService.awardingSequence) {
                        gridDefaults.autoHighlightPodium = FrameService.awardingSequence.autoHighlightPodium;
                    }
                    $scope.gridConfig = angular.extend(gridDefaults, project.gridConfig || {});

                    FrameService.setSkillOrder(project.skillOrder);
                    if (project.frames) {
                        FrameService.loadFromProject(project.frames);
                    }
                }
                $scope.applyProjectConfig = applyProjectConfig;

                function loadProjectConfig() {
                    if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.current) {
                        return $q.resolve();
                    }

                    // $q.when bridges the preload promise into the digest, so no $apply.
                    return $q.when(window.ceremonator.project.current()).then(applyProjectConfig);
                }

                $scope.buildCatalog = function () {
                    var result = Catalog.build({
                        skills: $scope.skills,
                        members: $scope.members,
                        results: $scope.results,
                        bestOfNation: $scope.resultsBestOfNations,
                        bestOfNationGroupSize: $scope.bestOfNationGroupSize,
                    });
                    Scripts.applyCatalog(result.slides, scriptOptions());

                    $scope.lastImportSkipped = result.skippedRows;

                    return result.slides;
                };

                $scope.assembleFrame = FrameState.assembleFrame;

                $scope.buildScreens = function () {
                    $scope.catalog = $scope.buildCatalog();

                    var frameIds = Object.keys(FrameService.frames);

                    var avFrameIds = frameIds.filter(function (id) {
                        return FrameService.frames[id].ordering.includeAlbertVidal;
                    });

                    if (avFrameIds.length > 1) {
                        FrameService.setAlbertVidalFrame(avFrameIds[0]);
                    }

                    if ($scope.results.length > 0) {
                        var assignedNums = {};
                        frameIds.forEach(function (id) {
                            FrameService.frames[id].ordering.skillNumbers.forEach(function (n) {
                                assignedNums[n] = true;
                            });
                        });

                        var newSkillNums = FrameService.sortSkills($scope.skills)
                            .filter(function (s) {
                                return !!$scope.catalog[s.number] && !assignedNums[s.number];
                            })
                            .map(function (s) {
                                return s.number;
                            });

                        newSkillNums.forEach(function (num, i) {
                            var targetId = frameIds[i % frameIds.length];
                            FrameService.frames[targetId].ordering.skillNumbers.push(num);
                        });
                    }

                    angular.forEach(FrameService.frames, function (frame, id) {
                        FrameService.frames[id] = $scope.assembleFrame(frame, $scope.catalog);
                    });
                    $scope.applyScripts();

                    $scope.rebuildCatalogSkillList();
                    $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
                    $scope.buildQueueList();
                    angular.forEach(FrameService.frames, function (frame, id) {
                        $scope.update(id);
                    });
                    if ($scope.skillsSelectedSkill) {
                        $scope.skillsSelectedSlides = $scope.getSkillQueueSlides($scope.skillsSelectedSkill.number);
                    }
                };

                $scope.rebuildCatalogSkillList = function () {
                    $scope.catalogSkillList = FrameService.sortSkills($scope.skills)
                        .filter(function (skill) {
                            return !!$scope.catalog[skill.number];
                        })
                        .map(function (skill) {
                            return {
                                number: skill.number,
                                name: skill.name.text,
                                assignedFrame: $scope.getSkillFrame(skill.number) || '',
                            };
                        });
                };

                $scope.refreshFramesAfterOrderingChange = function () {
                    if ($scope.catalog) {
                        angular.forEach(FrameService.frames, function (frame, id) {
                            FrameService.frames[id] = $scope.assembleFrame(frame, $scope.catalog);
                            if (frame.slide && frame.slides.indexOf(frame.slide) < 0) {
                                frame.slide = undefined;
                            }
                            if (frame.slide) {
                                frame.slide.state = [];
                            }
                        });
                    }
                    $scope.applyScripts();
                    $scope.rebuildCatalogSkillList();
                    $scope.albertVidalFrame = $scope.getAlbertVidalFrame() || '';
                    $scope.buildQueueList();
                    angular.forEach(FrameService.frames, function (frame, id) {
                        $scope.update(id);
                    });
                    if ($scope.skillsSelectedSkill) {
                        $scope.skillsSelectedSlides = $scope.getSkillQueueSlides($scope.skillsSelectedSkill.number);
                    }
                    $scope.projectDirty = true;
                };

                function stateArrayFor(screen, slide) {
                    var frame = FrameService.frames[screen];
                    if (frame && frame.previewSlide === slide) {
                        if (!frame.previewState) {
                            frame.previewState = [];
                        }
                        return frame.previewState;
                    }

                    if (!slide.state) {
                        slide.state = [];
                    }
                    return slide.state;
                }

                function publishAfterEdit(screen, slide) {
                    var frame = FrameService.frames[screen];
                    if (frame && frame.previewSlide === slide) {
                        FrameState.publishPreview(screen);
                    } else {
                        $scope.update(screen);
                    }
                }

                function applyAwardingHighlight(screen, slide, autoHighlightPodium) {
                    if (!FrameService.awardingSequence) return;
                    if (autoHighlightPodium === undefined) {
                        autoHighlightPodium = $scope.gridConfig.autoHighlightPodium;
                    }
                    if (autoHighlightPodium && FrameService.frames[screen].slide === slide) {
                        FrameState.syncAwardingHighlight(screen);
                    }
                }

                $scope.toggleState = function (screen, slide, state, live, autoHighlightPodium) {
                    FrameService.setActiveFrame(screen);
                    var frame = FrameService.frames[screen];
                    // Navigation changes Live; explicit row edits follow the Preview pin.
                    var states = live ? slide.state || (slide.state = []) : stateArrayFor(screen, slide);
                    var idx = states.indexOf(state);
                    if (idx >= 0) {
                        states.splice(idx, 1);
                    } else {
                        states.push(state);
                    }
                    debug(
                        'state-changed',
                        'Turned state “' +
                            state +
                            '” ' +
                            (idx >= 0 ? 'off' : 'on') +
                            ' for slide “' +
                            (slide.label || 'Untitled') +
                            '”.',
                        screen
                    );
                    if (live) {
                        frame.blankedFeeds = {};
                        frame.queueComplete = false;
                        $scope.update(screen);
                    } else {
                        publishAfterEdit(screen, slide);
                    }
                    if (live || frame.previewSlide !== slide) {
                        applyAwardingHighlight(screen, slide, autoHighlightPodium);
                    }
                };

                $scope.resetStates = function (screen, slide, autoHighlightPodium) {
                    FrameService.setActiveFrame(screen);
                    var frame = FrameService.frames[screen];
                    var hadStates = stateArrayFor(screen, slide).length > 0;
                    if (frame && frame.previewSlide === slide) {
                        frame.previewState = [];
                    } else {
                        slide.state = [];
                    }
                    if (hadStates) {
                        debug(
                            'state-changed',
                            'Reset all states for slide “' + (slide.label || 'Untitled') + '”.',
                            screen
                        );
                    }
                    publishAfterEdit(screen, slide);
                    if (frame.previewSlide !== slide) {
                        applyAwardingHighlight(screen, slide, autoHighlightPodium);
                    }
                };

                $scope.updateContext = function (screen, slide) {
                    if (slide.kind === 'free') {
                        var validContext =
                            slide.context && typeof slide.context === 'object' && !angular.isArray(slide.context);
                        angular.forEach(FrameService.freeSlides, function (definition) {
                            if (window.CeremonatorFreeSlides.slideId(definition, screen) !== slide.slideId) return;
                            if (validContext) definition.context = angular.copy(slide.context);
                            else slide.context = angular.copy(definition.context);
                            if (validContext) {
                                angular.forEach(FrameService.frames, function (frame, frameId) {
                                    var assignedSlide = null;
                                    angular.forEach(frame.slides || [], function (candidate) {
                                        if (
                                            candidate.slideId ===
                                            window.CeremonatorFreeSlides.slideId(definition, frameId)
                                        ) {
                                            candidate.context = angular.copy(slide.context);
                                            assignedSlide = candidate;
                                        }
                                    });
                                    if (
                                        frameId !== screen &&
                                        assignedSlide &&
                                        (frame.slide === assignedSlide || frame.previewSlide === assignedSlide)
                                    )
                                        $scope.update(frameId);
                                });
                            }
                        });
                        if (!validContext) {
                            $scope.addNotice(
                                'warning',
                                'Free slide content must be a valid JSON object.',
                                'free-slide-context'
                            );
                            return;
                        }
                        $scope.projectDirty = true;
                    }
                    publishAfterEdit(screen, slide);
                };

                function showSlideOnFrame(screen, slide, initialState, autoHighlightPodium) {
                    var frame = FrameService.frames[screen];
                    var wasPreviewing = frame.previewSlide === slide;
                    var sameSlide = frame.slide === slide;
                    var wasBlanked = Object.keys(frame.blankedFeeds || {}).length > 0;

                    frame.queueComplete = false;
                    if (!sameSlide) {
                        slide.done = true;
                        frame.slide = slide;
                    }
                    frame.blankedFeeds = {};

                    if (wasPreviewing) {
                        slide.state = frame.previewState || [];
                        frame.previewSlide = undefined;
                        frame.previewState = undefined;
                    } else if (!sameSlide) {
                        slide.state = angular.copy(initialState || []);
                    }

                    var clearedHighlights = FrameState.clearHighlightsForSlide(slide);

                    if (autoHighlightPodium === undefined) {
                        autoHighlightPodium = $scope.gridConfig.autoHighlightPodium;
                    }
                    if (!sameSlide || wasPreviewing || wasBlanked) {
                        debug(
                            'slide-changed',
                            'Changed the live slide to “' + (slide.label || 'Untitled') + '”.',
                            screen
                        );

                        if (!sameSlide && initialState && initialState.length) {
                            debug(
                                'state-changed',
                                'Entered the slide with ' +
                                    initialState
                                        .map(function (state) {
                                            return '“' + state + '”';
                                        })
                                        .join(', ') +
                                    ' active.',
                                screen
                            );
                        }

                        $scope.update(screen);
                    }

                    if (autoHighlightPodium && !clearedHighlights) {
                        if (FrameService.awardingSequence) {
                            FrameState.syncAwardingHighlight(screen);
                        } else {
                            FrameState.highlightPodium(screen);
                        }
                    }
                }

                $scope.showSlide = function (screen, slide, initialState, autoHighlightPodium, confirmationHandled) {
                    var definition = null;
                    if (slide.kind === 'free') {
                        definition = FrameService.freeSlides.filter(function (candidate) {
                            return window.CeremonatorFreeSlides.frameIds(candidate).some(function (frameId) {
                                return window.CeremonatorFreeSlides.slideId(candidate, frameId) === slide.slideId;
                            });
                        })[0];
                    }
                    if (!confirmationHandled && !window.CeremonatorLiveConfirm.allowSlide(slide)) return;
                    var synchronized = definition && definition.synchronized === true ? definition : null;
                    if (!synchronized) {
                        showSlideOnFrame(screen, slide, initialState, autoHighlightPodium);
                        return;
                    }
                    angular.forEach(window.CeremonatorFreeSlides.frameIds(synchronized), function (frameId) {
                        var siblingId = window.CeremonatorFreeSlides.slideId(synchronized, frameId);
                        var frame = FrameService.frames[frameId];
                        var sibling = ((frame && frame.slides) || []).filter(function (candidate) {
                            return candidate.slideId === siblingId;
                        })[0];
                        if (sibling) showSlideOnFrame(frameId, sibling, initialState, false);
                    });
                };

                $scope.previewSlide = function ($event, screen, slide) {
                    if ($event) {
                        $event.stopPropagation();
                    }
                    var frame = FrameService.frames[screen];
                    if (frame.previewSlide !== slide) {
                        frame.previewState = angular.copy(slide.state || []);
                    }
                    frame.previewSlide = slide;
                    FrameState.publishPreview(screen);
                };

                $scope.resetPreview = function (screen) {
                    var frame = FrameService.frames[screen];
                    if (!frame || !frame.previewSlide) {
                        return;
                    }
                    frame.previewSlide = undefined;
                    frame.previewState = undefined;
                    FrameState.publishPreview(screen);
                };

                $scope.clearScreenStorage = function () {
                    angular.forEach(FrameService.frames, function (config, screen) {
                        FrameState.clear(screen);
                    });
                };

                $scope.hasScripts = function (frameId) {
                    if (frameId) return Scripts.hasScripts(FrameService.frames[frameId]);
                    return Object.keys(FrameService.frames).some(function (id) {
                        return Scripts.hasScripts(FrameService.frames[id]);
                    });
                };

                $scope.exportScripts = function (frameId) {
                    $scope.scriptMenuOpen = false;
                    if ($scope.scriptExporting) return;
                    var content = frameId
                        ? Scripts.exportText(FrameService.frames, [frameId])
                        : Scripts.exportQueueText($scope.queueList);
                    if (!content) {
                        $scope.addNotice('warning', 'There are no slide scripts to export.', 'script-export');
                        return;
                    }
                    var project = window.ceremonator && window.ceremonator.project;
                    if (!project || !project.exportScripts) {
                        $scope.addNotice('error', 'Script export is unavailable.', 'script-export');
                        return;
                    }
                    var scopeName = frameId ? FrameService.frames[frameId].label : 'All frames';
                    $scope.scriptExporting = true;
                    return $q
                        .when(
                            project.exportScripts({
                                filename: ($scope.projectName || 'Ceremony') + ' - Scripts - ' + scopeName + '.txt',
                                content: content + '\n',
                            })
                        )
                        .then(function (result) {
                            if (result && result.ok) {
                                $scope.addNotice(
                                    'info',
                                    'Exported scripts to ' + result.filePath + '.',
                                    'script-export'
                                );
                            } else if (!result || !result.canceled) {
                                $scope.addNotice(
                                    'error',
                                    'Script export failed: ' + ((result && result.error) || 'unknown error'),
                                    'script-export'
                                );
                            }
                        })
                        .catch(function (error) {
                            $scope.addNotice(
                                'error',
                                'Script export failed: ' + (error && error.message ? error.message : 'unknown error'),
                                'script-export'
                            );
                        })
                        .finally(function () {
                            $scope.scriptExporting = false;
                        });
                };

                $scope.copyPaste = function ($event, text) {
                    var target = $event.target;
                    $event.stopPropagation();

                    navigator.permissions.query({ name: 'clipboard-write' }).then(function (result) {
                        if (result.state !== 'granted' && result.state !== 'prompt') {
                            return;
                        }
                        navigator.clipboard.writeText(text).then(
                            function () {
                                target.style.color = '#379d44';
                            },
                            function () {
                                alert('Failed to paste to clipboard.');
                            }
                        );
                    });
                };

                SlideRowScope($scope);
                FramesPart($scope);
                QueuePart($scope);
                ProjectPart($scope);
                SessionPart($scope);
                RemotePart($scope);

                $scope.screens = FrameService.frames;

                // Catalog.build()'s Best of Nation grouping reads $scope.members, so
                // the first build must wait for both catalogs, not just skills.
                $scope
                    .loadCatalogs()
                    .then(loadProjectConfig)
                    .then($scope.loadScriptTranslations)
                    .then($scope.loadScriptConfig)
                    .then($scope.restoreDevSession)
                    .then(function (restored) {
                        if (!restored) {
                            $scope.buildScreens();
                        }
                    });

                if (window.ceremonator) {
                    if (window.ceremonator.onNotice) {
                        window.ceremonator.onNotice(function (data) {
                            if (!data || !data.text) {
                                return;
                            }
                            $scope.$evalAsync(function () {
                                $scope.addNotice(data.level || 'info', data.text);
                            });
                        });
                    }

                    if (window.ceremonator.onDebug) {
                        window.ceremonator.onDebug(function (data) {
                            if (data) {
                                debug(data.type, data.message);
                            }
                        });
                    }

                    if (window.ceremonator.onClearAllDataRequested) {
                        window.ceremonator.onClearAllDataRequested(function () {
                            $scope.$evalAsync($scope.clearAllData);
                        });
                    }

                    if (window.ceremonator.onFrameStatus) {
                        // Handle moving/resizing windows and save their position to project

                        window.ceremonator.onFrameStatus(function (data) {
                            var frame = FrameService.frames[data.frameId];
                            if (!frame) {
                                return;
                            }
                            $scope.$evalAsync(function () {
                                var hadLive = !!(frame.windows && frame.windows.live);
                                frame.status = data.status;

                                if (data.windows) {
                                    frame.windows = data.windows;
                                }

                                if (!hadLive && frame.windows && frame.windows.live) {
                                    $scope.workspaceMode = WORKSPACE_MODES.RUN;
                                    $scope.queueViewOpen = true;
                                }

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

                                FrameState.syncRemote();
                            });
                        });
                    }
                }

                // Mirrored eagerly since a window close handler is synchronous and can't await IPC.
                $scope.$watch('projectDirty', function (dirty) {
                    if (window.ceremonator && window.ceremonator.project && window.ceremonator.project.setDirty) {
                        window.ceremonator.project.setDirty(dirty);
                    }
                });

                window.addEventListener('keydown', function (e) {
                    var target = e.target || {};
                    var tag = (target.tagName || '').toLowerCase();
                    if (
                        $scope.workspaceMode !== WORKSPACE_MODES.RUN ||
                        $scope.projectMenuOpen ||
                        $scope.importMenuOpen ||
                        $scope.feedMenuOpen ||
                        $scope.scriptMenuOpen ||
                        $scope.windowsManagerOpen ||
                        $scope.gridConfigDialogOpen ||
                        $scope.remoteConfigDialogOpen ||
                        $scope.bestOfNationImportDialogOpen
                    ) {
                        return;
                    }
                    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
                        return;
                    }

                    if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        $scope.$apply(function () {
                            if ($scope.queueViewOpen) {
                                $scope.queueListNext();
                            } else {
                                $scope.nextSlide();
                            }
                        });
                    } else if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        $scope.$apply(function () {
                            if ($scope.queueViewOpen) {
                                $scope.queueListPrev();
                            } else {
                                $scope.prevSlide();
                            }
                        });
                    } else if ((e.key === 'r' || e.key === 'R') && e.ctrlKey) {
                        e.preventDefault();
                        $scope.$apply(function () {
                            $scope.resetPreview(FrameService.activeFrameId);
                        });
                    } else if ((e.key === 'b' || e.key === 'B') && e.ctrlKey) {
                        e.preventDefault();
                        $scope.$apply(function () {
                            $scope.resetFrame(FrameService.activeFrameId);
                        });
                    }
                });
            }
        );
})();
