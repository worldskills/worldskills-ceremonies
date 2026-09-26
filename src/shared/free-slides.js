(function (root) {
    'use strict';

    function frameIds(slide) {
        return Array.isArray(slide.frameIds) ? slide.frameIds : slide.frameId ? [slide.frameId] : [];
    }

    function slideId(slide, frameId) {
        var frames = frameIds(slide);
        return 'free:' + slide.id + (frames.length > 1 ? ':' + frameId : '');
    }

    function placementFor(slide, frameId) {
        return slide.placements ? slide.placements[frameId] : slide.placement;
    }

    // Shared by the dialog and project I/O so hand-written slides.json follows the same rules.
    function validate(slides) {
        if (!Array.isArray(slides)) return 'Free slides must be an array.';
        var ids = [];
        for (var i = 0; i < slides.length; i++) {
            var slide = slides[i];
            if (!slide || typeof slide !== 'object') return 'Every free slide must be an object.';
            if (typeof slide.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(slide.id) || ids.indexOf(slide.id) >= 0) {
                return 'Free slide IDs must be unique identifiers.';
            }
            ids.push(slide.id);
            if (typeof slide.name !== 'string' || !slide.name.trim()) return 'A slide name is required.';
            if (
                typeof slide.template !== 'string' ||
                !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.html$/.test(slide.template)
            ) {
                return 'Template must be a relative HTML filename, e.g. welcome.html.';
            }
            if (
                !Array.isArray(slide.states) ||
                slide.states.some(function (state, index) {
                    return typeof state !== 'string' || !state.trim() || slide.states.indexOf(state) !== index;
                })
            )
                return 'States must be a JSON array of unique, non-empty strings.';
            if (!slide.context || typeof slide.context !== 'object' || Array.isArray(slide.context)) {
                return 'Content must be a JSON object.';
            }
            if (typeof slide.clearHighlights !== 'undefined' && typeof slide.clearHighlights !== 'boolean') {
                return 'Clear highlights must be true or false.';
            }
            if (typeof slide.synchronized !== 'undefined' && typeof slide.synchronized !== 'boolean') {
                return 'Synchronized must be true or false.';
            }
            if (typeof slide.confirmBeforeLive !== 'undefined' && typeof slide.confirmBeforeLive !== 'boolean') {
                return 'Live confirmation must be true or false.';
            }
            var frames = frameIds(slide);
            if (
                !frames.length ||
                frames.some(function (frameId, index) {
                    return (
                        typeof frameId !== 'string' ||
                        !/^[a-zA-Z0-9_-]+$/.test(frameId) ||
                        frames.indexOf(frameId) !== index
                    );
                }) ||
                typeof slide.feedType !== 'string' ||
                !/^[a-zA-Z0-9_-]+$/.test(slide.feedType)
            )
                return 'At least one destination frame and an output feed are required.';
            if (typeof slide.background !== 'undefined') {
                if (!slide.background || typeof slide.background !== 'object' || Array.isArray(slide.background)) {
                    return 'Background must be an object keyed by frame ID.';
                }
                var backgroundFrames = Object.keys(slide.background);
                for (var b = 0; b < backgroundFrames.length; b++) {
                    var backgroundFrame = backgroundFrames[b];
                    var background = slide.background[backgroundFrame];
                    if (
                        frames.indexOf(backgroundFrame) < 0 ||
                        !background ||
                        typeof background !== 'object' ||
                        Array.isArray(background) ||
                        ['video', 'image'].indexOf(background.type) < 0 ||
                        typeof background.filename !== 'string' ||
                        !background.filename ||
                        background.filename.length > 200 ||
                        /[\\/]/.test(background.filename)
                    ) {
                        return 'Each background needs a selected frame, type (video/image), and filename.';
                    }
                }
            }
            if (typeof slide.sort !== 'number' || !isFinite(slide.sort)) return 'Sort must be a finite number.';
            if (slide.placements && (typeof slide.placements !== 'object' || Array.isArray(slide.placements))) {
                return 'Frame placements must be an object.';
            }
            for (var j = 0; j < frames.length; j++) {
                var placement = placementFor(slide, frames[j]);
                if (!placement || ['start', 'afterSkills', 'end', 'before', 'after'].indexOf(placement.position) < 0) {
                    return 'Choose queue start, after skills, queue end, or before/after a skill for every frame.';
                }
                if (placement.position === 'before' || placement.position === 'after') {
                    if (typeof placement.skillNumber !== 'string' || !/^\d+$/.test(placement.skillNumber)) {
                        return 'Choose an anchor skill for every frame.';
                    }
                    if (['', 'callup', 'medals', 'mfe'].indexOf(placement.kind) < 0)
                        return 'Choose a valid skill slide type.';
                }
            }
        }
        return null;
    }

    var api = { frameIds: frameIds, slideId: slideId, placementFor: placementFor, validate: validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CeremonatorFreeSlides = api;
})(typeof window !== 'undefined' ? window : this);
