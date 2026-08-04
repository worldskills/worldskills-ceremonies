(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('TextFit', function () {

        // Lines a column `width` characters wide takes to hold `words`, breaking
        // greedily at spaces — the same algorithm the browser uses.
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

        // Narrowest column, in characters, that still holds `text` within
        // `maxLines` lines. A single word can't wrap, so it returns its own
        // length.
        //
        // The screens size their text from this: one very long name would
        // otherwise shrink every other name on the slide to fit itself on one
        // line — "Democratic Republic of the Congo" needs 32 characters on one
        // line but only 11 across three, which is 1.7x the font size.
        function narrowestColumn(text, maxLines) {
            var value = String(text == null ? '' : text);
            var words = value.split(' ').filter(function (word) { return !!word; });
            if (words.length < 2 || maxLines < 2) return value.length;

            // No column can be narrower than the longest single word.
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

        // The longest of `results` under `measure`, on one line and wrapped over
        // `maxLines` — the pair of inputs every results layout needs. Never 0: a
        // blank name must not turn a "width / chars" formula into Infinity.
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

        // Writes each result's own one-line/wrapped char metrics onto that
        // result (as `charsField`/`wrappedField`) instead of collapsing them
        // into one slide-wide max — so one outlier name only sizes its own
        // row (see .screen-grid .screen-medal in screen.css), not the rest
        // of the grid.
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
