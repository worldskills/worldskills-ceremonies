(function () {
    'use strict';

    angular
        .module('ceremoniesControlWorkspace', [])
        // Everything slide-row.html and its siblings call on the host scope. Control, Remote
        // and Operator all keep their frames in scope.screens, so one installer serves all
        // three — Control's is FrameService.frames itself, the other two hold a snapshot.
        .factory('SlideRowScope', function () {
            return function (scope) {
                function frameFor(frameId) {
                    return scope.screens && scope.screens[frameId];
                }

                // Control holds the real FrameService; Remote and Operator hold a facade over
                // the last snapshot. Both expose the project's feeds the same way.
                function feeds() {
                    return (scope.FrameService && scope.FrameService.feedTypes) || [];
                }

                function primaryFeedId() {
                    return (feeds()[0] || {}).id || '';
                }

                function feedBadge(feedId) {
                    var match = feeds().filter(function (feed) {
                        return feed.id === feedId;
                    })[0];
                    return String((match && match.label) || feedId)
                        .charAt(0)
                        .toUpperCase();
                }

                scope.getSlidePosition = function (frameId) {
                    var frame = frameFor(frameId);
                    if (!frame || !frame.slides.length) {
                        return '—';
                    }
                    var index = frame.slides.indexOf(frame.slide);
                    return (index < 0 ? '—' : index + 1) + '/' + frame.slides.length;
                };

                scope.isPreviewingSlide = function (frameId, slide) {
                    var frame = frameFor(frameId);
                    return !!frame && frame.previewSlide === slide;
                };

                scope.canEditSlide = function (frameId, slide) {
                    var frame = frameFor(frameId);
                    return !!frame && (frame.slide === slide || frame.previewSlide === slide);
                };

                // A pinned Preview slide reveals out of the frame's previewState, not the slide's own.
                scope.rowHasState = function (frameId, slide, state) {
                    var frame = frameFor(frameId);
                    var states;
                    if (frame && frame.previewSlide === slide) {
                        states = frame.previewState;
                    } else {
                        states = slide && slide.state;
                    }
                    return (states || []).indexOf(state) >= 0;
                };

                // Which feed a reveal lands on, as a one-letter badge taken from that feed's
                // own label — the project names its feeds, so nothing here assumes M or S.
                scope.stateFeedLabel = function (slide, state) {
                    var routed = slide && slide.stateFeedTypes && slide.stateFeedTypes[state];
                    return feedBadge(routed || primaryFeedId());
                };

                scope.isFeedBlanked = function (frame, feedType) {
                    return !!(frame && frame.blankedFeeds && frame.blankedFeeds[feedType]);
                };

                scope.blankFeedNames = function (frame) {
                    return Object.keys((frame && frame.blankedFeeds) || {}).join(', ');
                };
            };
        })
        .factory('SlideSnapshot', function () {
            // Merges a control snapshot's slides onto the ones already on screen, keyed by
            // slideId so row scopes, open editors and unsent context drafts survive a sync.
            function mergeSlides(existing, incoming, primaryFeedId) {
                var byId = {};

                angular.forEach(existing || [], function (slide) {
                    if (slide.slideId) {
                        byId[slide.slideId] = slide;
                    }
                });

                return (incoming || []).map(function (source) {
                    var slide = byId[source.slideId] || {};
                    var editing = !!slide.edit;
                    var draft = slide.context;

                    angular.extend(slide, source);
                    slide.state = source.state || [];
                    slide.states = source.states || [];
                    slide.baseFeedTypes = source.baseFeedTypes || (primaryFeedId ? [primaryFeedId] : []);
                    slide.stateFeedTypes = source.stateFeedTypes || {};
                    slide.feedContent = source.feedContent || {};
                    slide.done = !!source.done;

                    slide.edit = editing;
                    if (editing) {
                        slide.context = draft;
                    }

                    return slide;
                });
            }

            return { mergeSlides: mergeSlides };
        })
        .directive('controlWorkspace', function () {
            return {
                restrict: 'E',
                transclude: true,
                templateUrl: 'partials/control-workspace.html',
            };
        })
        .directive('slideRow', function () {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: 'partials/slide-row.html',
                link: function (scope, element, attrs) {
                    // ng-repeat can reuse this row's scope/DOM across rebuilds (e.g. "track by
                    // $index" on frame.slides, whose entries are replaced wholesale on every
                    // assembleFrame run) without relinking — a one-time $eval here would freeze
                    // rowSlide/rowFrameId to whatever they were at first link, leaving a stale
                    // row that no longer matches any real slide (and reads as non-clickable,
                    // since canEditSlide etc. compare against the frozen object). Watch instead.
                    scope.$watch(attrs.frameId, function (v) {
                        scope.rowFrameId = v;
                    });
                    scope.$watch(attrs.slide, function (v) {
                        scope.rowSlide = v;
                    });
                    if (attrs.label) {
                        scope.$watch(attrs.label, function (v) {
                            scope.rowLabel = v;
                        });
                    }
                    scope.rowEditContext = attrs.editContext !== 'false';
                    scope.rowShowBadge = attrs.showBadge ? !!scope.$eval(attrs.showBadge) : false;
                    if (attrs.frameLabel) {
                        scope.$watch(attrs.frameLabel, function (v) {
                            scope.rowFrameLabel = v;
                        });
                    } else {
                        scope.rowFrameLabel = '';
                    }
                    scope.rowQueueIdx = attrs.queueIdx ? scope.$eval(attrs.queueIdx) : null;
                    var liveExpr = attrs.onLive;
                    scope.rowShowLive = function () {
                        scope.$eval(liveExpr);
                    };
                },
            };
        })
        .directive('jsonText', function ($filter) {
            return {
                restrict: 'A',
                require: 'ngModel',
                link: function (scope, element, attr, ngModel) {
                    ngModel.$parsers.push(function (input) {
                        try {
                            var parsed = JSON.parse(input);
                            ngModel.$setValidity('json', true);
                            return parsed;
                        } catch (e) {
                            ngModel.$setValidity('json', false);
                            return undefined;
                        }
                    });
                    ngModel.$formatters.push(function (data) {
                        return $filter('json')(data);
                    });
                },
            };
        });
})();
