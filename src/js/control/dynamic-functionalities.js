(function () {
    'use strict';

    angular.module('ceremoniesControlWorkspace').component('dynamicFunctionalities', {
        bindings: {
            definitions: '<',
            groups: '<',
            activeIds: '<',
            frames: '<',
            scopeKind: '@',
            currentFrameId: '<',
            currentFrameOnly: '<',
            disabled: '<',
            onSet: '&',
            onClearGroup: '&',
        },
        templateUrl: 'partials/dynamic-functionalities.html',
        controller: function () {
            var ctrl = this;

            ctrl.isActive = function (item) {
                return !!item && (ctrl.activeIds || []).indexOf(item.id) >= 0;
            };

            ctrl.shortLabel = function (item) {
                var frame = item && ctrl.frames && ctrl.frames[item.frameId];
                return (frame && frame.label) || (item && item.label) || '';
            };

            ctrl.color = function (item) {
                var frame = item && ctrl.frames && ctrl.frames[item.frameId];
                return (frame && frame.color) || '#94a3b8';
            };

            ctrl.$onChanges = function () {
                var byGroup = Object.create(null);
                ctrl.rows = [];
                angular.forEach(ctrl.definitions || [], function (item) {
                    if ((item.scope || 'global') !== (ctrl.scopeKind || 'global')) return;
                    var key = item.group ? 'group:' + item.group : 'independent';
                    if (!byGroup[key]) {
                        var metadata =
                            ctrl.groups && Object.prototype.hasOwnProperty.call(ctrl.groups, item.group)
                                ? ctrl.groups[item.group]
                                : {};
                        byGroup[key] = {
                            key: key,
                            group: item.group,
                            label:
                                metadata.label ||
                                (item.group ? item.group.replace(/[-_]/g, ' ') : 'Dynamic functionalities'),
                            description: metadata.description || '',
                            clearLabel: metadata.clearLabel || 'Clear',
                            items: [],
                        };
                        ctrl.rows.push(byGroup[key]);
                    }
                    byGroup[key].items.push(item);
                });
                angular.forEach(ctrl.rows, function (row) {
                    row.active = row.items.filter(ctrl.isActive)[0];
                    row.frameLinked =
                        !!row.group &&
                        row.items.every(function (item) {
                            return !!item.frameId;
                        });
                    row.forCurrentFrame = !!ctrl.currentFrameOnly && row.frameLinked;
                    row.current = row.items.filter(function (item) {
                        return (
                            item.frameId &&
                            item.frameId === ctrl.currentFrameId &&
                            ctrl.frames &&
                            ctrl.frames[item.frameId]
                        );
                    })[0];
                });
            };

            ctrl.set = function (item, enabled) {
                if (!ctrl.disabled && item) ctrl.onSet({ id: item.id, enabled: enabled });
            };

            ctrl.clear = function (row) {
                if (!ctrl.disabled && row.group) ctrl.onClearGroup({ group: row.group });
            };
        },
    });
})();
