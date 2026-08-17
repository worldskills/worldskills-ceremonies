(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('DevPart', function ($q, FrameService, FrameState, DevSession, WORKSPACE_MODES) {
      return function ($scope) {
        $scope.dev = {
            enabled: DevSession.enabled
        };

        if (!DevSession.enabled) {
            $scope.clearScreenStorage();
        }

        $scope.clearDevCache = function () {
            if (!confirm('Clear the dev session cache? The next reload or restart will start fresh instead of resuming this run.')) return;
            DevSession.clear();
            $scope.addNotice('info', 'Dev cache cleared — next reload starts fresh.', 'dev-cache-cleared');
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
            if (!DevSession.enabled) return $q.resolve(false);

            return $q.when(DevSession.load()).then(function (saved) {
                if (!saved) {
                    $scope.clearScreenStorage();
                    DevSession.restoring = false;
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

                if (saved.frames) {
                    FrameService.loadFromProject(saved.frames);
                }

                $scope.results = saved.results || [];
                $scope.resultsBestOfNations = saved.resultsBestOfNations || [];
                $scope.bestOfNationGroupSize = saved.bestOfNationGroupSize || 5;
                $scope.uploaded = !!saved.uploaded;

                $scope.buildScreens();
                DevSession.restoreRuntime(saved.runtime);

                angular.forEach(FrameService.frames, function (frame, id) {
                    FrameState.publish(id);
                });

                if (saved.activeFrameId) FrameService.setActiveFrame(saved.activeFrameId);
                restoreDevSessionUi(saved.ui || {});
                $scope.projectDirty = !!saved.projectDirty;

                DevSession.restoring = false;
                $scope.addNotice('info', 'Dev: restored session after hot reload — ' +
                    $scope.results.length + ' result row(s), ' +
                    Object.keys(FrameService.frames).length + ' frame(s).', 'dev-session');
                return true;
            });
        };

        if (DevSession.enabled) {
            DevSession.registerCollector(function () {
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
                    runtime: DevSession.serializeRuntime(),
                    ui: {
                        queueViewOpen: !!$scope.queueViewOpen,
                        allFramesViewOpen: !!$scope.allFramesViewOpen,
                        queueLayout: $scope.queueLayout,
                        selectedSkillNumber: $scope.skillsSelectedSkill ? $scope.skillsSelectedSkill.number : null
                    }
                };
            });

            $scope.$watch(function () {
                return DevSession.fingerprint($scope);
            }, function () {
                DevSession.schedule();
            });
        }
      };
    });

})();
