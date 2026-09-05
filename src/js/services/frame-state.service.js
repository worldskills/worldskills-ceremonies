(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameState', function (FrameService, TEMPLATE_BASE, SLIDE_KEYS, StorageKeys, FEED, FEED_TYPE) {

        var screenKey = StorageKeys.screenKey;
        var previewKey = StorageKeys.previewKey;

        function activeForFeed(slide, feedType, state) {
            if (!slide) return false;
            var base = slide.baseFeedTypes || [FEED_TYPE.MAIN];
            if (base.indexOf(feedType) >= 0) return true;
            return (state || []).some(function (name) { return slide.stateFeedTypes && slide.stateFeedTypes[name] === feedType; });
        }

        function createStoragePayload(frame, slide, frameId, stateOverride, feedType) {
            var state = stateOverride || (slide && slide.state) || [];
            var isBlanked = frame.blankedFeeds && frame.blankedFeeds[feedType];
            var isActive = activeForFeed(slide, feedType, state);
            var isRoutedAway = !!slide && !isActive;
            if (!isActive) slide = undefined;
            var content = slide && slide.feedContent && slide.feedContent[feedType];
            var filteredState = slide ? state.filter(function (name) {
                return !slide.stateFeedTypes || !slide.stateFeedTypes[name] || slide.stateFeedTypes[name] === feedType;
            }) : [];
            return {
                // A deliberately blanked output is black. A feed routed away by
                // the current state gets the branded empty screen instead.
                template: TEMPLATE_BASE + (content ? content.template : (slide ? slide.template : (isRoutedAway && !isBlanked ? 'empty.html' : 'blank.html'))),
                context: (content && content.context) || (slide && slide.context) || {},
                state: filteredState,
                label: (slide && slide.label) || '',
                frameLabel: frame.label || frameId,
                accent: FrameService.getFrameColor(frameId),
                video: frame.video ? TEMPLATE_BASE + 'videos/' + frame.video : ''
            };
        }

        function liveSlideFor(frame, feedType) {
            return frame.blankedFeeds && frame.blankedFeeds[feedType] ? undefined : frame.slide;
        }

        function publish(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            angular.forEach(FrameService.feedTypes, function (feed) {
                var type = feed.id;
                window.localStorage.setItem(screenKey(frameId, type), angular.toJson(createStoragePayload(frame, liveSlideFor(frame, type), frameId, null, type)));
            });
            publishPreview(frameId);
        }

        function publishPreview(frameId) {
            var frame = FrameService.frames[frameId];
            if (!frame) return;
            var slide = frame.previewSlide || frame.slide;
            var stateOverride = frame.previewSlide ? (frame.previewState || []) : null;
            angular.forEach(FrameService.feedTypes, function (feed) {
                var type = feed.id;
                // A feed blank wins over a pinned Preview slide, but does not alter
                // the pin for the other feed.
                var visible = frame.blankedFeeds && frame.blankedFeeds[type] ? undefined : (frame.previewSlide ? slide : frame.slide);
                window.localStorage.setItem(previewKey(frameId, type), angular.toJson(createStoragePayload(frame, visible, frameId, stateOverride, type)));
            });
            syncRemote();
        }

        function syncRemote() {
            if (!window.ceremonator || !window.ceremonator.remote) return;
            var frames = [];
            angular.forEach(FrameService.frames, function (frame, id) {
                frames.push({
                    id: id,
                    label: frame.label,
                    color: FrameService.getFrameColor(id),
                    status: frame.status,
                    blankedFeeds: angular.copy(frame.blankedFeeds || {}),
                    slideIndex: frame.slide ? frame.slides.indexOf(frame.slide) : -1,
                    previewSlideIndex: frame.previewSlide ? frame.slides.indexOf(frame.previewSlide) : -1,
                    previewState: frame.previewState || null,
                    slides: (frame.slides || []).map(function (slide) {
                        return { slideId: slide.slideId, label: slide.label, context: slide.context, state: slide.state || [], states: slide.states || [], baseFeedTypes: slide.baseFeedTypes, stateFeedTypes: slide.stateFeedTypes, feedContent: slide.feedContent, done: !!slide.done };
                    })
                });
            });
            window.ceremonator.remote.sync({ feedTypes: angular.copy(FrameService.feedTypes), frames: frames });
        }

        function clear(frameId) {
            angular.forEach(FrameService.feedTypes, function (feed) {
                window.localStorage.removeItem(screenKey(frameId, feed.id));
                window.localStorage.removeItem(previewKey(frameId, feed.id));
            });
        }

        function reloadTemplates() {
            var t = Date.now();
            angular.forEach(FrameService.frames, function (frame, id) {
                FrameService.feedTypes.forEach(function (feed) { [screenKey(id, feed.id), previewKey(id, feed.id)].forEach(function (key) {
                    var raw = window.localStorage.getItem(key);
                    if (!raw) return;
                    var entry = angular.fromJson(raw);
                    if (!entry) return;
                    var base = entry.template ? entry.template.split('?')[0] : (TEMPLATE_BASE + 'blank.html');
                    entry.template = base + '?t=' + t;
                    window.localStorage.setItem(key, angular.toJson(entry));
                }); });
            });
        }

        function assembleFrame(frame, catalog) {
            var prevLabel  = frame.slide ? frame.slide.label : null;
            var prevState  = frame.slide ? angular.copy(frame.slide.state || []) : [];
            var prevDone   = frame.slide ? (frame.slide.done || false) : false;

            frame.slides = [];

            var skillNumbers = FrameService.sortSkillNumbers(frame.ordering.skillNumbers);

            angular.forEach(skillNumbers, function (num) {
                var slides = catalog[num];
                if (slides && slides.length > 0) {
                    angular.forEach(slides, function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                }
            });

            var bestOfNation = catalog[SLIDE_KEYS.BEST_OF_NATION];
            if (bestOfNation && bestOfNation.length > 0) {
                angular.forEach(bestOfNation, function (slide) {
                    frame.slides.push(angular.copy(slide));
                });
            }

            if (frame.ordering.includeAlbertVidal) {
                var albertVidal = catalog[SLIDE_KEYS.ALBERT_VIDAL];
                if (albertVidal && albertVidal.length > 0) {
                    frame.slides.push(angular.copy(albertVidal[0]));
                }
            }

            angular.forEach(frame.slides, function (slide, index) {
                if (!slide.slideId) {
                    slide.slideId = frame.id + ':' + encodeURIComponent((slide.template || '') + '|' + (slide.label || index));
                }
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

            return frame;
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
