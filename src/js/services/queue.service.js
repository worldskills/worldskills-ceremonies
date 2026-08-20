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
                if (frame.ordering.includeAlbertVidal) found = id;
            });
            return found;
        }

        function getSkillQueueSlides(catalog, albertVidalFrame, skillNumber) {
            if (!catalog) return [];

            if (skillNumber === SLIDE_KEYS.ALBERT_VIDAL) {
                var avaFrameId = albertVidalFrame;
                if (!avaFrameId || !catalog[SLIDE_KEYS.ALBERT_VIDAL]) return [];
                var avaFrame = FrameService.frames[avaFrameId];
                if (!avaFrame || !avaFrame.slides) return [];
                var avaResult = [];

                angular.forEach(avaFrame.slides, function (slide) {
                    if (slide.label === ALBERT_VIDAL_AWARD_LABEL) {
                        avaResult.push({ slide: slide, frameId: avaFrameId, frame: avaFrame });
                    }
                });
                return avaResult;
            }

            var frameId = getSkillFrame(skillNumber);
            if (!frameId) return [];
            var frame = FrameService.frames[frameId];
            if (!frame || !frame.slides) return [];
            var catalogSlides = catalog[skillNumber] || [];
            var result = [];

            angular.forEach(catalogSlides, function (catalogSlide) {
                angular.forEach(frame.slides, function (slide) {
                    if (slide.label === catalogSlide.label) {
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
            if (!group) return;
            angular.forEach(group, function (item) {
                if (isCallup(item) === callup) list.push(item);
            });
        }

        function buildQueueList(catalog, skills, albertVidalFrame) {
            if (!catalog) return { list: [], byFrame: {} };
            var list = [];
            var groupsByFrame = {};

            angular.forEach(FrameService.sortSkills(skills), function (skill) {
                var catalogSlides = catalog[skill.number];
                if (!catalogSlides || !catalogSlides.length) return;
                var frameId = getSkillFrame(skill.number);
                if (!frameId) return;
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides) return;

                var group = [];

                // assembleFrame does angular.copy so labels are preserved — match by label
                angular.forEach(catalogSlides, function (catalogSlide) {
                    angular.forEach(frame.slides, function (slide) {
                        if (slide.label === catalogSlide.label) {
                            group.push({ slide: slide, frameId: frameId, frame: frame });
                        }
                    });
                });

                if (!group.length) return;
                if (!groupsByFrame[frameId]) groupsByFrame[frameId] = [];
                groupsByFrame[frameId].push(group);
            });

            var frameOrder = [];
            var rounds = 0;
            angular.forEach(FrameService.frames, function (frame, id) {
                if (!groupsByFrame[id]) return;
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

            // Best of Nation slides are assigned to the same configured special-award frame.
            if (catalog[SLIDE_KEYS.BEST_OF_NATION]) {
                var bonFrame = FrameService.frames[albertVidalFrame];
                if (bonFrame && bonFrame.slides) {
                    angular.forEach(bonFrame.slides, function (slide) {
                        if (slide.template === 'best_of_nation.html') {
                            list.push({ slide: slide, frameId: albertVidalFrame, frame: bonFrame });
                        }
                    });
                }
            }

            if (albertVidalFrame && catalog[SLIDE_KEYS.ALBERT_VIDAL]) {
                var avaFrame = FrameService.frames[albertVidalFrame];
                if (avaFrame && avaFrame.slides) {
                    angular.forEach(avaFrame.slides, function (slide) {
                        if (slide.label === ALBERT_VIDAL_AWARD_LABEL) {
                            list.push({ slide: slide, frameId: albertVidalFrame, frame: avaFrame });
                        }
                    });
                }
            }

            var byFrame = {};
            angular.forEach(list, function (item) {
                if (!byFrame[item.frameId]) byFrame[item.frameId] = [];
                byFrame[item.frameId].push(item);
            });

            return { list: list, byFrame: byFrame };
        }

        return {
            getSkillFrame: getSkillFrame,
            getAlbertVidalFrame: getAlbertVidalFrame,
            getSkillQueueSlides: getSkillQueueSlides,
            buildQueueList: buildQueueList
        };
    });

})();
