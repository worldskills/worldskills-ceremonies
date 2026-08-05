(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('TextFit', function () {

        // Greedy line-break — the same wrapping algorithm the browser uses.
        function greedyLineCount(words, width) {
            var lines = 1;
            var used = words[0].length;
            for (var i = 1; i < words.length; i++) {
                if (used + 1 + words[i].length <= width) {
                    used += 1 + words[i].length;
                } else {
                    lines++;
                    used = words[i].length;
                }
            }
            return lines;
        }

        // Narrowest column fitting text within maxLines — wrapping a long name (e.g. "Democratic Republic of the Congo": 32 chars on 1 line vs 11 over 3) keeps it from shrinking every other name's font.
        function narrowestColumn(text, maxLines) {
            var value = String(text == null ? '' : text);
            var words = value.split(' ').filter(function (word) { return !!word; });
            if (words.length < 2 || maxLines < 2) return value.length;

            var low = 0;
            angular.forEach(words, function (word) { low = Math.max(low, word.length); });
            var high = value.length;
            while (low < high) {
                var mid = Math.floor((low + high) / 2);
                if (greedyLineCount(words, mid) <= maxLines) {
                    high = mid;
                } else {
                    low = mid + 1;
                }
            }
            return low;
        }

        // Never 0: a blank name must not turn a "width / chars" formula into Infinity.
        function measureLongest(results, measure, maxLines) {
            var longest = 0;
            var longestWrapped = 0;
            angular.forEach(results, function (result) {
                var text = measure(result);
                longest = Math.max(longest, String(text || '').length);
                longestWrapped = Math.max(longestWrapped, narrowestColumn(text, maxLines));
            });
            return { chars: longest || 1, wrapped: longestWrapped || 1 };
        }

        // Per-row metrics, not a slide-wide max — one outlier name only resizes its own row (see .screen-grid .screen-medal).
        function annotateEach(results, measure, maxLines, charsField, wrappedField) {
            angular.forEach(results, function (result) {
                var text = measure(result);
                result[charsField] = String(text || '').length || 1;
                result[wrappedField] = narrowestColumn(text, maxLines) || 1;
            });
        }

        return {
            narrowestColumn: narrowestColumn,
            measureLongest: measureLongest,
            annotateEach: annotateEach
        };
    });

})();
