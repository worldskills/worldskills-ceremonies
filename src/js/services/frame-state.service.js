(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameState', function (FrameService, TEMPLATE_BASE, SLIDE_KEYS) {

        function screenKey(frameId) {
            return 'screen-' + frameId;
        }

        // Single writer for screen-<id> — every slide-push code path must go through this.
        function publish(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            var slide = frame.slide || (frame.slides && frame.slides[0]);
            if (slide) {
                window.localStorage.setItem(screenKey(frameId), angular.toJson({
                    template: TEMPLATE_BASE + slide.template,
                    context: slide.context || {},
                    state: slide.state || [],
                    label: slide.label || '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            } else {
                window.localStorage.setItem(screenKey(frameId), angular.toJson({
                    template: TEMPLATE_BASE + 'empty.html',
                    context: {},
                    state: [],
                    label: '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId)
                }));
            }
        }

        // Single remover for screen-<id>, paired with publish() as the single writer.
        function clear(frameId) {
            window.localStorage.removeItem(screenKey(frameId));
        }

        // Bumps a cache-busting query param so open screen windows re-render — they only react to the localStorage 'storage' event.
        function reloadTemplates() {
            var t = Date.now();
            angular.forEach(FrameService.frames, function (frame, id) {
                var raw = window.localStorage.getItem(screenKey(id));
                if (!raw) return;
                var entry = angular.fromJson(raw);
                if (!entry) return;
                var base = entry.template ? entry.template.split('?')[0] : (TEMPLATE_BASE + 'empty.html');
                entry.template = base + '?t=' + t;
                window.localStorage.setItem(screenKey(id), angular.toJson(entry));
            });
        }

        // State reset (to []) happens in the caller ($scope.refreshFramesAfterOrderingChange), not here: moving it here reintroduces "re-import un-reveals medals"; dropping it from the caller reintroduces "skill reassignment doesn't reset state".
        function assembleFrame(frame, catalog) {
            // angular.copy() below breaks object identity; ng-disabled="screens[id].slide !== slide" depends on it, so save the label to restore the reference.
            var prevLabel  = frame.slide ? frame.slide.label : null;
            var prevState  = frame.slide ? angular.copy(frame.slide.state || []) : [];
            var prevDone   = frame.slide ? (frame.slide.done || false) : false;

            frame.slides = [];
            frame.slides.push(angular.copy(catalog[SLIDE_KEYS.EMPTY]));

            var skillNumbers = frame.ordering.skillNumbers || [];

            angular.forEach(skillNumbers, function (num) {
                var slides = catalog[num];
                if (slides && slides.length > 0) {
                    angular.forEach(slides, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog[SLIDE_KEYS.EMPTY]));
                }
            });

            if (frame.ordering.includeAlbertVidal) {
                var bestOfNation = catalog[SLIDE_KEYS.BEST_OF_NATION];
                if (bestOfNation && bestOfNation.length > 0) {
                    angular.forEach(bestOfNation, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                    frame.slides.push(angular.copy(catalog[SLIDE_KEYS.EMPTY]));
                }

                var albertVidal = catalog[SLIDE_KEYS.ALBERT_VIDAL];
                if (albertVidal && albertVidal.length > 0) {
                    frame.slides.push(angular.copy(albertVidal[0]));
                    frame.slides.push(angular.copy(catalog[SLIDE_KEYS.EMPTY]));
                }
            }

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
            clear: clear,
            reloadTemplates: reloadTemplates,
            assembleFrame: assembleFrame
        };
    });

})();
