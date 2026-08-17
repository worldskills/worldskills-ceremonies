(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Queue', function (FrameService, SLIDE_KEYS) {

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
                    if (slide.label === 'Albert Vidal Award') {
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

        function buildQueueList(catalog, skills, albertVidalFrame) {
            if (!catalog) return { list: [], byFrame: {} };
            var list = [];

            angular.forEach(skills, function (skill) {
                var catalogSlides = catalog[skill.number];
                if (!catalogSlides || !catalogSlides.length) return;
                var frameId = getSkillFrame(skill.number);
                if (!frameId) return;
                var frame = FrameService.frames[frameId];
                if (!frame || !frame.slides) return;

                // assembleFrame does angular.copy so labels are preserved — match by label
                angular.forEach(catalogSlides, function (catalogSlide) {
                    angular.forEach(frame.slides, function (slide) {
                        if (slide.label === catalogSlide.label) {
                            list.push({ slide: slide, frameId: frameId, frame: frame });
                        }
                    });
                });
            });

            // Best of Nation slides are assigned to the same configured special-award frame.
            if (albertVidalFrame && catalog[SLIDE_KEYS.BEST_OF_NATION]) {
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
                        if (slide.label === 'Albert Vidal Award') {
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
