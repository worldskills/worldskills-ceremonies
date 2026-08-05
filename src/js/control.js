(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $q, DATA_BASE, FrameService, FrameState, Catalog, Notices, DevSession, FramesPart, QueuePart, ProjectPart) {

        $scope.uploaded = false;
        $scope.FrameService = FrameService;
        $scope.projectDirty = false;

        $scope.dev = {
            enabled: DevSession.enabled
        };

        $scope.clearDevCache = function () {
            if (!confirm('Clear the dev session cache? The next reload or restart will start fresh instead of resuming this run.')) return;
            DevSession.clear();
            $scope.addNotice('info', 'Dev cache cleared — next reload starts fresh.', 'dev-cache-cleared');
        };

        $scope.notices = Notices.list;
        $scope.addNotice = Notices.add;
        $scope.dismissNotice = Notices.dismiss;

        // Intentionally no autosave-on-close — saving is explicit (Project → Save).

        window.addEventListener('keydown', function (e) {
            var target = e.target || {};
            var tag = (target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                $scope.$apply(function () {
                    if ($scope.queueViewOpen) { $scope.queueListNext(); } else { $scope.nextSlide(); }
                });
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                $scope.$apply(function () {
                    if ($scope.queueViewOpen) { $scope.queueListPrev(); } else { $scope.prevSlide(); }
                });
            }
        });

        // projectDirty is set here, not inside FrameState.publish, because the
        // writer also runs from paths (opening a window, opening the grid)
        // that must NOT mark the project dirty.
        $scope.update = function (id) {
            FrameState.publish(id);
            $scope.projectDirty = true;
        };

        $scope.skills = [];
        $scope.members = [];

        // Re-run on project switch, since skills/members are per-project data.
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
                $scope.languages = (project.languages && project.languages.length) ? project.languages : [{ lang_code: 'en' }];
                if (project.gridConfig) {
                    $scope.gridConfig = angular.extend({}, $scope.gridConfig, project.gridConfig);
                }
                if (project.frames) {
                    FrameService.loadFromProject(project.frames);
                }
            });
        }

        $scope.results = [];

        $scope.resultsBestOfNations = [];

        $scope.buildCatalog = function () {
            var result = Catalog.build({
                skills: $scope.skills,
                members: $scope.members,
                results: $scope.results,
                bestOfNation: $scope.resultsBestOfNations
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

        $scope.refreshFramesAfterOrderingChange = function () {
            if ($scope.catalog) {
                angular.forEach(FrameService.frames, function (frame, id) {
                    $scope.assembleFrame(frame, $scope.catalog);
                    if (frame.slides && frame.slides.length && frame.slides.indexOf(frame.slide) < 0) {
                        frame.slide = frame.slides[0];
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

        $scope.toggleState = function (screen, slide, state) {
            FrameService.setActiveFrame(screen);
            if ($scope.hasState(slide, state)) {
                slide.state.splice(slide.state.indexOf(state), 1);
            } else {
                slide.state.push(state);
            }
            $scope.update(screen);
        };

        $scope.resetStates = function (screen, slide) {
            FrameService.setActiveFrame(screen);
            slide.state = [];
            $scope.update(screen);
        };

        $scope.updateContext = function (screen, slide) {
            $scope.update(screen);
        };

        $scope.showSlide = function (screen, slide) {
            if (FrameService.frames[screen].slide != slide) {
                slide.done = true;
                slide.state = [];
                FrameService.frames[screen].slide = slide;
                $scope.update(screen);
            }
        };

        // Invariant 1: a part body may only define/initialize during attach —
        // never call another part's scope.foo() while attaching (runtime
        // cross-part calls like scope.update()/scope.showSlide() are fine).
        // Invariant 2: these three calls must stay synchronous here, and the
        // $q.all boot chain below must stay promise-based. restoreDevSession()
        // calls $scope.selectSkillForQueue (owned by QueuePart) — that only
        // works because $q.all([skillsLoaded, membersLoaded]) resolves on a
        // later digest tick, after all three parts have attached. Make this
        // synchronous, or attach a part from inside a .then(), and it breaks
        // with "$scope.selectSkillForQueue is not a function" on every dev
        // hot-reload.
        FramesPart($scope);
        QueuePart($scope);
        ProjectPart($scope);

        // Template alias only — JS must go through FrameService.frames.
        $scope.screens = FrameService.frames;

        // Deferred in dev until restoreDevSession() confirms there's nothing to
        // restore — otherwise every hot reload would blank the screens it's
        // about to repopulate.
        function clearScreenStorage() {
            angular.forEach(FrameService.frames, function(config, screen) {
                FrameState.clear(screen);
            });
        }

        if (!DevSession.enabled) {
            clearScreenStorage();
        }

        // Catalog.build()'s Best of Nation grouping reads $scope.members, so
        // the first build must wait for both catalogs, not just skills.
        $scope.loadCatalogs()
            .then(loadProjectConfig)
            .then(restoreDevSession)
            .then(function (restored) {
                if (!restored) $scope.buildScreens();
            });

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

                // No forceRedistribute — keeps the restored skill→frame
                // assignment; passing true here would redistribute on reload.
                $scope.buildScreens();
                DevSession.restoreRuntime(saved.runtime);

                angular.forEach(FrameService.frames, function (frame, id) {
                    FrameState.publish(id);
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

        // A dev restart reopens frame windows before this renderer has its frame
        // list back, so early 'connecting'/'ready' notices miss their frame —
        // reconciled here once after restoring.
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
                // Reselect from catalogSkillList, not a fresh object — the
                // skills navigator binds to that array's item identity.
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

            // One $watch on a fingerprint instead of a save call at every
            // mutation site — anything that changes show state changes it.
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

})();
