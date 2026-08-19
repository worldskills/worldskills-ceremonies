(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('SessionPart', function ($q, FrameService, FrameState, SessionSnapshot, WORKSPACE_MODES) {
      return function ($scope) {
        var dev = (window.ceremonator && window.ceremonator.dev) || {};

        // dev.enabled here is the DEV badge's own flag (are we running an unpackaged build),
        // independent of SessionSnapshot.enabled (which is now always on) — keep it that way so
        // the badge stays dev-only even though clearAllData below is available in every build.
        $scope.dev = {
            enabled: !!dev.isDev
        };

        $scope.clearAllData = function () {
            if (!confirm('Clear all session data? This discards the current run\'s progress (imported results, frame assignments, live/preview state) so the app restarts fresh. Your project files, templates and skill/member data are not affected.')) return;
            SessionSnapshot.clear();
            $scope.clearScreenStorage();
            $scope.addNotice('info', 'Session data cleared — restart to begin a fresh run.', 'session-cleared');
        };

        function restoreDevSessionUi(ui) {
            $scope.queueViewOpen = !!ui.queueViewOpen;
            $scope.allFramesViewOpen = !!ui.allFramesViewOpen;
            if (ui.queueLayout) $scope.queueLayout = ui.queueLayout;
            if (ui.selectedSkillNumber) {
                angular.forEach($scope.catalogSkillList || [], function (skill) {
                    if (skill.number === ui.selectedSkillNumber) {
                        $scope.selectSkillForQueue(skill);
                    }
                });
            }
        }

        $scope.restoreDevSession = function () {
            if (!SessionSnapshot.enabled) return $q.resolve(false);

            return $q.when(SessionSnapshot.load()).then(function (saved) {
                if (!saved) {
                    $scope.clearScreenStorage();
                    SessionSnapshot.restoring = false;
                    return false;
                }

                if(saved.workspaceMode) {
                    $scope.workspaceMode = saved.workspaceMode;
                }

                if (saved.projectName) {
                    $scope.projectName = saved.projectName;
                }

                if (saved.displayMode) {
                    $scope.displayMode = saved.displayMode;
                }

                if (saved.gridConfig) {
                    $scope.gridConfig = angular.extend({}, $scope.gridConfig, saved.gridConfig);
                }

                FrameService.setSkillOrder(saved.skillOrder);

                if (saved.frames) {
                    FrameService.loadFromProject(saved.frames);
                }

                $scope.results = saved.results || [];
                $scope.resultsBestOfNations = saved.resultsBestOfNations || [];
                $scope.bestOfNationGroupSize = saved.bestOfNationGroupSize || 5;
                $scope.uploaded = !!saved.uploaded;

                $scope.buildScreens();
                SessionSnapshot.restoreRuntime(saved.runtime);

                angular.forEach(FrameService.frames, function (frame, id) {
                    FrameState.publish(id);
                });

                if (saved.activeFrameId) FrameService.setActiveFrame(saved.activeFrameId);
                restoreDevSessionUi(saved.ui || {});
                $scope.projectDirty = !!saved.projectDirty;

                SessionSnapshot.restoring = false;
                $scope.addNotice('info', 'Restored previous session — ' +
                    $scope.results.length + ' result row(s), ' +
                    Object.keys(FrameService.frames).length + ' frame(s).', 'dev-session');
                return true;
            });
        };

        if (SessionSnapshot.enabled) {
            SessionSnapshot.registerCollector(function () {
                return {
                    projectName: $scope.projectName || null,
                    displayMode: $scope.displayMode || null,
                    workspaceMode: $scope.workspaceMode || WORKSPACE_MODES.SETUP,
                    gridConfig: angular.copy($scope.gridConfig),
                    uploaded: !!$scope.uploaded,
                    projectDirty: !!$scope.projectDirty,
                    activeFrameId: FrameService.activeFrameId,
                    results: $scope.results || [],
                    resultsBestOfNations: $scope.resultsBestOfNations || [],
                    bestOfNationGroupSize: $scope.bestOfNationGroupSize || 5,
                    frames: FrameService.serializeForProject(),
                    skillOrder: FrameService.skillOrder || [],
                    runtime: SessionSnapshot.serializeRuntime(),
                    ui: {
                        queueViewOpen: !!$scope.queueViewOpen,
                        allFramesViewOpen: !!$scope.allFramesViewOpen,
                        queueLayout: $scope.queueLayout,
                        selectedSkillNumber: $scope.skillsSelectedSkill ? $scope.skillsSelectedSkill.number : null
                    }
                };
            });

            $scope.$watch(function () {
                return SessionSnapshot.fingerprint($scope);
            }, function () {
                SessionSnapshot.schedule();
            });
        }
      };
    });

})();
