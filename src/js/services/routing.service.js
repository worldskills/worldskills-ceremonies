(function () {
    'use strict';

    // Which output feed each kind of slide — and each of its reveals — belongs to. The table is
    // the project's own `routing` block, already validated and defaulted by
    // src/main/project-contract.js, so nothing here assumes a feed id or that a project has
    // more than one feed. Set once per project load; read by Catalog while building slides.
    angular.module('ceremoniesApp').factory('Routing', function () {

        var EMPTY = { base: [], stateFeed: null, states: {}, content: {} };

        var table = {};

        function set(routing) {
            table = routing || {};
        }

        // Handed back to project.json on save so a hand-edited table is never dropped.
        function all() {
            return table;
        }

        function entry(kind) {
            return table[kind] || EMPTY;
        }

        // The feeds a slide of this kind shows on before any reveal is active.
        function base(kind) {
            return (entry(kind).base || []).slice();
        }

        // Reveal names come from the spreadsheet (medal names, member codes), so a kind routes
        // all of its reveals to one feed unless the project names an override.
        function stateMap(kind, names) {
            var routed = entry(kind);
            var map = {};
            (names || []).forEach(function (name) {
                var feed = (routed.states && routed.states[name]) || routed.stateFeed;
                if (feed) {
                    map[name] = feed;
                }
            });
            return map;
        }

        // Feeds that render their own template instead of the slide's, e.g. a sponsor wall
        // showing partners.html while the audience feed shows the medals.
        function content(kind, context) {
            var configured = entry(kind).content || {};
            var built = {};
            Object.keys(configured).forEach(function (feedId) {
                built[feedId] = { template: configured[feedId], context: context || {} };
            });
            return built;
        }

        return { set: set, all: all, base: base, stateMap: stateMap, content: content };
    });

})();
