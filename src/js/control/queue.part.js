(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('QueuePart', function (FrameService, Queue, QueueScroll, SlideStep, SLIDE_KEYS, QUEUE_LAYOUTS) {
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
                if (idx >= 0) {
                    frame.ordering.skillNumbers.splice(idx, 1);
                }
            });

            if (toFrameId && FrameService.frames[toFrameId]) {
                FrameService.frames[toFrameId].ordering.skillNumbers.push(skillNumber);
            }

            $scope.refreshFramesAfterOrderingChange();
        };

        $scope.toggleAlbertVidalForFrame = function (frameId) {
            FrameService.setAlbertVidalFrame(frameId);
            $scope.refreshFramesAfterOrderingChange();
        };

        $scope.selectSkillForQueue = function (skill) {
            $scope.skillsSelectedSkill = skill;
            $scope.skillsSelectedSlides = $scope.getSkillQueueSlides(skill.number);
        };

        $scope.showSlideFromSkillsView = function (item, initialState) {
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide, initialState);
        };

        function stepSkills(direction) {
            var items = $scope.skillsSelectedSlides;
            var index = currentIndex(items);
            var step = SlideStep.resolve(items.map(function (item) { return item.slide; }), index, direction);
            if (!step) {
                return;
            }
            if (step.state) {
                $scope.toggleState(items[index].frameId, items[index].slide, step.state, true);
            } else if (step.index < items.length) {
                $scope.showSlideFromSkillsView(items[step.index], step.initialState);
            } else {
                var current = items[index];
                current.slide.done = true;
                var frame = FrameService.frames[current.frameId];
                if (frame) {
                    frame.slide = undefined;
                    $scope.update(current.frameId);
                }
                $scope.skillsSelectedSkill = null;
                $scope.skillsSelectedSlides = [];
            }
        }

        $scope.skillNext = function () {
            stepSkills(1);
        };

        $scope.skillPrev = function () {
            stepSkills(-1);
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
            if (!slides || !slides.length) {
                return false;
            }
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

        $scope.showFromQueueList = function (idx, initialState) {
            var item = $scope.queueList[idx];
            if (!item) {
                return;
            }
            $scope.setActiveFrame(item.frameId);
            $scope.showSlide(item.frameId, item.slide, initialState);
            QueueScroll.scrollQueueListToIndex(idx);
        };

        function stepQueue(direction) {
            var items = $scope.queueList;
            var index = currentIndex(items, FrameService.activeFrameId);
            var item = items[index];
            var step = SlideStep.resolve(items.map(function (entry) { return entry.slide; }), index, direction);
            if (!step) {
                return;
            }
            if (step.state) {
                $scope.toggleState(item.frameId, item.slide, step.state, true);
                return;
            }
            if (direction > 0 && item && !hasLaterQueueItemForFrame(index, item.frameId)) {
                $scope.resetFrame(item.frameId);
            }
            if (step.index < items.length) {
                $scope.showFromQueueList(step.index, step.initialState);
            }
        }

        $scope.queueListNext = function () {
            stepQueue(1);
        };

        $scope.queueListPrev = function () {
            stepQueue(-1);
        };

        function hasLaterQueueItemForFrame(idx, frameId) {
            for (var i = idx + 1; i < $scope.queueList.length; i++) {
                if ($scope.queueList[i].frameId === frameId) {
                    return true;
                }
            }
            return false;
        }

        function currentIndex(items, frameId) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if ((frameId === undefined || it.frameId === frameId) &&
                    FrameService.frames[it.frameId] && FrameService.frames[it.frameId].slide === it.slide) {
                    return i;
                }
            }
            return -1;
        }
      };
    });
})();
