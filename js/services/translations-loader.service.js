(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('TranslationsLoader', function ($q, $http) {
        var filePromise = null; // one IPC read shared by every language
        var skillsPromise = null; // one HTTP read shared by every language

        function readFile() {
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.readTranslations) {
                return $q.resolve({});
            }
            return $q.when(window.ceremonator.project.readTranslations()).then(function (result) {
                return (result && result.ok && result.languages) || {};
            }, function () {
                return {};
            });
        }

        // Skill names ship their own translations bundled in data/json/skills.json
        // (name.translations), independent of the project's translations.json
        // (which covers medal labels and any project-specific overrides). Builds
        // the same { lang_code: { English: translated } } shape so it merges
        // straight into the project table.
        function readSkillTranslations() {
            return $http.get('data/json/skills.json').then(function (response) {
                var skills = (response.data && response.data.skills) || [];
                var table = {};
                angular.forEach(skills, function (skill) {
                    var name = skill.name;
                    if (!name || !name.text || !name.translations) return;
                    // Translation IDs are the de-accented name (see
                    // ResultFormat.normalizeSkillName) since that's what
                    // context.skill.name actually holds at render time.
                    var key = name.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    angular.forEach(name.translations, function (text, lang) {
                        if (!table[lang]) table[lang] = {};
                        table[lang][key] = text;
                    });
                });
                return table;
            }, function () {
                return {};
            });
        }

        return function (options) {
            if (!filePromise) filePromise = readFile();
            if (!skillsPromise) skillsPromise = readSkillTranslations();
            return $q.all([skillsPromise, filePromise]).then(function (results) {
                // Merge point for future control-panel UI locale tables.
                // Project translations.json wins over the bundled skill defaults.
                return angular.extend({}, results[0][options.key], results[1][options.key]);
            });
        };
    });

})();
