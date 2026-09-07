(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Displays', function ($q, $window, Notices) {
        var list = [];
        var bridge = $window.ceremonator && $window.ceremonator.displays;

        function refresh() {
            if (!bridge) {
                return $q.resolve(list);
            }
            return $q.when(bridge.list()).then(
                function (displays) {
                    // Keep the array shared by every monitor selector.
                    list.splice(0, list.length);
                    (displays || []).forEach(function (display, index) {
                        list.push(
                            angular.extend({}, display, {
                                index: index,
                                label: display.label || 'Display ' + (index + 1),
                            })
                        );
                    });
                    return list;
                },
                function () {
                    Notices.add(
                        'warning',
                        'Could not refresh the display list. Check the connected monitors.',
                        'displays-load'
                    );
                    return list;
                }
            );
        }

        if (bridge && bridge.onChanged) {
            bridge.onChanged(refresh);
        }
        refresh();

        return { list: list, refresh: refresh };
    });
})();
