(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('QueuePart', function (FrameService, Queue, QueueScroll, SLIDE_KEYS, QUEUE_LAYOUTS) {
      return function ($scope) {
        $scope.queueViewOpen = false;
        $scope.queueLayout = QUEUE_LAYOUTS.LIST;
        $scope.skillsSelectedSkill = null;
        $scope.skillsSelectedSlides = [];
        $scope.queueList = [];
        $scope.queueByFrame = {};

        $scope.getSkillFrame = function (skillNumber) {
            return Queue.getSkillFrame(skillNumber);
        };

        $scope.getAlbertVidalFrame = function () {
            return Queue.getAlbertVidalFrame();
        };

        $scope.getSkillQueueSlides = function (skillNumber) {
            return Queue.getSkillQueueSlides($scope.catalog, $scope.albertVidalFrame, skillNumber);
        };

        $scope.buildQueueList = function () {
            var built = Queue.buildQueueList($scope.catalog, $scope.skills, $scope.albertVidalFrame);
            $scope.queueList = built.list;
            $scope.queueByFrame = built.byFrame;
        };

        $scope.moveSkillToFrame = function (skillNumber, toFrameId) {
            angular.forEach(FrameService.frames, function (frame) {
                var idx = frame.ordering.skillNumbers.indexOf(skillNumber);
                if (idx >= 0) frame.ordering.skillNumbers.splice(idx, 1);
            });

            if (toFrameId && FrameService.frames[toFrameId]) {
                FrameService.frames[toFrameId].ordering.skillNumbers.push(skillNumber);
            }

            $scope.refreshFramesAfterOrderingChange();
        };

        $scope.toggleAlbertVidalForFrame = function (frameId) {
            angular.forEach(FrameService.frames, function (frame, id) {
                frame.ordering.includeAlbertVidal = (id === frameId);
            });

            $scope.refreshFramesAfterOrderingChange();
        };

        $scope.selectSkillForQueue = function (skill) {
            $scope.skillsSelectedSkill = skill;
            $scope.skillsSelectedSlides = $scope.getSkillQueueSlides(skill.number);
        };

        $scope.showSlideFromSkillsView = function (item) {
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide);
        };

        $scope.skillNext = function () {
            if (!$scope.skillsSelectedSlides.length) return;
            var activeIdx = -1;

            angular.forEach($scope.skillsSelectedSlides, function (item, i) {
                if (activeIdx < 0 && FrameService.frames[item.frameId] && FrameService.frames[item.frameId].slide === item.slide) {
                    activeIdx = i;
                }
            });

            if (activeIdx < 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[0]);
                return;
            }

            var cur = $scope.skillsSelectedSlides[activeIdx];
            if (cur.slide.states && cur.slide.states.length > 0) {
                for (var i = 0; i < cur.slide.states.length; i++) {
                    if (!$scope.hasState(cur.slide, cur.slide.states[i])) {
                        if (!cur.slide.state) cur.slide.state = [];
                        cur.slide.state.push(cur.slide.states[i]);
                        $scope.update(cur.frameId);
                        return;
                    }
                }
            }

            if (activeIdx < $scope.skillsSelectedSlides.length - 1) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[activeIdx + 1]);
                return;
            }

            cur.slide.done = true;

            var frame = FrameService.frames[cur.frameId];
            if (frame) {
                frame.slide = undefined;
                $scope.update(cur.frameId);
            }

            $scope.skillsSelectedSkill = null;
            $scope.skillsSelectedSlides = [];
        };

        $scope.skillPrev = function () {
            if (!$scope.skillsSelectedSlides.length) return;

            var activeIdx = -1;
            angular.forEach($scope.skillsSelectedSlides, function (item, i) {
                if (activeIdx < 0 && FrameService.frames[item.frameId] && FrameService.frames[item.frameId].slide === item.slide) {
                    activeIdx = i;
                }
            });

            if (activeIdx < 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[$scope.skillsSelectedSlides.length - 1]);
                return;
            }

            var cur = $scope.skillsSelectedSlides[activeIdx];
            if (cur.slide.state && cur.slide.state.length > 0) {
                cur.slide.state.splice(cur.slide.state.length - 1, 1);
                $scope.update(cur.frameId);
                return;
            }

            if (activeIdx > 0) {
                $scope.showSlideFromSkillsView($scope.skillsSelectedSlides[activeIdx - 1]);
            }
        };

        $scope.reassignSkillFrame = function (skillNumber, frameId) {
            var oldFrameId = skillNumber === SLIDE_KEYS.ALBERT_VIDAL
                ? $scope.albertVidalFrame
                : $scope.getSkillFrame(skillNumber);

            var activeSlideLabel = null;
            var beforeSlides = $scope.getSkillQueueSlides(skillNumber);
            angular.forEach(beforeSlides, function (item) {
                if (!activeSlideLabel && FrameService.frames[item.frameId] && FrameService.frames[item.frameId].slide === item.slide) {
                    activeSlideLabel = item.slide.label;
                }
            });

            if (skillNumber === SLIDE_KEYS.ALBERT_VIDAL) {
                $scope.toggleAlbertVidalForFrame(frameId);
            } else {
                $scope.moveSkillToFrame(skillNumber, frameId);
            }

            var newSlides = $scope.getSkillQueueSlides(skillNumber);
            if ($scope.skillsSelectedSkill && $scope.skillsSelectedSkill.number === skillNumber) {
                $scope.skillsSelectedSlides = newSlides;
            }

            if (activeSlideLabel && oldFrameId && oldFrameId !== frameId) {
                var oldFrame = FrameService.frames[oldFrameId];
                if (oldFrame) {
                    oldFrame.slide = undefined;
                    $scope.update(oldFrameId);
                }
            }

            // Sets frame.slide directly instead of showSlide() — bypasses its
            // same-slide guard so state always resets and localStorage always
            // gets written.
            if (activeSlideLabel) {
                var shown = false;
                angular.forEach(newSlides, function (item) {
                    if (!shown && item.slide.label === activeSlideLabel) {
                        shown = true;
                        $scope.setActiveFrame(item.frameId);
                        item.slide.done = true;
                        item.slide.state = [];
                        FrameService.frames[item.frameId].slide = item.slide;
                        $scope.update(item.frameId);
                    }
                });
            }
        };

        $scope.skillShortLabel = function (fullLabel, skillName) {
            var prefix = skillName + ' - ';

            if (fullLabel && skillName && fullLabel.indexOf(prefix) === 0) {
                return fullLabel.substring(prefix.length);
            }

            return fullLabel;
        };

        $scope.isSkillFullyDisplayed = function (skillNumber) {
            var slides = $scope.getSkillQueueSlides(skillNumber);
            if (!slides || !slides.length) return false;
            return slides.every(function (item) {
                return item.slide.done;
            });
        };

        $scope.showSlideFromQueue = function (item, listIdx, frameIdx, frameId) {
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide);
            QueueScroll.scrollQueueLookahead($scope.queueLayout, {
                listIdx: listIdx,
                listLength: $scope.queueList.length,
                frameIdx: frameIdx,
                frameId: frameId,
                frameItems: $scope.queueByFrame[frameId] || []
            });
        };

        $scope.showFromQueueList = function (idx) {
            var item = $scope.queueList[idx];
            if (!item) return;
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide);
            QueueScroll.scrollQueueListToIndex(idx);
        };

        $scope.queueListNext = function () {
            if (!$scope.queueList.length) return;
            var idx = currentQueueListIndex();
            if (idx < 0) {
                $scope.showFromQueueList(0);
                return;
            }
            var slide = $scope.queueList[idx].slide;
            if (slide.states && slide.states.length > 0) {
                for (var i = 0; i < slide.states.length; i++) {
                    if (!$scope.hasState(slide, slide.states[i])) {
                        if (!slide.state) slide.state = [];
                        slide.state.push(slide.states[i]);
                        $scope.update($scope.queueList[idx].frameId);
                        return;
                    }
                }
            }
            if (idx < $scope.queueList.length - 1) $scope.showFromQueueList(idx + 1);
        };

        $scope.queueListPrev = function () {
            if (!$scope.queueList.length) return;
            var idx = currentQueueListIndex();
            if (idx < 0) {
                $scope.showFromQueueList($scope.queueList.length - 1);
                return;
            }
            var slide = $scope.queueList[idx].slide;
            if (slide.state && slide.state.length > 0) {
                slide.state.splice(slide.state.length - 1, 1);
                $scope.update($scope.queueList[idx].frameId);
                return;
            }
            if (idx > 0) $scope.showFromQueueList(idx - 1);
        };

        function currentQueueListIndex() {
            for (var i = 0; i < $scope.queueList.length; i++) {
                var it = $scope.queueList[i];
                if (it.frameId === FrameService.activeFrameId &&
                    FrameService.frames[it.frameId] && FrameService.frames[it.frameId].slide === it.slide) {
                    return i;
                }
            }
            return -1;
        }
      };
    });
})();
