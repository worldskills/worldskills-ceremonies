(function () {
    'use strict';

    angular.module('ceremonatorStartup', []).controller('StartupCtrl', function ($scope) {

        $scope.recentProjects = [];
        $scope.bundledProjects = [];
        $scope.error = null;

        function loadRecent() {
            if (!window.ceremonator || !window.ceremonator.project) return;
            window.ceremonator.project.recent().then(function (recent) {
                $scope.$apply(function () {
                    $scope.recentProjects = recent || [];
                });
            });
        }

        function loadBundled() {
            if (!window.ceremonator || !window.ceremonator.project) return;
            window.ceremonator.project.bundled().then(function (bundled) {
                $scope.$apply(function () {
                    $scope.bundledProjects = bundled || [];
                });
            });
        }

        $scope.create = function () {
            $scope.error = null;
            window.ceremonator.project.create().then(function (result) {
                if (result && result.canceled) return;
                if (result && result.ok) {
                    window.ceremonator.app.openControl();
                } else {
                    $scope.$apply(function () {
                        $scope.error = (result && result.error) ? result.error : 'Failed to create project.';
                    });
                }
            });
        };

        $scope.open = function () {
            $scope.error = null;
            window.ceremonator.project.open().then(function (result) {
                if (result && result.canceled) return;
                if (result && result.ok) {
                    window.ceremonator.app.openControl();
                } else {
                    $scope.$apply(function () {
                        $scope.error = (result && result.error) ? result.error : 'Failed to open project.';
                    });
                }
            });
        };

        $scope.openRecent = function (recent) {
            if (recent.unavailable) return;
            $scope.error = null;
            window.ceremonator.project.openPath({ dir: recent.path }).then(function (result) {
                if (result && result.ok) {
                    window.ceremonator.app.openControl();
                } else if (result && result.code === 'missing') {
                    $scope.$apply(function () {
                        recent.unavailable = true;
                    });
                } else if (result && !result.canceled) {
                    $scope.$apply(function () {
                        $scope.error = (result && result.error) ? result.error : 'Failed to open project.';
                    });
                }
            });
        };

        $scope.openBundled = function (bundled) {
            $scope.error = null;
            window.ceremonator.project.openPath({ dir: bundled.path }).then(function (result) {
                if (result && result.ok) {
                    window.ceremonator.app.openControl();
                } else if (result && !result.canceled) {
                    $scope.$apply(function () {
                        $scope.error = (result && result.error) ? result.error : 'Failed to open project.';
                    });
                }
            });
        };

        $scope.removeRecent = function ($event, recent) {
            $event.stopPropagation();
            $scope.recentProjects = $scope.recentProjects.filter(function (r) {
                return r.path !== recent.path;
            });
            if (window.ceremonator && window.ceremonator.project && window.ceremonator.project.removeRecent) {
                window.ceremonator.project.removeRecent(recent.path);
            }
        };

        loadRecent();
        loadBundled();
    });

})();
