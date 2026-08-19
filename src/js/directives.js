(function () {
    'use strict';

    angular.module('ceremoniesApp').directive('autoFocus', function ($timeout) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                scope.$watch(attrs.autoFocus, function (val) {
                    if (val) {
                        $timeout(function () { element[0].focus(); element[0].select(); }, 0);
                    }
                });
            }
        };
    });

    /**
     * ws-fit — shrink an element's font until its content fits its own box.
     */
    angular.module('ceremoniesApp').directive('wsFit', function () {

        // Halvings of the [min, max] range. 10 lands within 0.06px on a 64px
        // range — finer than a rendered pixel, so more would only cost reflows.
        var STEPS = 10;
        var MIN_PX = 6;

        // Oscillation backstop. A real resize or content change needs one fit per
        // frame; this only trips if fitting somehow feeds itself.
        var BURST_LIMIT = 12;
        var BURST_WINDOW_MS = 250;

        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                var el = element[0];
                var queued = false;
                var burst = 0;
                var burstAt = 0;

                // +1 tolerates sub-pixel layout rounding, which would otherwise
                // read as permanent overflow and shrink text that already fits.
                function overflows() {
                    return el.scrollHeight > el.clientHeight + 1 ||
                           el.scrollWidth > el.clientWidth + 1;
                }

                function fit() {
                    el.style.fontSize = '';
                    var max = parseFloat(attrs.wsFitMax) || parseFloat(window.getComputedStyle(el).fontSize);
                    var min = parseFloat(attrs.wsFitMin) || MIN_PX;
                    var size = max;

                    if (overflows()) {
                        var lo = min;
                        var hi = max;
                        for (var i = 0; i < STEPS; i++) {
                            var mid = (lo + hi) / 2;
                            el.style.fontSize = mid + 'px';
                            if (overflows()) { hi = mid; } else { lo = mid; }
                        }
                        size = lo;
                    }

                    el.style.fontSize = size + 'px';

                    // Silent clipping is the worst show-day outcome. Mark it so
                    // rehearsal catches it — outlined in preview, invisible live.
                    if (size <= min && overflows()) {
                        el.setAttribute('data-ws-fit-overflow', '');
                    } else {
                        el.removeAttribute('data-ws-fit-overflow');
                    }
                }

                function schedule() {
                    if (queued) return;
                    queued = true;
                    window.requestAnimationFrame(function () {
                        queued = false;
                        var now = window.performance.now();
                        if (now - burstAt > BURST_WINDOW_MS) {
                            burst = 0;
                            burstAt = now;
                        }
                        if (++burst > BURST_LIMIT) return;
                        fit();
                    });
                }

                // ng-repeat rendering, async `translate` text, web-font swap and
                // grid-view cell resizing all land here without this directive
                // needing to know about any of them.
                var resizeObserver = new ResizeObserver(schedule);
                resizeObserver.observe(el);

                var mutationObserver = new MutationObserver(schedule);
                mutationObserver.observe(el, { childList: true, characterData: true, subtree: true });

                if (window.document.fonts) {
                    window.document.fonts.ready.then(schedule);
                }

                // 60+ reveals per show, each re-including the template: leaking two
                // observers per row would accumulate all night.
                scope.$on('$destroy', function () {
                    resizeObserver.disconnect();
                    mutationObserver.disconnect();
                });

                schedule();
            }
        };
    });

})();
