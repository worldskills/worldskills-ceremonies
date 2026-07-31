(function () {
    'use strict';

    // Development-only session persistence.
    //
    // electron-reloader reloads every renderer when a watched file changes, and
    // restarts the app outright when main.js or preload.js changes. Either way
    // the control panel re-runs from scratch — and the imported result rows,
    // the assembled slide catalog, and each frame's place in its slide list
    // live only in ControlCtrl's scope, so they were lost on every save.
    //
    // This service snapshots the raw inputs plus per-frame runtime pointers to
    // <userData>/dev-session.json (through the main process), and replays them
    // after the reload. The slide catalog itself is not stored: it is rebuilt
    // deterministically from the same results and ordering.
    //
    // Everything here is inert unless window.ceremonator.dev.isDev is true.
    angular.module('ceremoniesApp').factory('DevSession', function ($timeout, FrameService) {

        var SAVE_DEBOUNCE_MS = 600;
        var dev = (window.ceremonator && window.ceremonator.dev) || {};

        var service = {
            enabled: !!dev.isDev,
            forceDefaultTemplate: !!dev.forceDefaultTemplate,
            // Blocks saves while a snapshot is being read and replayed. Starts
            // true so the first digest — which happens long before the restore
            // resolves — can't overwrite the snapshot with empty state.
            // ControlCtrl clears it once the restore attempt has settled.
            restoring: !!dev.isDev
        };

        var collect = null;
        var pendingSave = null;

        service.registerCollector = function (fn) {
            collect = fn;
        };

        service.load = function () {
            if (!service.enabled || !dev.loadSession) return Promise.resolve(null);
            return dev.loadSession().catch(function () { return null; });
        };

        service.clear = function () {
            if (!service.enabled || !dev.clearSession) return;
            dev.clearSession();
        };

        // Debounced: walking a slide list must not cost one file write per keypress.
        service.schedule = function () {
            if (!service.enabled || !collect || service.restoring) return;
            if (pendingSave) $timeout.cancel(pendingSave);
            pendingSave = $timeout(function () {
                pendingSave = null;
                if (dev.saveSession) dev.saveSession(collect());
            }, SAVE_DEBOUNCE_MS);
        };

        // Signature of everything worth persisting, cheap enough to recompute on
        // every digest — the watcher in ControlCtrl uses it instead of a save
        // call at each of the two dozen mutation sites.
        service.fingerprint = function (scope) {
            var parts = [
                (scope.results || []).length,
                (scope.resultsBestOfNations || []).length,
                scope.uploaded ? 1 : 0,
                FrameService.activeFrameId
            ];
            angular.forEach(FrameService.frames, function (frame, id) {
                var slides = frame.slides || [];
                var slide = frame.slide;
                var state = (slide && slide.state) || [];
                parts.push([
                    id,
                    frame.label || '',
                    slides.indexOf(slide),
                    state.join('+'),
                    (frame.ordering.skillNumbers || []).length,
                    frame.ordering.includeAlbertVidal ? 1 : 0
                ].join(':'));
            });
            return parts.join('|');
        };

        // Per-frame runtime pointers: which slide is showing, which of its states
        // are revealed, and which slides have already been shown.
        service.serializeRuntime = function () {
            var runtime = {};
            angular.forEach(FrameService.frames, function (frame, id) {
                var slides = frame.slides || [];
                var index = slides.indexOf(frame.slide);
                runtime[id] = {
                    slideIndex: index,
                    slideLabel: index >= 0 ? slides[index].label : null,
                    state: (frame.slide && frame.slide.state) ? angular.copy(frame.slide.state) : [],
                    done: slides.map(function (slide) { return !!slide.done; })
                };
            });
            return runtime;
        };

        // Re-point each frame at the slide it was showing. Rebuilding the catalog
        // from the same results and ordering is deterministic, so the index holds;
        // the label is a cross-check for when it doesn't (a changed spreadsheet).
        service.restoreRuntime = function (runtime) {
            angular.forEach(FrameService.frames, function (frame, id) {
                var saved = runtime && runtime[id];
                var slides = frame.slides || [];
                if (!saved || !slides.length) return;

                angular.forEach(saved.done || [], function (done, i) {
                    if (done && slides[i]) slides[i].done = true;
                });

                var slide = null;
                var atIndex = saved.slideIndex >= 0 ? slides[saved.slideIndex] : null;
                if (atIndex && (!saved.slideLabel || atIndex.label === saved.slideLabel)) {
                    slide = atIndex;
                } else if (saved.slideLabel) {
                    angular.forEach(slides, function (candidate) {
                        if (!slide && candidate.label === saved.slideLabel) slide = candidate;
                    });
                }
                if (!slide) return;

                slide.state = angular.copy(saved.state || []);
                frame.slide = slide;
            });
        };

        return service;
    });

})();
