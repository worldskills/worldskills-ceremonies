(function () {
    'use strict';

    // One coloured console line per show event, so the control window's console reads back like
    // a timeline of the run. Fed by the control panel itself and, over IPC/WebSocket, by output
    // windows and Operator — see sendControlDebug in src/main/control-channel.js.
    angular.module('ceremoniesApp').factory('DebugLog', function (FrameService) {

        var COLORS = {
            'slide-changed': '#16a34a',
            'state-changed': '#0891b2',
            'video-failure': '#dc2626',
            'load-failure': '#ea580c',
            'remote-disconnected': '#ca8a04',
            'electron-failure': '#b91c1c',
            'remote-connected': '#7c3aed',
            'operator-feed-error': '#db2777',
            'streaming-display-unavailable': '#475569'
        };

        var BADGE = ';color:#fff;font-weight:bold;padding:2px 5px;border-radius:3px';

        function badge(color) {
            return 'background:' + color + BADGE;
        }

        function log(type, message, frameId) {
            var label = String(type || 'debug').replace(/-/g, ' ').toUpperCase();
            var line = String(message || '').replace(/\s+/g, ' ').trim();
            var frame = frameId && FrameService.frames[frameId];
            var frameLabel = frame && frame.label ? frame.label : frameId;
            var styles = [badge(COLORS[type] || '#334155'), 'color:inherit'];
            var format = '%c CEREMONATOR · ' + label + ' %c ';

            if (frameLabel) {
                format += '%c ' + frameLabel + ' %c ';
                styles.push(badge(FrameService.getFrameColor(frameId)), 'color:inherit');
            }

            console.log.apply(console, [format + line].concat(styles));
        }

        return { log: log };
    });

})();
