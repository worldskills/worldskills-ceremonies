(function () {
    'use strict';

    angular
        .module('ceremoniesApp')
        .run(function (Catalog, FrameService, ResultFormat, Routing, SLIDE_KEYS, TEMPLATE_BASE) {
            function frameForSkill(project, skillNumber) {
                var normalized = ResultFormat.normalizeSkillNum(skillNumber);
                return (project.frames || []).filter(function (frame) {
                    return ((frame.ordering && frame.ordering.skillNumbers) || []).some(function (number) {
                        return ResultFormat.normalizeSkillNum(number) === normalized;
                    });
                })[0];
            }

            function firstFrame(project) {
                return (project.frames || [])[0] || { id: 'a', label: 'Main Stage' };
            }

            function bestOfNationFrame(project) {
                var configured = ((project.awardingSequence && project.awardingSequence.slides) || []).filter(
                    function (step) {
                        return step.kind === 'bestOfNation' && step.frameId;
                    }
                )[0];
                return (
                    (configured &&
                        (project.frames || []).filter(function (frame) {
                            return frame.id === configured.frameId;
                        })[0]) ||
                    firstFrame(project)
                );
            }

            function filename(skill, index, suffix) {
                return (
                    [String(index + 1).padStart(2, '0'), skill.name && skill.name.text, suffix]
                        .filter(Boolean)
                        .join('-') + '.png'
                );
            }

            function needsWideMedalOverlay(results) {
                return (results || []).some(function (result) {
                    var competitors = result.competitors || [];
                    return (
                        competitors.length > 1 ||
                        competitors.some(function (name) {
                            return String(name).length > 32;
                        })
                    );
                });
            }

            function payload(frame, slide, state, template) {
                return {
                    template: TEMPLATE_BASE + (template || slide.template),
                    context: angular.copy(slide.context || {}),
                    state: angular.copy(state || []),
                    kind: slide.kind,
                    background: null,
                    dynamicState: [],
                    label: slide.label || '',
                    frameId: frame.id,
                    frameLabel: frame.label || frame.id,
                    accent: FrameService.getFrameColor(frame.id),
                    video: '',
                    testMode: false,
                };
            }

            function build(input) {
                var project = input.project || {};
                var skills = input.skills || [];
                var selected = input.slideTypes || ['callup', 'medals', 'mfe', 'best-of-nation'];

                FrameService.loadFromProject(project.frames || []);
                FrameService.setSkillOrder(project.skillOrder || []);
                FrameService.setFeedTypes(project.feedTypes || []);
                FrameService.awardingSequence = null;
                Routing.set(project.routing || {});

                var catalog = Catalog.build({
                    skills: skills,
                    members: input.members || [],
                    results: input.results || [],
                    bestOfNation: input.bestOfNation || [],
                    bestOfNationGroupSize: 6,
                }).slides;
                var jobs = [];
                var skipped = [];
                var wanted = [
                    {
                        kind: 'callup',
                        suffix: 'callup',
                        states: function () {
                            return ['Countries'];
                        },
                    },
                    {
                        kind: 'medals',
                        suffix: 'medals',
                        template: 'skill_medals_overlay.html',
                        states: function (slide) {
                            return slide.states || [];
                        },
                    },
                    {
                        kind: 'mfe',
                        suffix: 'mfe',
                        states: function (slide) {
                            return slide.states || ['Name'];
                        },
                    },
                ].filter(function (definition) {
                    return selected.indexOf(definition.kind) >= 0;
                });

                angular.forEach(FrameService.sortSkills(skills), function (skill, index) {
                    var slides = catalog[skill.number];
                    if (!slides || !slides.length) return;
                    var frame = frameForSkill(project, skill.number) || firstFrame(project);
                    angular.forEach(wanted, function (definition) {
                        var slide = slides.filter(function (candidate) {
                            return candidate.kind === definition.kind;
                        })[0];
                        if (!slide) {
                            skipped.push(String(skill.number) + ' ' + definition.suffix);
                            return;
                        }
                        var jobPayload = payload(frame, slide, definition.states(slide), definition.template);
                        if (definition.kind === 'medals') {
                            jobPayload.context.wideOverlay = needsWideMedalOverlay(slide.context.results);
                        }
                        jobs.push({
                            filename: filename(skill, index, definition.suffix),
                            payload: jobPayload,
                        });
                    });
                });

                var bonFrame = bestOfNationFrame(project);
                var bestOfNationSlides = catalog[SLIDE_KEYS.BEST_OF_NATION] || [];
                if (selected.indexOf('best-of-nation') >= 0) {
                    angular.forEach(bestOfNationSlides, function (slide, index) {
                        jobs.push({
                            filename: 'best-of-nation-' + String(index + 1).padStart(2, '0') + '.png',
                            payload: payload(bonFrame, slide, slide.states || [], 'skill_medals_overlay.html'),
                        });
                    });
                }

                return { jobs: jobs, skipped: skipped, bestOfNationCount: bestOfNationSlides.length };
            }

            window.buildSlideExportJobs = build;
        });
})();
