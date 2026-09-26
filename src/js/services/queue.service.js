(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Queue', function (FrameService, SLIDE_KEYS, ALBERT_VIDAL_AWARD_LABEL) {
        function getSkillFrame(skillNumber) {
            var found = null;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (frame.ordering.skillNumbers.indexOf(skillNumber) >= 0) {
                    found = id;
                }
            });
            return found;
        }

        function getAlbertVidalFrame() {
            var found = null;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (frame.ordering.includeAlbertVidal) {
                    found = id;
                }
            });
            return found;
        }

        function getSkillQueueSlides(catalog, albertVidalFrame, skillNumber) {
            if (!catalog) {
                return [];
            }

            if (skillNumber === SLIDE_KEYS.ALBERT_VIDAL) {
                var avaFrameId = albertVidalFrame;
                if (!avaFrameId || !catalog[SLIDE_KEYS.ALBERT_VIDAL]) {
                    return [];
                }
                var avaFrame = FrameService.frames[avaFrameId];
                if (!avaFrame || !avaFrame.slides) {
                    return [];
                }
                var avaResult = [];

                angular.forEach(avaFrame.slides, function (slide) {
                    if (slide.kind !== 'free' && slide.label === ALBERT_VIDAL_AWARD_LABEL) {
                        avaResult.push({ slide: slide, frameId: avaFrameId, frame: avaFrame });
                    }
                });
                return avaResult;
            }

            var frameId = getSkillFrame(skillNumber);
            if (!frameId) {
                return [];
            }
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides) {
                return [];
            }
            var catalogSlides = catalog[skillNumber] || [];
            var result = [];

            angular.forEach(catalogSlides, function (catalogSlide) {
                angular.forEach(frame.slides, function (slide) {
                    if (slide.kind !== 'free' && slide.label === catalogSlide.label) {
                        result.push({ slide: slide, frameId: frameId, frame: frame });
                    }
                });
            });

            return result;
        }

        function isCallup(item) {
            return item.slide.template === 'skill_callup.html';
        }

        function pushMatching(list, group, callup) {
            if (!group) {
                return;
            }
            angular.forEach(group, function (item) {
                if (isCallup(item) === callup) {
                    list.push(item);
                }
            });
        }

        function insertFreeSlides(list, frameId, globalList) {
            var slots = [];
            angular.forEach(FrameService.freeSlides, function (definition, order) {
                angular.forEach(
                    window.CeremonatorFreeSlides.frameIds(definition),
                    function (targetFrameId, targetOrder) {
                        var id = window.CeremonatorFreeSlides.slideId(definition, targetFrameId);
                        var queueOrder = globalList
                            ? globalList
                                  .map(function (item) {
                                      return item.slide.slideId;
                                  })
                                  .indexOf(id)
                            : -1;
                        if (frameId && (targetFrameId !== frameId || queueOrder < 0)) return;
                        var frame = FrameService.frames[targetFrameId];
                        if (!frame || !FrameService.hasFeedType(definition.feedType)) return;
                        var slide = (frame.slides || []).filter(function (candidate) {
                            return candidate.slideId === id;
                        })[0];
                        if (!slide) return;
                        var placement = window.CeremonatorFreeSlides.placementFor(definition, targetFrameId);
                        var index =
                            placement.position === 'start' ? 0 : placement.position === 'end' ? list.length : -1;
                        if (placement.position === 'afterSkills') {
                            index = list.length;
                            angular.forEach(list, function (item, i) {
                                if (
                                    index === list.length &&
                                    (item.slide.kind === 'bestOfNation' || item.slide.kind === 'albertVidal')
                                )
                                    index = i;
                            });
                        }
                        if (index < 0) {
                            angular.forEach(list, function (item, i) {
                                var skill = item.slide.context && item.slide.context.skill;
                                if (
                                    item.frameId !== targetFrameId ||
                                    !skill ||
                                    Number(skill.number) !== Number(placement.skillNumber) ||
                                    (placement.kind && item.slide.kind !== placement.kind)
                                )
                                    return;
                                if (placement.position === 'after') index = i + 1;
                                else if (index < 0) index = i;
                            });
                        }
                        // An unavailable anchor stays saved, but must not silently move elsewhere in the show.
                        if (index < 0) return;
                        if (!slots[index]) slots[index] = [];
                        slots[index].push({
                            slide: slide,
                            frameId: targetFrameId,
                            frame: frame,
                            sort: definition.sort,
                            order: globalList ? queueOrder : order,
                            targetOrder: targetOrder,
                            rank: placement.position === 'start' ? 0 : placement.position === 'end' ? 2 : 1,
                        });
                    }
                );
            });
            var result = [];
            for (var i = 0; i <= list.length; i++) {
                angular.forEach(
                    (slots[i] || []).sort(function (a, b) {
                        return globalList
                            ? a.order - b.order
                            : a.rank - b.rank || a.sort - b.sort || a.order - b.order || a.targetOrder - b.targetOrder;
                    }),
                    function (item) {
                        result.push({ slide: item.slide, frameId: item.frameId, frame: item.frame });
                    }
                );
                if (i < list.length) result.push(list[i]);
            }
            return result;
        }

        function buildQueueList(catalog, skills, albertVidalFrame) {
            if (!catalog) {
                return { list: [], byFrame: {} };
            }
            var list = [];
            var groupsByFrame = {};

            angular.forEach(FrameService.sortSkills(skills), function (skill) {
                var catalogSlides = catalog[skill.number];
                if (!catalogSlides || !catalogSlides.length) {
                    return;
                }
                var frameId = getSkillFrame(skill.number);
                if (!frameId) {
                    return;
                }
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides) {
                    return;
                }

                var group = [];

                // assembleFrame does angular.copy so labels are preserved — match by label
                angular.forEach(catalogSlides, function (catalogSlide) {
                    angular.forEach(frame.slides, function (slide) {
                        if (slide.kind !== 'free' && slide.label === catalogSlide.label) {
                            group.push({ slide: slide, frameId: frameId, frame: frame });
                        }
                    });
                });

                if (!group.length) {
                    return;
                }
                if (!groupsByFrame[frameId]) {
                    groupsByFrame[frameId] = [];
                }
                groupsByFrame[frameId].push(group);
            });

            var frameOrder = [];
            var rounds = 0;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (!groupsByFrame[id]) {
                    return;
                }
                frameOrder.push(id);
                rounds = Math.max(rounds, groupsByFrame[id].length);
            });

            for (var f = 0; f < frameOrder.length; f++) {
                pushMatching(list, groupsByFrame[frameOrder[f]][0], true);
            }

            for (var round = 0; round < rounds; round++) {
                for (var i = 0; i < frameOrder.length; i++) {
                    var groups = groupsByFrame[frameOrder[i]];
                    pushMatching(list, groups[round], false);
                    pushMatching(list, groups[round + 1], true);
                }
            }

            var specialKinds = FrameService.awardingSequence
                ? FrameService.awardingSequence.slides
                : [{ kind: 'bestOfNation' }, { kind: 'albertVidal' }];
            angular.forEach(specialKinds, function (step) {
                if (step.kind === 'bestOfNation') {
                    angular.forEach(catalog[SLIDE_KEYS.BEST_OF_NATION] || [], function (catalogSlide) {
                        angular.forEach(FrameService.frames, function (frame, frameId) {
                            angular.forEach(frame.slides || [], function (slide) {
                                if (slide.kind !== 'free' && slide.label === catalogSlide.label) {
                                    list.push({ slide: slide, frameId: frameId, frame: frame });
                                }
                            });
                        });
                    });
                } else if (step.kind === 'albertVidal') {
                    var specialFrame = FrameService.frames[albertVidalFrame];
                    angular.forEach((specialFrame && specialFrame.slides) || [], function (slide) {
                        if (slide.kind !== 'free' && slide.label === ALBERT_VIDAL_AWARD_LABEL) {
                            list.push({ slide: slide, frameId: albertVidalFrame, frame: specialFrame });
                        }
                    });
                }
            });

            list = insertFreeSlides(list);

            var byFrame = {};
            angular.forEach(list, function (item) {
                if (!byFrame[item.frameId]) {
                    byFrame[item.frameId] = [];
                }
                byFrame[item.frameId].push(item);
            });

            // Keep frame Prev/Next's existing skill sequence, inserting the same free slides.
            angular.forEach(FrameService.frames, function (frame, id) {
                var local = (frame.slides || [])
                    .filter(function (slide) {
                        return slide.kind !== 'free';
                    })
                    .map(function (slide) {
                        return { slide: slide, frameId: id, frame: frame };
                    });
                frame.slides = insertFreeSlides(local, id, list).map(function (item) {
                    return item.slide;
                });
                if (frame.slide && frame.slide.kind === 'free' && frame.slides.indexOf(frame.slide) < 0)
                    frame.slide = undefined;
                if (
                    frame.previewSlide &&
                    frame.previewSlide.kind === 'free' &&
                    frame.slides.indexOf(frame.previewSlide) < 0
                ) {
                    frame.previewSlide = undefined;
                    frame.previewState = undefined;
                }
            });

            return { list: list, byFrame: byFrame };
        }

        return {
            getSkillFrame: getSkillFrame,
            getAlbertVidalFrame: getAlbertVidalFrame,
            getSkillQueueSlides: getSkillQueueSlides,
            buildQueueList: buildQueueList,
        };
    });
})();
