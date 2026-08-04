(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $q, FrameService, FrameState, Catalog, Notices, DevSession, FramesPart, QueuePart, ProjectPart) {

        $scope.uploaded = false;
        $scope.FrameService = FrameService;
        $scope.projectDirty = false;

        // Development flags, surfaced as navbar badges (see control.html).
        $scope.dev = {
            enabled: DevSession.enabled,
            forceDefaultTemplate: DevSession.forceDefaultTemplate
        };

        // Dev-only: wipes the persisted dev-session.json snapshot on disk so
        // the next hot reload / restart starts clean instead of resuming
        // this run. Does not touch the currently running control panel.
        $scope.clearDevCache = function () {
            if (!confirm('Clear the dev session cache? The next reload or restart will start fresh instead of resuming this run.')) return;
            DevSession.clear();
            $scope.addNotice('info', 'Dev cache cleared — next reload starts fresh.', 'dev-cache-cleared');
        };

        // ── Notification banner ────────────────────────────────────
        $scope.notices = Notices.list;
        $scope.addNotice = Notices.add;
        $scope.dismissNotice = Notices.dismiss;

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

        // The single screen-<id> writer is FrameState.publish — a superset of
        // what this used to write inline (it also falls back to
        // slides[0]/empty.html when there is no active slide yet). Kept as a
        // separate wrapper, rather than folding projectDirty into the writer
        // itself, because the writer also runs from paths that must NOT mark
        // the project dirty (opening a window, opening the grid).
        $scope.update = function (id) {
            FrameState.publish(id);
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

        // results
        $scope.results = [];

        // best of nations
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
                    // A skill reassignment (this path) must still reset state to
                    // empty, unlike a plain catalog rebuild — assembleFrame no
                    // longer does this itself (see its comment).
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

        // ── Invariant 1: a part body may only *define* functions and
        // *initialize* state, never *call* another part's scope.foo() during
        // attach. Runtime cross-part calls (scope.update(id),
        // scope.showSlide(...)) are fine and order-independent, and are the
        // normal way parts refer to each other.
        // Invariant 2: the three *Part(scope) calls below must be
        // synchronous in this controller body, and the $q.all boot chain
        // below must stay promise-based. restoreDevSession() (via
        // restoreDevSessionUi) calls $scope.selectSkillForQueue, owned by
        // QueuePart — that only works because $q.all([skillsLoaded,
        // membersLoaded]) wraps two $http promises and therefore resolves on
        // a later digest tick, long after this synchronous controller body
        // (parts included) has finished. If this chain is ever made
        // synchronous, or a part is ever attached from inside a .then(),
        // this becomes "$scope.selectSkillForQueue is not a function" on
        // every dev hot-reload that restores a selected skill.
        FramesPart($scope);
        QueuePart($scope);
        ProjectPart($scope);

        // Template alias only — JS must go through FrameService.frames.
        $scope.screens = FrameService.frames;

        // Clear stale screen state left by a previous control session, so an open
        // screen window can't keep rendering content this session doesn't know
        // about. In dev this is deferred until we know there is no session to
        // restore — otherwise every hot reload would blank the screens it is
        // about to repopulate. See restoreDevSession().
        function clearScreenStorage() {
            angular.forEach(FrameService.frames, function(config, screen) {
                window.localStorage.removeItem('screen-' + screen);
            });
        }

        if (!DevSession.enabled) {
            clearScreenStorage();
        }

        // Best of Nation grouping in Catalog.build() reads $scope.members, so the
        // first build has to wait for both catalogs — not just the skills one.
        $q.all([skillsLoaded, membersLoaded])
            .then(loadProjectConfig)
            .then(restoreDevSession)
            .then(function (restored) {
                if (!restored) $scope.buildScreens();
            });

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

})();
