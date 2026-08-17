(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameState', function (FrameService, TEMPLATE_BASE, SLIDE_KEYS) {

        function screenKey(frameId) {
            return 'screen-' + frameId;
        }

        // Preview windows read a second, independent channel — same shape, just never touched
        // by showSlide()'s live push. See publishPreview().
        function previewKey(frameId) {
            return 'screen-' + frameId + '-preview';
        }

        // Shared payload builder for both channels — slide may be undefined (blank/no slide).
        // stateOverride lets publishPreview() substitute frame.previewState for slide.state,
        // so previewing the exact slide that's live can still show its own revealed states.
        function payload(frame, slide, frameId, stateOverride) {
            return {
                template: TEMPLATE_BASE + (slide ? slide.template : 'empty.html'),
                context: (slide && slide.context) || {},
                state: stateOverride || (slide && slide.state) || [],
                label: (slide && slide.label) || '',
                frameLabel: frame.label || frameId,
                accent: FrameService.getFrameColor(frameId),
                video: frame.video ? TEMPLATE_BASE + 'videos/' + frame.video : ''
            };
        }

        // frame.blanked (set by resetFrame's "Blank" button) hides the live slide from both
        // channels without clearing frame.slide itself — getSlidePosition (frames.part.js) keeps
        // reading frame.slide directly, so blanking the screen doesn't also reset the operator's
        // position in the slide list. showSlide() clears the flag when going live again.
        function liveSlideFor(frame) {
            return frame.blanked ? undefined : frame.slide;
        }

        // Single writer for screen-<id> — every slide-push code path must go through this.
        function publish(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            window.localStorage.setItem(screenKey(frameId), angular.toJson(payload(frame, liveSlideFor(frame), frameId)));
            publishPreview(frameId);
        }

        // Single writer for the preview-only channel — falls back to the live slide (and its
        // own state) so a Preview window with nothing explicitly previewed just mirrors what's
        // live (including a blanked live screen). Once a slide is pinned (frame.previewSlide
        // set), its states come from frame.previewState instead of slide.state — see
        // control.js's stateArrayFor — which is what keeps a Preview-only state toggle from ever
        // touching the live slide's state, even when the previewed slide is the one that's live.
        function publishPreview(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            var slide = frame.previewSlide || liveSlideFor(frame);
            var stateOverride = frame.previewSlide ? (frame.previewState || []) : null;
            window.localStorage.setItem(previewKey(frameId), angular.toJson(payload(frame, slide, frameId, stateOverride)));
            syncRemote();
        }

        // Every publish/publishPreview ends up here — the one place that pushes a full snapshot
        // out to the remote control server (see main/remote-server.js), so remote browsers always
        // reflect whatever the operator just did, however they did it.
        function syncRemote() {
            if (!window.ceremonator || !window.ceremonator.remote) return;
            var frames = [];
            angular.forEach(FrameService.frames, function (frame, id) {
                frames.push({
                    id: id,
                    label: frame.label,
                    color: FrameService.getFrameColor(id),
                    status: frame.status,
                    blanked: !!frame.blanked,
                    slideIndex: frame.slide ? frame.slides.indexOf(frame.slide) : -1,
                    previewSlideIndex: frame.previewSlide ? frame.slides.indexOf(frame.previewSlide) : -1,
                    previewState: frame.previewState || null,
                    slides: (frame.slides || []).map(function (slide) {
                        return { slideId: slide.slideId, label: slide.label, context: slide.context, state: slide.state || [], states: slide.states || [], done: !!slide.done };
                    })
                });
            });
            window.ceremonator.remote.sync(frames);
        }

        // Single remover for both screen-<id> channels, paired with publish() as the single writer.
        function clear(frameId) {
            window.localStorage.removeItem(screenKey(frameId));
            window.localStorage.removeItem(previewKey(frameId));
        }

        // Bumps a cache-busting query param so open screen windows re-render — they only react to the localStorage 'storage' event.
        function reloadTemplates() {
            var t = Date.now();
            angular.forEach(FrameService.frames, function (frame, id) {
                [screenKey(id), previewKey(id)].forEach(function (key) {
                    var raw = window.localStorage.getItem(key);
                    if (!raw) return;
                    var entry = angular.fromJson(raw);
                    if (!entry) return;
                    var base = entry.template ? entry.template.split('?')[0] : (TEMPLATE_BASE + 'empty.html');
                    entry.template = base + '?t=' + t;
                    window.localStorage.setItem(key, angular.toJson(entry));
                });
            });
        }

        // State reset (to []) happens in the caller ($scope.refreshFramesAfterOrderingChange), not here: moving it here reintroduces "re-import un-reveals medals"; dropping it from the caller reintroduces "skill reassignment doesn't reset state".
        function assembleFrame(frame, catalog) {
            // angular.copy() below breaks object identity; ng-disabled="screens[id].slide !== slide" depends on it, so save the label to restore the reference.
            var prevLabel  = frame.slide ? frame.slide.label : null;
            var prevState  = frame.slide ? angular.copy(frame.slide.state || []) : [];
            var prevDone   = frame.slide ? (frame.slide.done || false) : false;

            frame.slides = [];

            var skillNumbers = frame.ordering.skillNumbers || [];

            angular.forEach(skillNumbers, function (num) {
                var slides = catalog[num];
                if (slides && slides.length > 0) {
                    angular.forEach(slides, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                }
            });

            if (frame.ordering.includeAlbertVidal) {
                var bestOfNation = catalog[SLIDE_KEYS.BEST_OF_NATION];
                if (bestOfNation && bestOfNation.length > 0) {
                    angular.forEach(bestOfNation, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                }

                var albertVidal = catalog[SLIDE_KEYS.ALBERT_VIDAL];
                if (albertVidal && albertVidal.length > 0) {
                    frame.slides.push(angular.copy(albertVidal[0]));
                }
            }

            angular.forEach(frame.slides, function (slide, index) {
                if (!slide.slideId) slide.slideId = frame.id + ':' + encodeURIComponent((slide.template || '') + '|' + (slide.label || index));
            });

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

            // Same identity-restore as frame.slide above, for whatever's on the Preview channel.
            // previewState itself is untouched — it's a frame-level array, not tied to slide
            // identity, so it survives the rebuild; only clear it if the pin itself is lost.
            if (frame.previewSlide) {
                var prevPreviewLabel = frame.previewSlide.label;
                var restoredPreview = null;
                angular.forEach(frame.slides, function (s) {
                    if (!restoredPreview && s.label === prevPreviewLabel) { restoredPreview = s; }
                });
                frame.previewSlide = restoredPreview || undefined;
                if (!restoredPreview) frame.previewState = undefined;
            }
        }

        return {
            publish: publish,
            publishPreview: publishPreview,
            clear: clear,
            reloadTemplates: reloadTemplates,
            assembleFrame: assembleFrame,
            syncRemote: syncRemote
        };
    });

})();
