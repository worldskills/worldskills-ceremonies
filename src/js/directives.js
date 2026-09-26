(function () {
    'use strict';

    angular.module('ceremoniesApp').directive('autoFocus', function ($timeout) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                scope.$watch(attrs.autoFocus, function (val) {
                    if (val) {
                        $timeout(function () {
                            element[0].focus();
                            element[0].select();
                        }, 0);
                    }
                });
            },
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
                var visibility = el.style.visibility;
                var queued = false;
                var fittedWidth;
                var fittedHeight;
                var burst = 0;
                var burstAt = 0;

                // +1 tolerates sub-pixel layout rounding, which would otherwise
                // read as permanent overflow and shrink text that already fits.
                function overflows() {
                    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
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
                            if (overflows()) {
                                hi = mid;
                            } else {
                                lo = mid;
                            }
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
                    // ResizeObserver runs after layout. Hide now so the browser
                    // never paints the old size before the next-frame fit.
                    el.style.visibility = 'hidden';
                    if (queued) {
                        return;
                    }
                    queued = true;
                    window.requestAnimationFrame(function () {
                        queued = false;
                        var now = window.performance.now();
                        if (now - burstAt > BURST_WINDOW_MS) {
                            burst = 0;
                            burstAt = now;
                        }
                        if (++burst > BURST_LIMIT) {
                            el.style.visibility = visibility;
                            return;
                        }
                        try {
                            fit();
                        } finally {
                            fittedWidth = el.clientWidth;
                            fittedHeight = el.clientHeight;
                            el.style.visibility = visibility;
                        }
                    });
                }

                // ng-repeat rendering, async `translate` text, web-font swap and
                // grid-view cell resizing all land here without this directive
                // needing to know about any of them.
                var resizeObserver = new ResizeObserver(function () {
                    if (el.clientWidth !== fittedWidth || el.clientHeight !== fittedHeight) {
                        schedule();
                    }
                });
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
            },
        };
    });

    angular.module('ceremoniesApp').directive('wsEqualAreaFlags', function () {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                var el = element[0];
                var visibility = el.style.visibility;
                var animationFrame = null;
                var fittedWidth;
                var fittedHeight;

                function fit() {
                    var flags = el.querySelectorAll('.screen-img-flag');
                    var results = scope.$eval(attrs.wsEqualAreaFlags) || [];
                    var targetArea = Infinity;
                    var i;

                    function ratioFor(index) {
                        var ratio = Number(results[index] && results[index].flagRatio);
                        return ratio > 0 && isFinite(ratio) ? ratio : 1.5;
                    }

                    for (i = 0; i < flags.length; i++) {
                        var flagArea = flags[i].parentElement;
                        var ratio = ratioFor(i);
                        targetArea = Math.min(
                            targetArea,
                            (flagArea.clientWidth * flagArea.clientWidth) / ratio,
                            flagArea.clientHeight * flagArea.clientHeight * ratio
                        );
                    }

                    if (!isFinite(targetArea) || targetArea <= 0) {
                        return;
                    }

                    for (i = 0; i < flags.length; i++) {
                        var flagRatio = ratioFor(i);
                        var height = Math.sqrt(targetArea / flagRatio);
                        flags[i].style.width = height * flagRatio + 'px';
                        flags[i].style.height = height + 'px';
                    }
                }

                function schedule() {
                    el.style.visibility = 'hidden';
                    if (animationFrame !== null) {
                        return;
                    }
                    // ng-repeat must finish linking its rows before we measure them.
                    animationFrame = window.requestAnimationFrame(function () {
                        animationFrame = null;
                        try {
                            fit();
                        } finally {
                            fittedWidth = el.clientWidth;
                            fittedHeight = el.clientHeight;
                            el.style.visibility = visibility;
                        }
                    });
                }

                scope.$watchCollection(attrs.wsEqualAreaFlags, schedule);
                var resizeObserver = new ResizeObserver(function () {
                    if (el.clientWidth !== fittedWidth || el.clientHeight !== fittedHeight) {
                        schedule();
                    }
                });
                resizeObserver.observe(el);

                scope.$on('$destroy', function () {
                    resizeObserver.disconnect();
                    if (animationFrame !== null) {
                        window.cancelAnimationFrame(animationFrame);
                    }
                });
            },
        };
    });
})();
