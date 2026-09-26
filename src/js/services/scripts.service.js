(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('Scripts', function () {
        function lookup(items, property) {
            return (items || []).reduce(function (result, item) {
                result[String(item[property])] = item;
                return result;
            }, {});
        }

        function context(options) {
            options = options || {};
            var scripts = options.scripts || {};
            var languages = (options.languages || [])
                .map(function (language) {
                    return typeof language === 'string' ? language : language.lang_code;
                })
                .concat(angular.isArray(scripts.languages) ? scripts.languages : [])
                .filter(function (language, index, all) {
                    return (
                        typeof language === 'string' &&
                        language &&
                        language !== 'default' &&
                        all.indexOf(language) === index
                    );
                });
            return {
                languages: languages,
                translations: options.translations || {},
                scripts: scripts,
                skills: lookup(options.skills, 'number'),
                members: lookup(options.members, 'code'),
            };
        }

        function valueAt(values, path) {
            return path.split('.').reduce(function (value, key) {
                return value == null ? undefined : value[key];
            }, values);
        }

        function text(value) {
            if (value == null) return '';
            if (typeof value === 'object' && !angular.isArray(value)) return text(value.default);
            return String(value);
        }

        function present(value) {
            if (value && typeof value === 'object') {
                return Object.keys(value).some(function (key) {
                    return present(value[key]);
                });
            }
            return value !== undefined && value !== null && value !== '';
        }

        // Project scripts need substitutions and optional medal clauses, not a general template engine.
        function render(template, values) {
            return String(template || '')
                .replace(/\{\{#([a-zA-Z0-9_.-]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, function (_all, key, body) {
                    return present(valueAt(values, key)) ? body : '';
                })
                .replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, function (_all, key) {
                    return text(valueAt(values, key));
                });
        }

        function localizedName(primary, name, key, data) {
            var values = { default: primary ? String(primary) : '' };
            data.languages.forEach(function (language) {
                var table = data.translations[language] || {};
                var translated =
                    table[key] || table[primary] || (name && name.translations && name.translations[language]);
                values[language] = translated ? String(translated) : values.default;
            });
            return values;
        }

        function skillName(slide, data) {
            var simplified = slide.context && slide.context.skill;
            var skill = simplified && data.skills[String(simplified.number)];
            var primary = (skill && skill.name && skill.name.text) || (simplified && simplified.name) || '';
            return localizedName(primary, skill && skill.name, (simplified && simplified.name) || primary, data);
        }

        function memberName(result, data) {
            var member = data.members[String(result.memberCode)];
            var primary = result.member || (member && member.name && member.name.text) || '';
            return localizedName(primary, member && member.name, primary, data);
        }

        function podiumName(frameId, frame, data) {
            var label = (frame && frame.label) || frameId || '';
            var name = label.replace(/^Podium\s+/i, '');
            if (name !== label) name = name.toUpperCase();
            return localizedName(name, null, label, data);
        }

        function separator(name, language, data) {
            var configured = data.scripts.separators && data.scripts.separators[name];
            if (typeof configured === 'string') return configured;
            return (configured && (configured[language] || configured.default)) || ', ';
        }

        function localizedList(items, separatorName, data) {
            var values = {
                default: items
                    .map(function (item) {
                        return item.default;
                    })
                    .join(separator(separatorName, 'default', data)),
            };
            data.languages.forEach(function (language) {
                values[language] = items
                    .map(function (item) {
                        return item[language] || item.default;
                    })
                    .join(separator(separatorName, language, data));
            });
            return values;
        }

        function competitorNames(result, data) {
            var names = result.competitors || [];
            var values = { default: names.join(separator('competitors', 'default', data)) };
            data.languages.forEach(function (language) {
                values[language] = names.join(separator('competitors', language, data));
            });
            return values;
        }

        function medalText(medal, results, data) {
            var templates = data.scripts.medalLines && data.scripts.medalLines[medal];
            var values = { default: '' };
            if (!templates) return values;
            if (!results.length) {
                if (medal === 'bronze' || medal === 'silver') {
                    values.default = medal.charAt(0).toUpperCase() + medal.slice(1) + ' medal: is vacant\n';
                }
                return values;
            }

            ['default'].concat(data.languages).forEach(function (language) {
                var template = templates[language] || (language === 'default' ? templates.default : '');
                values[language] = results
                    .map(function (result) {
                        return render(template, {
                            competitors: competitorNames(result, data),
                            member: memberName(result, data),
                        });
                    })
                    .join('');
            });
            return values;
        }

        function forSlide(slide, data, frameId, frame) {
            var template = data.scripts.templates && data.scripts.templates[slide.kind];
            if (typeof template !== 'string') return '';

            var results = (slide.context && slide.context.results) || [];
            var skill = (slide.context && slide.context.skill) || {};
            var values = {
                skillNumber: String(skill.number || ''),
                skill: skillName(slide, data),
                podium: podiumName(frameId, frame, data),
            };

            if (slide.kind === 'callup') {
                values.members = localizedList(
                    results.map(function (result) {
                        return memberName(result, data);
                    }),
                    'members',
                    data
                );
            } else if (slide.kind === 'medals') {
                var byMedal = { bronze: [], silver: [], gold: [] };
                results.forEach(function (result) {
                    var medal = String(result.medal || '').toLowerCase();
                    if (byMedal[medal]) byMedal[medal].push(result);
                });
                Object.keys(byMedal).forEach(function (medal) {
                    values[medal] = medalText(medal, byMedal[medal], data);
                });
            }

            return render(template, values).trim();
        }

        function applySlides(slides, data, frameId, frame) {
            (slides || []).forEach(function (slide) {
                var script = forSlide(slide, data, frameId, frame);
                if (script) slide.script = script;
                else delete slide.script;
            });
        }

        function applyCatalog(catalog, options) {
            var data = context(options);
            Object.keys(catalog || {}).forEach(function (key) {
                applySlides(catalog[key], data);
            });
        }

        function applyFrames(frames, options) {
            var data = context(options);
            Object.keys(frames || {}).forEach(function (id) {
                applySlides(frames[id].slides, data, id, frames[id]);
            });
        }

        function hasScripts(frame) {
            return !!(
                frame &&
                (frame.slides || []).some(function (slide) {
                    return !!slide.script;
                })
            );
        }

        function exportText(frames, frameIds) {
            return (frameIds || [])
                .map(function (id) {
                    var frame = frames[id];
                    var slides =
                        frame &&
                        (frame.slides || []).filter(function (slide) {
                            return !!slide.script;
                        });
                    if (!slides || !slides.length) return '';
                    var heading = frame.label || id;
                    return (
                        heading +
                        '\n' +
                        Array(heading.length + 1).join('=') +
                        '\n\n' +
                        slides
                            .map(function (slide) {
                                return slide.script;
                            })
                            .join('\n\n')
                    );
                })
                .filter(Boolean)
                .join('\n\n\n');
        }

        function exportQueueText(items) {
            return (items || [])
                .filter(function (item) {
                    return !!(item && item.slide && item.slide.script);
                })
                .map(function (item) {
                    return item.slide.script;
                })
                .join('\n\n');
        }

        return {
            applyCatalog: applyCatalog,
            applyFrames: applyFrames,
            exportQueueText: exportQueueText,
            exportText: exportText,
            hasScripts: hasScripts,
        };
    });
})();
