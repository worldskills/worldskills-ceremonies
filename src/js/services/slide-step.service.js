(function () {
    'use strict';

    // The reveal rules behind Prev/Next, shared by Control, Remote and Operator.
    var SlideStep = (function () {
        function isRevealed(slide, state) {
            return ((slide && slide.state) || []).indexOf(state) >= 0;
        }

        // The next reveal to turn on, or undefined once the slide is fully revealed.
        function nextState(slide) {
            var states = (slide && slide.states) || [];
            for (var i = 0; i < states.length; i++) {
                if (!isRevealed(slide, states[i])) {
                    return states[i];
                }
            }
        }

        // The reveal Prev takes back off, or undefined when none is on.
        function lastState(slide) {
            var state = (slide && slide.state) || [];
            return state[state.length - 1];
        }

        // Views choose their queue and handle its end; reveal order and backwards
        // entry are identical everywhere. An index equal to length means completion.
        function resolve(slides, index, direction) {
            if (!slides.length) {
                return null;
            }
            var slide = slides[index];
            var state = direction > 0 ? nextState(slide) : lastState(slide);
            if (state) {
                return { state: state };
            }
            var target = index < 0 ? (direction > 0 ? 0 : slides.length - 1) : index + direction;
            if (target < 0) {
                return null;
            }
            return {
                index: target,
                initialState: direction < 0 ? slides[target].states || [] : undefined,
            };
        }

        return { resolve: resolve };
    })();

    angular.module('ceremoniesControlWorkspace').factory('SlideStep', function () {
        return SlideStep;
    });

    var MESSAGE = 'Are you sure? This action will change all frames to that slide';

    function allowSlide(slide) {
        return !slide || !slide.confirmBeforeLive || window.confirm(MESSAGE);
    }

    function allowStep(frame, direction) {
        if (!frame) return true;
        var slides = frame.slides || [];
        var step = SlideStep.resolve(slides, frame.slide ? slides.indexOf(frame.slide) : -1, direction);
        return !step || !!step.state || step.index >= slides.length || allowSlide(slides[step.index]);
    }

    window.CeremonatorLiveConfirm = { allowSlide: allowSlide, allowStep: allowStep };
})();
