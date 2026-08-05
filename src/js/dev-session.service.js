(function () {
    'use strict';

    // Dev-only: electron-reloader wipes ControlCtrl's in-memory state (imported rows, catalog,
    // frame pointers) on every reload/restart. This snapshots the raw inputs and per-frame
    // runtime pointers to disk and replays them after — the catalog itself is rebuilt, not stored.
    angular.module('ceremoniesApp').factory('DevSession', function ($timeout, FrameService) {

        var SAVE_DEBOUNCE_MS = 600;
        var dev = (window.ceremonator && window.ceremonator.dev) || {};

        var service = {
            enabled: !!dev.isDev,
            // Starts true: blocks the first digest (which fires before restore resolves) from overwriting the snapshot with empty state. ControlCtrl clears it once restore settles.
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

        // Cheap on purpose — recomputed every digest by ControlCtrl's watcher instead of a save call at each mutation site.
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

        // Index is normally reliable (catalog rebuild is deterministic); label is a cross-check for when it isn't (spreadsheet changed since save).
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
