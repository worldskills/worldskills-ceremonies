(function () {
    'use strict';

    angular.module('ceremoniesApp').controller('ControlCtrl', function ($scope, $http, $q, DATA_BASE, FrameService, FrameState, Catalog, Notices, DevSession, FramesPart, QueuePart, ProjectPart) {

        $scope.uploaded = false;
        $scope.FrameService = FrameService;
        $scope.workspaceCapabilities = { manageWindows: true, preview: true, copyScript: true };
        $scope.projectDirty = false;
        $scope.workspaceMode = 'setup';

        $scope.skills = [];
        $scope.members = [];
        $scope.results = [];

        $scope.resultsBestOfNations = [];
        // Loaded from project, 5 by default
        $scope.bestOfNationGroupSize = 5;

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
            if ($scope.workspaceMode !== 'run' || $scope.projectMenuOpen || $scope.importMenuOpen || $scope.feedMenuOpen || $scope.gridConfigDialogOpen || $scope.bestOfNationImportDialogOpen) return;
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
            }
        });

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

        // Pure live-state read — used by slide/state advance logic (Next/Prev, skip-to-next-
        // unrevealed-state) which is unambiguously about the live presentation, regardless of
        // what's currently pinned to Preview. Row-level buttons use rowHasState() below instead.
        $scope.hasState = function (slide, state) {
            if (slide.state != undefined) {
                return !(slide.state.indexOf(state) < 0);
            }
            return false;
        };

        // The array of currently-revealed states for a row's Toggle/Reset controls —
        // frame.previewState when this exact slide is the one pinned to Preview (via
        // previewSlide() below), else the slide's own (live) state. This is what makes it
        // possible to rehearse an upcoming reveal on the Preview screen without it also going
        // live, even when previewing the exact slide that's currently live: previewState is a
        // frame-level array, completely independent of slide.state, so toggling it can never
        // touch what the live audience sees.
        function stateArrayFor(screen, slide) {
            var frame = FrameService.frames[screen];
            if (frame && frame.previewSlide === slide) {
                if (!frame.previewState) frame.previewState = [];
                return frame.previewState;
            }
            // A slide that's only ever been previewed (never shown live via showSlide, which is
            // what normally initializes this) can still have no .state array yet.
            if (!slide.state) slide.state = [];
            return slide.state;
        }

        $scope.rowHasState = function (screen, slide, state) {
            return stateArrayFor(screen, slide).indexOf(state) >= 0;
        };

        // Edit/state controls are enabled for whichever slide a frame is currently showing OR
        // previewing — previewing lets the operator rehearse states without touching live.
        $scope.canEditSlide = function (screen, slide) {
            var frame = FrameService.frames[screen];
            return !!frame && (frame.slide === slide || frame.previewSlide === slide);
        };

        $scope.isPreviewingSlide = function (screen, slide) {
            var frame = FrameService.frames[screen];
            return !!frame && frame.previewSlide === slide;
        };

        // Editing the slide pinned to Preview is rehearsal — publish preview only, no dirty
        // flag (same precedent as previewSlide() below). Anything else (the live slide, or a
        // slide that's neither) is a real show change and goes through the normal $scope.update.
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

        // Clicking a slide row commits it to Live. If that slide is (or was) pinned to Preview,
        // this is the "go live with what I rehearsed" gesture: the previewed state carries over
        // instead of being wiped, and the pin clears — so Preview drops back to mirroring Live.
        // This is the only path that un-pins a slide other than resetFrame()/re-previewing.
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

            // Same-slide guard, extended: a plain re-click of the already-live, not-blanked slide
            // is still a no-op, but committing a preview pin or un-blanking always republishes
            // even if that slide was already the frame's slide.
            if (!sameSlide || wasPreviewing || wasBlanked) {
                $scope.update(screen);
            }
        };

        // Pushes to the Preview channel only — Live windows (and the grid view) are untouched.
        // Does not set slide.done: unlike showSlide, previewing isn't "shown".
        $scope.previewSlide = function ($event, screen, slide) {
            if ($event) $event.stopPropagation();
            var frame = FrameService.frames[screen];
            if (frame.previewSlide !== slide) {
                // Snapshot the slide's current (live) state as Preview's starting point — from
                // here, Preview's revealed states are independent (see stateArrayFor above). A
                // second click on the same already-previewed slide leaves this snapshot alone,
                // so it doesn't clobber any state a Preview-only toggle already set.
                frame.previewState = angular.copy(slide.state || []);
            }
            frame.previewSlide = slide;
            FrameState.publishPreview(screen);
        };

        // Un-pins Preview so it drops back to mirroring Live — covers all 3 states an operator
        // can hit: nothing pinned (no-op, already mirroring), same slide pinned with a different
        // rehearsed state (previewState is discarded, slide.state wins), or a different slide
        // entirely pinned (Preview switches back to whatever's live). Button + 'R' shortcut.
        $scope.resetPreview = function (screen) {
            var frame = FrameService.frames[screen];
            if (!frame || !frame.previewSlide) return;
            frame.previewSlide = undefined;
            frame.previewState = undefined;
            FrameState.publishPreview(screen);
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
                $scope.bestOfNationGroupSize = saved.bestOfNationGroupSize || 5;
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
            $q.when(window.ceremonator.frames.openIds()).then(function (result) {
                var ids = (result && result.ids) || [];
                var counts = (result && result.counts) || {};
                angular.forEach(ids, function (id) {
                    if (!FrameService.frames[id]) return;
                    FrameService.frames[id].status = 'ready';
                    if (counts[id]) FrameService.frames[id].windows = counts[id];
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
                    bestOfNationGroupSize: $scope.bestOfNationGroupSize || 5,
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
                    if (data.windows) frame.windows = data.windows;
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
                if (!$scope.$$phase) $scope.$apply(apply); else apply();
            });
        }

        $scope.remoteInfo = null;
        if (window.ceremonator && window.ceremonator.remote && window.ceremonator.remote.info) {
            $q.when(window.ceremonator.remote.info()).then(function (info) {
                $scope.remoteInfo = info;
            });
        }

        // Whitelist of actions a remote control panel may trigger — each just calls the same
        // scope function the local operator UI uses. Anything not listed here (project save/
        // load, frame add/remove, window/grid management, dev-session controls) is unreachable
        // from remote by construction, not by a runtime permission check.
        var REMOTE_ACTIONS = {
            showSlide: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.showSlide(action.frameId, slide);
            },
            previewSlide: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.previewSlide(null, action.frameId, slide);
            },
            toggleState: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.toggleState(action.frameId, slide, action.state);
            },
            resetStates: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) $scope.resetStates(action.frameId, slide);
            },
            updateContext: function (frame, action) {
                var slide = frame.slides[action.slideIndex];
                if (action.slideId && (!slide || slide.slideId !== action.slideId)) return;
                if (slide) {
                    slide.context = action.context;
                    $scope.updateContext(action.frameId, slide);
                }
            },
            resetPreview: function (frame, action) { $scope.resetPreview(action.frameId); },
            resetFrame: function (frame, action) { $scope.resetFrame(action.frameId); },
            prevSlideForFrame: function (frame, action) { $scope.prevSlideForFrame(action.frameId); },
            nextSlideForFrame: function (frame, action) { $scope.nextSlideForFrame(action.frameId); }
        };

        if (window.ceremonator && window.ceremonator.remote && window.ceremonator.remote.onAction) {
            window.ceremonator.remote.onAction(function (action) {
                var handler = action && REMOTE_ACTIONS[action.name];
                var frame = action && FrameService.frames[action.frameId];
                if (!handler || !frame) return;
                var apply = function () { handler(frame, action); };
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
