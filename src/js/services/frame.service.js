(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('FrameService', function (SCREENS, FRAMES_WINDOW_STATUS, ResultFormat) {

        var frameColors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

        var service = {
            frames: SCREENS,
            activeFrameId: Object.keys(SCREENS)[0],
            skillOrder: []
        };

        function skillNumberValue(number) {
            var parsed = parseFloat(number);
            return isNaN(parsed) ? null : parsed;
        }

        function pickColor() {
            var used = {};
            angular.forEach(service.frames, function (f) { if (f && f.color) used[f.color] = true; });
            for (var i = 0; i < frameColors.length; i++) {
                if (!used[frameColors[i]]) return frameColors[i];
            }
            return frameColors[Object.keys(service.frames).length % frameColors.length];
        }

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
                previewSlide: undefined,
                size: { width: 1920, height: 1080 },
                position: { monitor: 0, x: null, y: null, fullscreen: false },
                ordering: { mode: 'skills', skillNumbers: [], sourceFile: null },
                status: FRAMES_WINDOW_STATUS.CLOSED,
                windows: { live: 0, preview: 0 },
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

        service.compareSkillNumbers = function (a, b) {
            var rankA = service.skillOrder.indexOf(ResultFormat.normalizeSkillNum(a));
            var rankB = service.skillOrder.indexOf(ResultFormat.normalizeSkillNum(b));
            if (rankA >= 0 && rankB >= 0) return rankA - rankB;
            if (rankA >= 0) return -1;
            if (rankB >= 0) return 1;

            var valueA = skillNumberValue(a);
            var valueB = skillNumberValue(b);
            if (valueA !== null && valueB !== null && valueA !== valueB) return valueA - valueB;
            return String(a).localeCompare(String(b));
        };

        service.sortSkillNumbers = function (numbers) {
            return (numbers || []).slice().sort(service.compareSkillNumbers);
        };

        service.sortSkills = function (skills) {
            return (skills || []).slice().sort(function (a, b) {
                return service.compareSkillNumbers(a && a.number, b && b.number);
            });
        };

        service.setSkillOrder = function (skillNumbers) {
            service.skillOrder = (skillNumbers || []).map(ResultFormat.normalizeSkillNum);
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
                    color: frame.color,
                    video: frame.video
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
                        color: config.color || service.frames[config.id].color,
                        video: config.video
                    });
                } else {
                    service.frames[config.id] = angular.extend({
                        slides: [], slide: undefined, previewSlide: undefined, status: FRAMES_WINDOW_STATUS.CLOSED,
                        windows: { live: 0, preview: 0 }
                    }, config);
                }
            });
            // Backfill colors for projects saved before the color field existed.
            angular.forEach(service.frames, function (frame) {
                if (frame && !frame.color) frame.color = pickColor();
            });
            service.activeFrameId = Object.keys(service.frames)[0];
        };

        service.saveProject = function (projectName, displayMode, gridConfig, languages, bestOfNationGroupSize) {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.saveCurrent) {
                return Promise.resolve({ ok: false, error: 'Electron API unavailable' });
            }
            var project = {
                version: 2,
                name: projectName || 'Ceremony Project',
                displayMode: displayMode || 'windows',
                frames: service.serializeForProject(),
                skillOrder: service.skillOrder || [],
                gridConfig: gridConfig || null,
                languages: languages || [],
                bestOfNationGroupSize: bestOfNationGroupSize || 5
            };
            return window.ceremonator.project.saveCurrent(project);
        };

        return service;
    });

})();
