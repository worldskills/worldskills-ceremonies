(function () {
    'use strict';

    angular
        .module('ceremoniesApp')
        .factory('FrameState', function (FrameService, TEMPLATE_BASE, SLIDE_KEYS, StorageKeys, FEED) {
            var screenKey = StorageKeys.screenKey;
            var previewKey = StorageKeys.previewKey;

            function publishDynamicState() {
                window.localStorage.setItem(StorageKeys.DYNAMIC_STATE_KEY, angular.toJson(FrameService.dynamicState));
                syncRemote();
            }

            function clearDynamicState() {
                FrameService.dynamicState = [];
                publishDynamicState();
            }

            function setDynamicFunctionality(id, enabled) {
                FrameService.dynamicState = FrameService.setFunctionalityState(
                    FrameService.dynamicState,
                    id,
                    enabled,
                    'global'
                );
                publishDynamicState();
            }

            function clearDynamicGroup(group) {
                FrameService.dynamicState = FrameService.clearFunctionalityGroup(
                    FrameService.dynamicState,
                    group,
                    'global'
                );
                publishDynamicState();
            }

            function clearHighlightsForSlide(slide) {
                var group = FrameService.awardingSequence && FrameService.awardingSequence.highlightGroup;
                if (!group || !slide || !slide.clearHighlights) return false;
                clearDynamicGroup(group);
                return true;
            }

            function highlightPodium(frameId) {
                var highlight = FrameService.dynamicFunctionalities.filter(function (item) {
                    return item.frameId === frameId && item.group && (item.scope || 'global') === 'global';
                })[0];
                if (highlight && FrameService.dynamicState.indexOf(highlight.id) < 0) {
                    setDynamicFunctionality(highlight.id, true);
                }
            }

            function awardingHighlight(frameId) {
                var sequence = FrameService.awardingSequence;
                return (
                    sequence &&
                    FrameService.dynamicFunctionalities.filter(function (item) {
                        return (
                            item.frameId === frameId &&
                            item.group === sequence.highlightGroup &&
                            (item.scope || 'global') === 'global'
                        );
                    })[0]
                );
            }

            function clearAwardingHighlight(frameId) {
                var highlight = awardingHighlight(frameId);
                if (highlight && FrameService.dynamicState.indexOf(highlight.id) >= 0) {
                    clearDynamicGroup(highlight.group);
                }
            }

            function syncAwardingHighlight(frameId) {
                var sequence = FrameService.awardingSequence;
                var slide = FrameService.frames[frameId].slide;
                var highlight = awardingHighlight(frameId);
                if (!sequence || !slide || !highlight) return;
                var step = sequence.slides.filter(function (item) {
                    return item.kind === slide.kind;
                })[0];
                if (!step) return;
                var enabled =
                    typeof step.highlight === 'string'
                        ? (slide.state || []).indexOf(step.highlight) >= 0
                        : step.highlight;
                if (enabled) {
                    if (FrameService.dynamicState.indexOf(highlight.id) < 0) {
                        setDynamicFunctionality(highlight.id, true);
                    }
                } else if (
                    FrameService.dynamicFunctionalities.some(function (item) {
                        return (
                            item.group === highlight.group &&
                            (item.scope || 'global') === 'global' &&
                            FrameService.dynamicState.indexOf(item.id) >= 0
                        );
                    })
                ) {
                    clearDynamicGroup(highlight.group);
                }
            }

            function activeForFeed(slide, feedType, state) {
                if (!slide) {
                    return false;
                }
                var base = slide.baseFeedTypes || [FrameService.primaryFeedId()];
                if (base.indexOf(feedType) >= 0) {
                    return true;
                }
                return (state || []).some(function (name) {
                    return slide.stateFeedTypes && slide.stateFeedTypes[name] === feedType;
                });
            }

            function videoFor(frame, feedType) {
                var v = frame.video;
                if (v && typeof v === 'object') {
                    // A missing key inherits the primary feed's video; an explicit
                    // empty string means "no video for this feed" and must not fall back.
                    if (Object.prototype.hasOwnProperty.call(v, feedType)) {
                        return v[feedType] || '';
                    }
                    return v[FrameService.primaryFeedId()] || '';
                }
                return v || '';
            }

            function createStoragePayload(frame, slide, frameId, stateOverride, feedType) {
                var state = stateOverride || (slide && slide.state) || [];
                var isActive = activeForFeed(slide, feedType, state);
                if (!isActive) {
                    slide = undefined;
                }
                var content = slide && slide.feedContent && slide.feedContent[feedType];
                var filteredState = slide
                    ? state.filter(function (name) {
                          return (
                              !slide.stateFeedTypes ||
                              !slide.stateFeedTypes[name] ||
                              slide.stateFeedTypes[name] === feedType
                          );
                      })
                    : [];
                return {
                    // No slide (blanked, routed away, or never assigned yet — e.g. right after
                    // a restart or a fresh import) always shows the project's logo template,
                    // never a plain black screen, while retaining the frame background/video.
                    template: TEMPLATE_BASE + (content ? content.template : slide ? slide.template : 'empty.html'),
                    context: (content && content.context) || (slide && slide.context) || {},
                    state: filteredState,
                    dynamicState: angular.copy(FrameService.dynamicState),
                    label: (slide && slide.label) || '',
                    frameLabel: frame.label || frameId,
                    accent: FrameService.getFrameColor(frameId),
                    video: videoFor(frame, feedType) ? TEMPLATE_BASE + 'videos/' + videoFor(frame, feedType) : '',
                    testMode: StorageKeys.testMode(),
                };
            }

            function liveSlideFor(frame, feedType) {
                return frame.blankedFeeds && frame.blankedFeeds[feedType] ? undefined : frame.slide;
            }

            function publish(frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame) {
                    return;
                }
                angular.forEach(FrameService.feedTypes, function (feed) {
                    var type = feed.id;
                    window.localStorage.setItem(
                        screenKey(frameId, type),
                        angular.toJson(createStoragePayload(frame, liveSlideFor(frame, type), frameId, null, type))
                    );
                });
                publishPreview(frameId);
            }

            function publishPreview(frameId) {
                var frame = FrameService.frames[frameId];
                if (!frame) {
                    return;
                }
                var slide = frame.previewSlide || frame.slide;
                var stateOverride = frame.previewSlide ? frame.previewState || [] : null;
                angular.forEach(FrameService.feedTypes, function (feed) {
                    var type = feed.id;
                    // A feed blank wins over a pinned Preview slide, but does not alter
                    // the pin for the other feed.
                    var visible =
                        frame.blankedFeeds && frame.blankedFeeds[type]
                            ? undefined
                            : frame.previewSlide
                              ? slide
                              : frame.slide;
                    window.localStorage.setItem(
                        previewKey(frameId, type),
                        angular.toJson(createStoragePayload(frame, visible, frameId, stateOverride, type))
                    );
                });
                syncRemote();
            }

            function syncRemote() {
                if (!window.ceremonator || !window.ceremonator.remote) {
                    return;
                }
                var frames = [];
                angular.forEach(FrameService.frames, function (frame, id) {
                    frames.push({
                        id: id,
                        label: frame.label,
                        color: FrameService.getFrameColor(id),
                        status: frame.status,
                        size: frame.size,
                        outputs: FrameService.feedTypes.reduce(function (outputs, feed) {
                            outputs[feed.id] = {
                                live: createStoragePayload(frame, liveSlideFor(frame, feed.id), id, null, feed.id),
                                preview: createStoragePayload(
                                    frame,
                                    frame.blankedFeeds && frame.blankedFeeds[feed.id]
                                        ? undefined
                                        : frame.previewSlide || frame.slide,
                                    id,
                                    frame.previewSlide ? frame.previewState || [] : null,
                                    feed.id
                                ),
                            };
                            return outputs;
                        }, {}),
                        blankedFeeds: angular.copy(frame.blankedFeeds || {}),
                        queueComplete: !!frame.queueComplete,
                        slideIndex: frame.slide ? frame.slides.indexOf(frame.slide) : -1,
                        previewSlideIndex: frame.previewSlide ? frame.slides.indexOf(frame.previewSlide) : -1,
                        previewState: frame.previewState || null,
                        slides: (frame.slides || []).map(function (slide) {
                            return {
                                slideId: slide.slideId,
                                template: slide.template,
                                kind: slide.kind,
                                label: slide.label,
                                context: slide.context,
                                state: slide.state || [],
                                states: slide.states || [],
                                baseFeedTypes: slide.baseFeedTypes,
                                stateFeedTypes: slide.stateFeedTypes,
                                feedContent: slide.feedContent,
                                done: !!slide.done,
                            };
                        }),
                    });
                });

                window.ceremonator.remote.sync({
                    feedTypes: angular.copy(FrameService.feedTypes),
                    dynamicFunctionalities: angular.copy(
                        FrameService.dynamicFunctionalities.filter(function (item) {
                            return item.scope !== 'grid';
                        })
                    ),
                    dynamicState: angular.copy(FrameService.dynamicState),
                    frames: frames,
                    dynamicFunctionalityGroups: angular.copy(FrameService.dynamicFunctionalityGroups),
                    testMode: StorageKeys.testMode(),
                    awardingSequence: angular.copy(FrameService.awardingSequence),
                });
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
                    FrameService.feedTypes.forEach(function (feed) {
                        [screenKey(id, feed.id), previewKey(id, feed.id)].forEach(function (key) {
                            var raw = window.localStorage.getItem(key);
                            if (!raw) {
                                return;
                            }
                            var entry = angular.fromJson(raw);
                            if (!entry) {
                                return;
                            }
                            var base = entry.template ? entry.template.split('?')[0] : TEMPLATE_BASE + 'blank.html';
                            entry.template = base + '?t=' + t;
                            window.localStorage.setItem(key, angular.toJson(entry));
                        });
                    });
                });
            }

            function assembleFrame(frame, catalog) {
                var prevSlideId = frame.slide ? frame.slide.slideId : null;
                var prevLabel = frame.slide ? frame.slide.label : null;
                var prevState = frame.slide ? angular.copy(frame.slide.state || []) : [];
                var prevDone = frame.slide ? frame.slide.done || false : false;

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

                var specialKinds = FrameService.awardingSequence
                    ? FrameService.awardingSequence.slides
                    : [{ kind: 'bestOfNation' }, { kind: 'albertVidal' }];
                angular.forEach(specialKinds, function (step) {
                    var special =
                        step.kind === 'bestOfNation'
                            ? catalog[SLIDE_KEYS.BEST_OF_NATION]
                            : step.kind === 'albertVidal' && frame.ordering.includeAlbertVidal
                              ? catalog[SLIDE_KEYS.ALBERT_VIDAL]
                              : null;
                    angular.forEach(special || [], function (slide) {
                        frame.slides.push(angular.copy(slide));
                    });
                });

                angular.forEach(FrameService.freeSlides, function (definition) {
                    if (
                        window.CeremonatorFreeSlides.frameIds(definition).indexOf(frame.id) < 0 ||
                        !FrameService.hasFeedType(definition.feedType)
                    )
                        return;
                    var stateFeeds = {};
                    angular.forEach(definition.states, function (state) {
                        stateFeeds[state] = definition.feedType;
                    });
                    frame.slides.push({
                        slideId: window.CeremonatorFreeSlides.slideId(definition, frame.id),
                        kind: 'free',
                        label: definition.name,
                        template: definition.template,
                        states: angular.copy(definition.states),
                        context: angular.copy(definition.context),
                        clearHighlights: !!definition.clearHighlights,
                        baseFeedTypes: [definition.feedType],
                        stateFeedTypes: stateFeeds,
                        state: [],
                    });
                });

                angular.forEach(frame.slides, function (slide, index) {
                    if (!slide.slideId) {
                        slide.slideId =
                            frame.id + ':' + encodeURIComponent((slide.template || '') + '|' + (slide.label || index));
                    }
                });

                if (prevSlideId || prevLabel) {
                    var restored = null;
                    angular.forEach(frame.slides, function (s) {
                        if (!restored && (prevSlideId ? s.slideId === prevSlideId : s.label === prevLabel)) {
                            restored = s;
                        }
                    });
                    if (restored) {
                        restored.state = prevState;
                        restored.done = prevDone;
                        frame.slide = restored;
                    } else {
                        frame.slide = undefined;
                    }
                }

                // Same identity-restore as frame.slide above, for whatever's on the Preview channel.
                // previewState itself is untouched — it's a frame-level array, not tied to slide
                // identity, so it survives the rebuild; only clear it if the pin itself is lost.
                if (frame.previewSlide) {
                    var prevPreviewId = frame.previewSlide.slideId;
                    var prevPreviewLabel = frame.previewSlide.label;
                    var restoredPreview = null;
                    angular.forEach(frame.slides, function (s) {
                        if (
                            !restoredPreview &&
                            (prevPreviewId ? s.slideId === prevPreviewId : s.label === prevPreviewLabel)
                        ) {
                            restoredPreview = s;
                        }
                    });
                    frame.previewSlide = restoredPreview || undefined;
                    if (!restoredPreview) {
                        frame.previewState = undefined;
                    }
                }

                return frame;
            }

            return {
                highlightPodium: highlightPodium,
                syncAwardingHighlight: syncAwardingHighlight,
                clearAwardingHighlight: clearAwardingHighlight,
                clearHighlightsForSlide: clearHighlightsForSlide,
                setDynamicFunctionality: setDynamicFunctionality,
                clearDynamicGroup: clearDynamicGroup,
                clearDynamicState: clearDynamicState,
                publish: publish,
                publishPreview: publishPreview,
                clear: clear,
                reloadTemplates: reloadTemplates,
                assembleFrame: assembleFrame,
                syncRemote: syncRemote,
            };
        });
})();
