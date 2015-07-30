(function () {
    'use strict';

    var ceremoniesApp = angular.module('ceremoniesApp', ['worldskills.utils']);

    var screens = {
        a: 'Screen A',
        b: 'Screen B'
    };

    ceremoniesApp.constant('SCREENS', screens);

    ceremoniesApp.constant('WORLDSKILLS_CLIENT_ID', '88625bde16aa');
    ceremoniesApp.constant('WORLDSKILLS_EVENT_ID', '7');
    ceremoniesApp.constant('WORLDSKILLS_API_EVENTS', 'http://localhost:8080/events');
    ceremoniesApp.constant('WORLDSKILLS_API_RESULTS', 'http://localhost:8080/results');
    ceremoniesApp.constant('WORLDSKILLS_API_AUTH', 'http://localhost:8080/auth');
    ceremoniesApp.constant('WORLDSKILLS_AUTHORIZE_URL', 'http://worldskills-auth.dev/oauth/authorize');
    ceremoniesApp.constant('WORLDSKILLS_API_EVENTS', 'https://api.worldskills.org/events');
    ceremoniesApp.constant('WORLDSKILLS_API_RESULTS', 'https://api.worldskills.org/results');
    ceremoniesApp.constant('WORLDSKILLS_API_AUTH', 'https://api.worldskills.org/auth');
    ceremoniesApp.constant('WORLDSKILLS_AUTHORIZE_URL', 'https://auth.worldskills.org/oauth/authorize');

})();
