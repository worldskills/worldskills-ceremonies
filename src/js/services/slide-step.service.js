(function () {
    'use strict';

    // The reveal rules behind Prev/Next, shared by the frame stepper (frames.part.js)
    // and both queue steppers (queue.part.js) so all three agree on what a key press does.
    angular.module('ceremoniesApp').factory('SlideStep', function () {

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

        return { nextState: nextState, lastState: lastState };
    });

})();
