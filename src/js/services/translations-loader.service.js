(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('TranslationsLoader', function ($q, $http, DATA_BASE) {
        var filePromise = null; // one IPC read shared by every language
        var dataPromise = null; // one HTTP read (skills.json + members.json) shared by every language

        function report(message) {
            var where = window.location.search || window.location.pathname;
            var text = 'Translations (' + where + '): ' + message;
            console.warn(text);

            if (window.ceremonator && window.ceremonator.app && window.ceremonator.app.reportDebug) {
                window.ceremonator.app.reportDebug('load-failure', text);
                return;
            }

            if (window.parent !== window) {
                window.parent.postMessage({ type: 'grid-cell-debug', debugType: 'load-failure', message: text }, '*');
            }
        }

        function readFile() {
            if (window.operatorFeed) {
                return $http.get(window.operatorFeed.projectBase + 'translations.json').then(
                    function (response) {
                        return response.data.languages || {};
                    },
                    function (response) {
                        report('translations.json over the asset route returned ' + (response && response.status));
                        return {};
                    }
                );
            }
            if (!window.ceremonator || !window.ceremonator.project || !window.ceremonator.project.readTranslations) {
                report('window.ceremonator.project.readTranslations is not exposed in this frame');
                return $q.resolve({});
            }
            return $q.when(window.ceremonator.project.readTranslations()).then(
                function (result) {
                    var ok = result && result.ok;
                    if (!ok) {
                        report('project:readTranslations returned ' + angular.toJson(result));
                    }
                    return (ok && result.languages) || {};
                },
                function (error) {
                    report('project:readTranslations failed: ' + (error && error.message));
                    return {};
                }
            );
        }

        function addToTable(table, name, key) {
            if (!name || !name.text || !name.translations || !key) {
                return;
            }
            angular.forEach(name.translations, function (text, lang) {
                if (!table[lang]) {
                    table[lang] = {};
                }
                table[lang][key] = text;
            });
        }

        function readDataTranslations() {
            var skillsLoaded = $http.get(DATA_BASE + 'skills.json').then(
                function (response) {
                    return angular.isArray(response.data) ? response.data : [];
                },
                function (response) {
                    report(DATA_BASE + 'skills.json returned ' + (response && response.status));
                    return [];
                }
            );

            var membersLoaded = $http.get(DATA_BASE + 'members.json').then(
                function (response) {
                    return angular.isArray(response.data) ? response.data : [];
                },
                function (response) {
                    report(DATA_BASE + 'members.json returned ' + (response && response.status));
                    return [];
                }
            );

            return $q.all([skillsLoaded, membersLoaded]).then(function (results) {
                var table = {};
                angular.forEach(results[0], function (skill) {
                    var name = skill.name;
                    // Key must match the de-accented name ResultFormat.normalizeSkillName produces (what context.skill.name holds at render time) or the lookup misses silently.
                    var key = name && name.text && name.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    addToTable(table, name, key);
                });
                angular.forEach(results[1], function (member) {
                    var name = member.name;
                    // Key is verbatim (not de-accented) — it must match result.member, the results spreadsheet's "Member Name" column, which is never de-accented.
                    addToTable(table, name, name && name.text);
                });
                return table;
            });
        }

        return function (options) {
            if (!filePromise) {
                filePromise = readFile();
            }
            if (!dataPromise) {
                dataPromise = readDataTranslations();
            }
            return $q.all([dataPromise, filePromise]).then(function (results) {
                // results[1] (project translations.json) wins over results[0] (skill/member defaults) — argument order matters here.
                return angular.extend({}, results[0][options.key], results[1][options.key]);
            });
        };
    });
})();
