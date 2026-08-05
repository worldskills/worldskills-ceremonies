(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Notices', function ($timeout) {

        // Mutated in place (push/splice), never reassigned — callers hold onto this exact array reference.
        var notices = [];

        function dismiss(notice) {
            var idx = notices.indexOf(notice);
            if (idx >= 0) notices.splice(idx, 1);
        }

        function add(level, text, key) {
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
