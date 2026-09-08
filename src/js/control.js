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

                $scope.uploaded = false;
                $scope.FrameService = FrameService;
                $scope.displays = Displays.list;
                $scope.workspaceCapabilities = { manageWindows: true, preview: true, copyScript: true };
                $scope.projectDirty = false;
                $scope.WORKSPACE_MODES = WORKSPACE_MODES;
                $scope.workspaceMode = WORKSPACE_MODES.SETUP;

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

                function loadProjectConfig() {
                    if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.current) {
                        return $q.resolve();
                    }

                    // $q.when bridges the preload promise into the digest, so no $apply.
                    return $q.when(window.ceremonator.project.current()).then(function (result) {
                        if (!result || !result.project) {
                            return;
                        }
                        if (result.orderingWarning) {
                            $scope.addNotice('warning', result.orderingWarning, 'ordering-corrupt');
                        }

                        var project = result.project;
                        $scope.projectName = project.name;
                        $scope.displayMode = project.displayMode;
                        $scope.bestOfNationGroupSize = project.bestOfNationGroupSize || $scope.bestOfNationGroupSize;
                        $scope.languages =
                            project.languages && project.languages.length ? project.languages : [{ lang_code: 'en' }];
                        $scope.remoteConfig = angular.extend({}, $scope.remoteConfig, project.remote || {});

                        FrameService.setFeedTypes(project.feedTypes);
                        Routing.set(project.routing);

                        if (project.gridConfig) {
                            $scope.gridConfig = angular.extend({}, $scope.gridConfig, project.gridConfig);
                        }

                        FrameService.setSkillOrder(project.skillOrder);

                        if (project.frames) {
                            FrameService.loadFromProject(project.frames);
                        }
                    });
                }

                $scope.buildCatalog = function () {
                    var result = Catalog.build({
                        skills: $scope.skills,
                        members: $scope.members,
                        results: $scope.results,
                        bestOfNation: $scope.resultsBestOfNations,
                        bestOfNationGroupSize: $scope.bestOfNationGroupSize,
                    });

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

                $scope.toggleState = function (screen, slide, state, live) {
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
                        $scope.update(screen);
                    } else {
                        publishAfterEdit(screen, slide);
                    }
                };

                $scope.resetStates = function (screen, slide) {
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
                };

                $scope.updateContext = function (screen, slide) {
                    publishAfterEdit(screen, slide);
                };

                $scope.showSlide = function (screen, slide, initialState) {
                    var frame = FrameService.frames[screen];
                    var wasPreviewing = frame.previewSlide === slide;
                    var sameSlide = frame.slide === slide;
                    var wasBlanked = Object.keys(frame.blankedFeeds || {}).length > 0;

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
