(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameService', function (SCREENS) {

        var frameColors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

        var service = {
            frames: SCREENS,
            activeFrameId: Object.keys(SCREENS)[0]
        };

        // Pick the first palette color not already used by a frame, so colors
        // stay stable and never collide as frames are added/removed.
        function pickColor() {
            var used = {};
            angular.forEach(service.frames, function (f) { if (f && f.color) used[f.color] = true; });
            for (var i = 0; i < frameColors.length; i++) {
                if (!used[frameColors[i]]) return frameColors[i];
            }
            return frameColors[Object.keys(service.frames).length % frameColors.length];
        }

        // Ensure any pre-seeded frame (e.g. 'a') has a stable assigned color.
        angular.forEach(service.frames, function (frame) {
            if (frame && !frame.color) frame.color = pickColor();
        });

        service.getActiveFrame = function () {
            return service.frames[service.activeFrameId];
        };

        service.setActiveFrame = function (id) {
            if (service.frames[id]) {
                service.activeFrameId = id;
            }
        };

        service.getFrame = function (id) {
            return service.frames[id];
        };

        service.count = function () {
            return Object.keys(service.frames).length;
        };

        // Next unused single-letter frame id, or null once a-z are exhausted.
        service.nextFreeId = function () {
            var ids = Object.keys(service.frames);
            var letters = 'abcdefghijklmnopqrstuvwxyz';
            for (var i = 0; i < letters.length; i++) {
                if (ids.indexOf(letters[i]) < 0) return letters[i];
            }
            return null;
        };

        service.addFrame = function (id, label) {
            service.frames[id] = {
                id: id,
                label: label || ('Frame ' + id.toUpperCase()),
                slides: [],
                slide: undefined,
                size: { width: 1920, height: 1080 },
                position: { monitor: 0, x: null, y: null, fullscreen: false, kiosk: false },
                ordering: { mode: 'skills', skillNumbers: [], sourceFile: null },
                status: 'closed',
                color: pickColor()
            };
            return service.frames[id];
        };

        service.removeFrame = function (id) {
            if (id === 'a') return; // never remove the default frame
            delete service.frames[id];
            if (service.activeFrameId === id) {
                service.activeFrameId = Object.keys(service.frames)[0];
            }
        };

        service.getFrameColor = function (id) {
            var frame = service.frames[id];
            if (frame && frame.color) return frame.color;
            var ids = Object.keys(service.frames);
            var index = ids.indexOf(id);
            return frameColors[index % frameColors.length];
        };

        service.applyOrdering = function (frameId, importedSlides) {
            var frame = service.frames[frameId];
            if (!frame) return;
            frame.slides = importedSlides;
            frame.ordering.mode = 'imported';
        };

        service.resetOrdering = function (frameId) {
            var frame = service.frames[frameId];
            if (!frame) return;
            frame.ordering.mode = 'skills';
            frame.slides = [];
        };

        service.serializeForProject = function () {
            var result = [];
            angular.forEach(service.frames, function (frame, id) {
                result.push({
                    id: frame.id,
                    label: frame.label,
                    size: frame.size,
                    position: frame.position,
                    ordering: frame.ordering,
                    color: frame.color
                });
            });
            return result;
        };

        service.loadFromProject = function (frameConfigs) {
            angular.forEach(Object.keys(service.frames), function (id) {
                if (id !== 'a') delete service.frames[id];
            });
            angular.forEach(frameConfigs, function (config) {
                if (service.frames[config.id]) {
                    angular.extend(service.frames[config.id], {
                        label: config.label,
                        size: config.size,
                        position: config.position,
                        ordering: config.ordering,
                        color: config.color || service.frames[config.id].color
                    });
                } else {
                    service.frames[config.id] = angular.extend({
                        slides: [], slide: undefined, status: 'closed'
                    }, config);
                }
            });
            // Backfill colors for older projects saved without a color field.
            angular.forEach(service.frames, function (frame) {
                if (frame && !frame.color) frame.color = pickColor();
            });
            service.activeFrameId = Object.keys(service.frames)[0];
        };

        service.saveProject = function (projectName, displayMode, gridConfig, languages) {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.saveCurrent) {
                return Promise.resolve({ ok: false, error: 'Electron API unavailable' });
            }
            var project = {
                version: 2,
                name: projectName || 'Ceremony Project',
                displayMode: displayMode || 'windows',
                frames: service.serializeForProject(),
                gridConfig: gridConfig || null,
                languages: languages || []
            };
            return window.ceremonator.project.saveCurrent(project);
        };

        service.saveAsProject = function (projectName, displayMode, gridConfig, languages) {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.saveAs) {
                return Promise.resolve({ ok: false, error: 'Electron API unavailable' });
            }
            var project = {
                version: 2,
                name: projectName || 'Ceremony Project',
                displayMode: displayMode || 'windows',
                frames: service.serializeForProject(),
                gridConfig: gridConfig || null,
                languages: languages || []
            };
            return window.ceremonator.project.saveAs(project);
        };

        return service;
    });

})();
