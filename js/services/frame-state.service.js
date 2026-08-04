(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameState', function (FrameService, TEMPLATE_BASE) {

        // The single screen-<id> writer — every code path that pushes a
        // frame's current slide to its screen window(s) goes through this.
        function publish(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            var slide = frame.slide || (frame.slides && frame.slides[0]);
            if (slide) {
                window.localStorage.setItem('screen-' + frameId, angular.toJson({
                    template: TEMPLATE_BASE + slide.template,
                    context: slide.context || {},
                    state: slide.state || [],
                    label: slide.label || '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            } else {
                window.localStorage.setItem('screen-' + frameId, angular.toJson({
                    template: TEMPLATE_BASE + 'empty.html',
                    context: {},
                    state: [],
                    label: '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            }
        }

        // Rewrite every open frame's stored template URL with a cache-busting
        // query param, without touching context/state/label — used after a
        // template edit so open screen windows (which only re-render on the
        // localStorage 'storage' event) pick up the change.
        function reloadTemplates() {
            var t = Date.now();
            angular.forEach(FrameService.frames, function (frame, id) {
                var raw = window.localStorage.getItem('screen-' + id);
                if (!raw) return;
                var entry = angular.fromJson(raw);
                if (!entry) return;
                var base = entry.template ? entry.template.split('?')[0] : (TEMPLATE_BASE + 'empty.html');
                entry.template = base + '?t=' + t;
                window.localStorage.setItem('screen-' + id, angular.toJson(entry));
            });
        }

        // Rebuild a frame's slide list from the catalog, preserving the
        // active slide pointer and its revealed state across the rebuild
        // (re-import, dev-restore). A skill reassignment must still reset
        // state to [] — that happens in the caller
        // ($scope.refreshFramesAfterOrderingChange), not here.
        //
        // This split is load-bearing: folding the reset back in here
        // silently reintroduces the "re-import un-reveals medals" bug, and
        // dropping it from the caller silently reintroduces the "skill
        // reassignment doesn't reset state" bug. See FIX_PLAN.md / B3.
        function assembleFrame(frame, catalog) {
            // Remember the currently active slide so we can restore the reference
            // after rebuilding — angular.copy() creates new objects, which would
            // otherwise break the ng-disabled="screens[id].slide !== slide" check.
            var prevLabel  = frame.slide ? frame.slide.label : null;
            var prevState  = frame.slide ? angular.copy(frame.slide.state || []) : [];
            var prevDone   = frame.slide ? (frame.slide.done || false) : false;

            frame.slides = [];
            frame.slides.push(angular.copy(catalog['__empty__']));

            var skillNumbers = frame.ordering.skillNumbers || [];

            angular.forEach(skillNumbers, function (num) {
                var slides = catalog[num];
                if (slides && slides.length > 0) {
                    angular.forEach(slides, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }
            });

            if (frame.ordering.includeAlbertVidal) {
                var bestOfNation = catalog['__bestOfNation__'];
                if (bestOfNation && bestOfNation.length > 0) {
                    angular.forEach(bestOfNation, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }

                var albertVidal = catalog['__albertVidal__'];
                if (albertVidal && albertVidal.length > 0) {
                    frame.slides.push(angular.copy(albertVidal[0]));
                    frame.slides.push(angular.copy(catalog['__empty__']));
                }
            }

            // Restore the slide pointer to the new copy so ng-disabled stays correct
            if (prevLabel) {
                var restored = null;
                angular.forEach(frame.slides, function (s) {
                    if (!restored && s.label === prevLabel) { restored = s; }
                });
                if (restored) {
                    restored.state = prevState;
                    restored.done  = prevDone;
                    frame.slide    = restored;
                } else {
                    frame.slide = undefined;
                }
            }
        }

        return {
            publish: publish,
            reloadTemplates: reloadTemplates,
            assembleFrame: assembleFrame
        };
    });

})();
