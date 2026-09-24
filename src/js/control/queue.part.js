(function () {
    'use strict';

    angular
        .module('ceremoniesApp')
        .factory('QueuePart', function (FrameService, Queue, QueueScroll, SlideStep, SLIDE_KEYS, QUEUE_LAYOUTS) {
            return function ($scope) {
                $scope.queueViewOpen = false;
                $scope.queueLayout = QUEUE_LAYOUTS.LIST;
                $scope.skillsSelectedSkill = null;
                $scope.skillsSelectedSlides = [];
                $scope.queueList = [];
                $scope.queueByFrame = {};
                $scope.freeSlideDialogOpen = false;

                $scope.editFreeSlide = function (slideId, frameId) {
                    var definition = FrameService.freeSlides.filter(function (slide) {
                        return window.CeremonatorFreeSlides.frameIds(slide).some(function (id) {
                            return window.CeremonatorFreeSlides.slideId(slide, id) === slideId;
                        });
                    })[0];
                    $scope.freeSlideDraft = definition
                        ? angular.copy(definition)
                        : {
                              id: 'slide-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                              name: '',
                              template: '',
                              states: [],
                              context: {},
                              frameIds: [frameId || FrameService.activeFrameId],
                              feedType: FrameService.primaryFeedId(),
                              placements: {},
                              sort: 0,
                          };
                    $scope.freeSlideDraft.frameIds = window.CeremonatorFreeSlides.frameIds($scope.freeSlideDraft);
                    delete $scope.freeSlideDraft.frameId;
                    if (!$scope.freeSlideDraft.placements) $scope.freeSlideDraft.placements = {};
                    angular.forEach($scope.freeSlideDraft.frameIds, function (id) {
                        if (!$scope.freeSlideDraft.placements[id]) {
                            $scope.freeSlideDraft.placements[id] = angular.copy(
                                $scope.freeSlideDraft.placement || { position: 'end', skillNumber: '', kind: '' }
                            );
                        }
                    });
                    delete $scope.freeSlideDraft.placement;
                    $scope.freeSlideStatesText = angular.toJson($scope.freeSlideDraft.states, true);
                    $scope.freeSlideContentText = angular.toJson($scope.freeSlideDraft.context, true);
                    $scope.freeSlideError = null;
                    $scope.freeSlideDialogOpen = true;
                };

                $scope.isFreeSlideQueued = function (definition) {
                    return window.CeremonatorFreeSlides.frameIds(definition).every(function (frameId) {
                        var id = window.CeremonatorFreeSlides.slideId(definition, frameId);
                        return $scope.queueList.some(function (item) {
                            return item.slide.slideId === id;
                        });
                    });
                };

                $scope.toggleFreeSlideFrame = function (frameId) {
                    var frames = $scope.freeSlideDraft.frameIds;
                    var index = frames.indexOf(frameId);
                    if (index < 0) {
                        frames.push(frameId);
                        if (!$scope.freeSlideDraft.placements[frameId]) {
                            $scope.freeSlideDraft.placements[frameId] = {
                                position: 'end',
                                skillNumber: '',
                                kind: '',
                            };
                        }
                    } else frames.splice(index, 1);
                };

                $scope.freeSlideSkillsForFrame = function (frameId) {
                    var frame = FrameService.frames[frameId];
                    var numbers = (frame && frame.ordering.skillNumbers) || [];
                    return ($scope.skills || [])
                        .filter(function (skill) {
                            return numbers.some(function (number) {
                                return Number(number) === Number(skill.number);
                            });
                        })
                        .map(function (skill) {
                            return { number: String(skill.number), name: skill.name };
                        });
                };

                function refreshFreeSlides() {
                    // Editing the queue must preserve the operator's live/preview progress.
                    var previous = {};
                    angular.forEach(FrameService.frames, function (frame, id) {
                        var slides = {};
                        angular.forEach(frame.slides, function (slide) {
                            slides[slide.slideId] = slide;
                        });
                        previous[id] = slides;
                        $scope.assembleFrame(frame, $scope.catalog || {});
                    });
                    $scope.buildQueueList();
                    angular.forEach(FrameService.frames, function (frame, id) {
                        angular.forEach(frame.slides, function (slide) {
                            var old = previous[id][slide.slideId];
                            if (!old) return;
                            slide.done = old.done;
                            slide.state = (old.state || []).filter(function (state) {
                                return (slide.states || []).indexOf(state) >= 0;
                            });
                        });
                        if (frame.previewSlide) {
                            frame.previewState = (frame.previewState || []).filter(function (state) {
                                return (frame.previewSlide.states || []).indexOf(state) >= 0;
                            });
                        }
                        $scope.update(id);
                    });
                    if ($scope.skillsSelectedSkill) {
                        $scope.skillsSelectedSlides = $scope.getSkillQueueSlides($scope.skillsSelectedSkill.number);
                    }
                    $scope.projectDirty = true;
                }

                $scope.saveFreeSlide = function () {
                    var draft = angular.copy($scope.freeSlideDraft);
                    try {
                        draft.states = angular.fromJson($scope.freeSlideStatesText);
                        draft.context = angular.fromJson($scope.freeSlideContentText);
                    } catch (e) {
                        $scope.freeSlideError = 'Invalid JSON: ' + e.message;
                        return;
                    }
                    draft.name = (draft.name || '').trim();
                    draft.template = (draft.template || '').trim();
                    angular.forEach(Object.keys(draft.placements), function (frameId) {
                        if (draft.frameIds.indexOf(frameId) < 0) delete draft.placements[frameId];
                    });
                    $scope.freeSlideError = window.CeremonatorFreeSlides.validate([draft]);
                    if (
                        !$scope.freeSlideError &&
                        (draft.frameIds.some(function (frameId) {
                            return !FrameService.frames[frameId];
                        }) ||
                            !FrameService.hasFeedType(draft.feedType))
                    ) {
                        $scope.freeSlideError = 'Choose available frames and an output feed.';
                    }
                    if ($scope.freeSlideError) return;
                    var replaced = false;
                    FrameService.freeSlides = FrameService.freeSlides.map(function (definition) {
                        if (definition.id !== draft.id) return definition;
                        replaced = true;
                        return draft;
                    });
                    if (!replaced) FrameService.freeSlides.push(draft);
                    refreshFreeSlides();
                    $scope.freeSlideDialogOpen = false;
                };

                $scope.removeFreeSlide = function (definition) {
                    if (!confirm('Remove free slide "' + definition.name + '" from the project?')) return;
                    FrameService.freeSlides = FrameService.freeSlides.filter(function (slide) {
                        return slide.id !== definition.id;
                    });
                    refreshFreeSlides();
                    if ($scope.freeSlideDraft.id === definition.id) $scope.editFreeSlide();
                };

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
                    var step = SlideStep.resolve(
                        items.map(function (item) {
                            return item.slide;
                        }),
                        index,
                        direction
                    );
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
                    var oldFrameId =
                        skillNumber === SLIDE_KEYS.ALBERT_VIDAL
                            ? $scope.albertVidalFrame
                            : $scope.getSkillFrame(skillNumber);

                    var activeSlideLabel = null;
                    var beforeSlides = $scope.getSkillQueueSlides(skillNumber);
                    angular.forEach(beforeSlides, function (item) {
                        if (
                            !activeSlideLabel &&
                            FrameService.frames[item.frameId] &&
                            FrameService.frames[item.frameId].slide === item.slide
                        ) {
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
                        frameItems: $scope.queueByFrame[frameId] || [],
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
                    var step = SlideStep.resolve(
                        items.map(function (entry) {
                            return entry.slide;
                        }),
                        index,
                        direction
                    );
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
                        if (
                            (frameId === undefined || it.frameId === frameId) &&
                            FrameService.frames[it.frameId] &&
                            FrameService.frames[it.frameId].slide === it.slide
                        ) {
                            return i;
                        }
                    }
                    return -1;
                }
            };
        });
})();
