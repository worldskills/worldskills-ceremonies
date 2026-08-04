(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Notices', function ($timeout) {

        // Mutated in place (push/splice), never reassigned — `list` is handed
        // out once and must stay the same array reference the caller bound
        // to, or a later add()/dismiss() would silently stop updating it.
        var notices = [];

        function dismiss(notice) {
            var idx = notices.indexOf(notice);
            if (idx >= 0) notices.splice(idx, 1);
        }

        function add(level, text, key) {
            // De-duplicate by key so repeated failures don't stack.
            if (key) {
                for (var i = notices.length - 1; i >= 0; i--) {
                    if (notices[i].key === key) notices.splice(i, 1);
                }
            }
            var notice = { level: level, text: text, key: key || null };
            notices.push(notice);
            if (level === 'info') {
                $timeout(function () { dismiss(notice); }, 6000);
            }
            return notice;
        }

        return {
            list: notices,
            add: add,
            dismiss: dismiss
        };
    });

})();
