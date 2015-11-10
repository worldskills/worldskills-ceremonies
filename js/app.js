(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['worldskills.utils']);

    var screens = {
        a: {label: 'Screen Left', slides: []},
        b: {label: 'Screen Right', slides: []}
    };

    ceremoniesApp.constant('SCREENS', screens);

    ceremoniesApp.constant('WORLDSKILLS_CLIENT_ID', '88625bde16aa');
    ceremoniesApp.constant('WORLDSKILLS_EVENT_ID', '10');
    ceremoniesApp.constant('WORLDSKILLS_API_EVENTS', 'https://api.worldskills.org/events');
    ceremoniesApp.constant('WORLDSKILLS_API_RESULTS', 'https://api.worldskills.org/results');
    ceremoniesApp.constant('WORLDSKILLS_API_AUTH', 'https://api.worldskills.org/auth');
    ceremoniesApp.constant('WORLDSKILLS_AUTHORIZE_URL', 'https://auth.worldskills.org/oauth/authorize');
    ceremoniesApp.constant('LOAD_CHILD_ENTITY_ROLES', true);
    ceremoniesApp.constant('FILTER_AUTH_ROLES', []);

})();
