(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $q, DATA_BASE, FrameService, FrameState, Catalog, Notices, DevSession, WORKSPACE_MODES, FramesPart, QueuePart, ProjectPart, DevPart, RemotePart) {
        $scope.uploaded = false;
        $scope.FrameService = FrameService;
        $scope.workspaceCapabilities = { manageWindows: true, preview: true, copyScript: true };
        $scope.projectDirty = false;
        $scope.WORKSPACE_MODES = WORKSPACE_MODES;
        $scope.workspaceMode = WORKSPACE_MODES.SETUP;

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
            var skillsLoaded = $http.get(DATA_BASE + 'skills.json').then(function (response) {
                var skills = angular.isArray(response.data) ? response.data : [];
                if (!skills.length) {
                    $scope.addNotice('error', 'Skill catalog (' + DATA_BASE + 'skills.json) is empty. The app cannot build ceremonies.', 'skills-load');
                }
                $scope.skills = skills;
            }, function (error) {
                $scope.addNotice('error', 'Failed to load the skill catalog (' + DATA_BASE + 'skills.json). The app data may be missing from this build. Ceremonies cannot be built until this is resolved.', 'skills-load');
            });

            var membersLoaded = $http.get(DATA_BASE + 'members.json').then(function (response) {
                $scope.members = angular.isArray(response.data) ? response.data : [];
            }, function (error) {
                $scope.addNotice('warning', 'Failed to load the member list (' + DATA_BASE + 'members.json). Member names may be incomplete.', 'members-load');
            });

            return $q.all([skillsLoaded, membersLoaded]);
        };

        function loadProjectConfig() {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.current) {
                return $q.resolve();
            }

            // $q.when bridges the preload promise into the digest, so no $apply.
            return $q.when(window.ceremonator.project.current()).then(function (result) {
                if (!result || !result.project) return;
                if (result.orderingWarning) {
                    $scope.addNotice('warning', result.orderingWarning, 'ordering-corrupt');
                }

                var project = result.project;
                $scope.projectName = project.name;
                $scope.displayMode = project.displayMode;
                $scope.bestOfNationGroupSize = project.bestOfNationGroupSize || $scope.bestOfNationGroupSize;
                $scope.languages = (project.languages && project.languages.length) ? project.languages : [{ lang_code: 'en' }];

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
                bestOfNationGroupSize: $scope.bestOfNationGroupSize
            });

            $scope.lastImportSkipped = result.skippedRows;

            return result.slides;
        };

        $scope.assembleFrame = FrameState.assembleFrame;

        $scope.buildScreens = function (forceRedistribute) {
            $scope.catalog = $scope.buildCatalog();

            var frameIds = Object.keys(FrameService.frames);
            var anyHasSkills = frameIds.some(function (id) {
                return FrameService.frames[id].ordering.skillNumbers.length > 0;
            });

            if (!anyHasSkills && $scope.results.length > 0) {
                var skillNums = $scope.skills
                    .filter(function (s) { return !!$scope.catalog[s.number]; })
                    .map(function (s) { return s.number; });

                skillNums.forEach(function (num, i) {
                    var targetId = frameIds[i % frameIds.length];
                    FrameService.frames[targetId].ordering.skillNumbers.push(num);
                });

                FrameService.frames[frameIds[0]].ordering.includeAlbertVidal = true;
            } else if (forceRedistribute && anyHasSkills && $scope.results.length > 0) {
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
            $scope.catalogSkillList = FrameService.sortSkills($scope.skills).filter(function (skill) {
                return !!$scope.catalog[skill.number];
            }).map(function (skill) {
                return {
                    number: skill.number,
                    name: skill.name.text,
                    assignedFrame: $scope.getSkillFrame(skill.number) || ''
                };
            });
        };

        $scope.refreshFramesAfterOrderingChange = function () {
            if ($scope.catalog) {
                angular.forEach(FrameService.frames, function (frame, id) {
                    $scope.assembleFrame(frame, $scope.catalog);
                    // The shown slide moved to another frame (or was dropped) — go blank
                    // rather than jumping to whatever slide now sits first in the list.
                    if (frame.slide && frame.slides.indexOf(frame.slide) < 0) {
                        frame.slide = undefined;
                    }
                    // Unlike a plain catalog rebuild, a reassignment must reset
                    // slide.state — assembleFrame no longer does this itself.
                    if (frame.slide) frame.slide.state = [];
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

        $scope.hasState = function (slide, state) {
            if (slide.state != undefined) {
                return !(slide.state.indexOf(state) < 0);
            }
            return false;
        };


        $scope.rowHasState = function (screen, slide, state) {
            return stateArrayFor(screen, slide).indexOf(state) >= 0;
        };

        $scope.canEditSlide = function (screen, slide) {
            return true;
        };

        $scope.isPreviewingSlide = function (screen, slide) {
            var frame = FrameService.frames[screen];
            return !!frame && frame.previewSlide === slide;
        };

        function stateArrayFor(screen, slide) {
            var frame = FrameService.frames[screen];
            if (frame && frame.previewSlide === slide) {
                if (!frame.previewState) frame.previewState = [];
                return frame.previewState;
            }

            if (!slide.state) slide.state = [];
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

        $scope.toggleState = function (screen, slide, state) {
            FrameService.setActiveFrame(screen);
            var states = stateArrayFor(screen, slide);
            var idx = states.indexOf(state);
            if (idx >= 0) {
                states.splice(idx, 1);
            } else {
                states.push(state);
            }
            publishAfterEdit(screen, slide);
        };

        $scope.resetStates = function (screen, slide) {
            FrameService.setActiveFrame(screen);
            var frame = FrameService.frames[screen];
            if (frame && frame.previewSlide === slide) {
                frame.previewState = [];
            } else {
                slide.state = [];
            }
            publishAfterEdit(screen, slide);
        };

        $scope.updateContext = function (screen, slide) {
            publishAfterEdit(screen, slide);
        };

        $scope.showSlide = function (screen, slide) {
            var frame = FrameService.frames[screen];
            var wasPreviewing = frame.previewSlide === slide;
            var sameSlide = frame.slide === slide;
            var wasBlanked = !!frame.blanked;

            if (!sameSlide) {
                slide.done = true;
                frame.slide = slide;
            }
            frame.blanked = false;

            if (wasPreviewing) {
                slide.state = frame.previewState || [];
                frame.previewSlide = undefined;
                frame.previewState = undefined;
            } else if (!sameSlide) {
                slide.state = [];
            }

            if (!sameSlide || wasPreviewing || wasBlanked) {
                $scope.update(screen);
            }
        };

        $scope.previewSlide = function ($event, screen, slide) {
            if ($event) $event.stopPropagation();
            var frame = FrameService.frames[screen];
            if (frame.previewSlide !== slide) {
                frame.previewState = angular.copy(slide.state || []);
            }
            frame.previewSlide = slide;
            FrameState.publishPreview(screen);
        };

        $scope.resetPreview = function (screen) {
            var frame = FrameService.frames[screen];
            if (!frame || !frame.previewSlide) return;
            frame.previewSlide = undefined;
            frame.previewState = undefined;
            FrameState.publishPreview(screen);
        };

        $scope.clearScreenStorage = function () {
            angular.forEach(FrameService.frames, function(config, screen) {
                FrameState.clear(screen);
            });
        };

        FramesPart($scope);
        QueuePart($scope);
        ProjectPart($scope);
        DevPart($scope);
        RemotePart($scope);

        $scope.screens = FrameService.frames;

        // Catalog.build()'s Best of Nation grouping reads $scope.members, so
        // the first build must wait for both catalogs, not just skills.
        $scope.loadCatalogs()
            .then(loadProjectConfig)
            .then($scope.restoreDevSession)
            .then(function (restored) {
                if (!restored) $scope.buildScreens();
            });

        if (window.ceremonator && window.ceremonator.onNotice) {
            window.ceremonator.onNotice(function (data) {
                if (!data || !data.text) return;
                var apply = function () { $scope.addNotice(data.level || 'info', data.text); };
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

        // Handle moving/resizing windows and save their position to project

        if (window.ceremonator && window.ceremonator.onFrameStatus) {
            window.ceremonator.onFrameStatus(function (data) {
                var frame = FrameService.frames[data.frameId];
                if (!frame) return;
                var apply = function () {
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
                };
                if (!$scope.$$phase) {
                    $scope.$apply(apply);
                } else {
                    apply();
                }
            });
        }

        window.addEventListener('keydown', function (e) {
            var target = e.target || {};
            var tag = (target.tagName || '').toLowerCase();
            if ($scope.workspaceMode !== WORKSPACE_MODES.RUN || $scope.projectMenuOpen || $scope.importMenuOpen || $scope.feedMenuOpen || $scope.gridConfigDialogOpen || $scope.bestOfNationImportDialogOpen) return;
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return;

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
    });

})();
