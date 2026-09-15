(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('StorageKeys', function () {
        // Test mode is a workstation-wide toggle: every window reads it from this one key,
        // and its `storage` events are how already-open outputs hear the control panel flip it.
        var TEST_MODE_KEY = 'ceremonator:testMode';
        var DYNAMIC_STATE_KEY = 'ceremonator:dynamicState';

        function dynamicState() {
            try {
                var state = angular.fromJson(window.localStorage.getItem(DYNAMIC_STATE_KEY));
                return angular.isArray(state) ? state : [];
            } catch (_error) {
                return [];
            }
        }

        function testMode() {
            return window.localStorage.getItem(TEST_MODE_KEY) === '1';
        }

        function setTestMode(enabled) {
            window.localStorage.setItem(TEST_MODE_KEY, enabled ? '1' : '0');
        }

        // Every feed gets its own suffix, including the first: a screen window only knows the
        // feed id from its own URL, so it cannot know which feed the project calls primary.
        function screenKey(frameId, feedType) {
            return 'screen-' + frameId + (feedType ? '-' + feedType : '');
        }

        function previewKey(frameId, feedType) {
            return screenKey(frameId, feedType) + '-preview';
        }

        return {
            screenKey: screenKey,
            previewKey: previewKey,
            TEST_MODE_KEY: TEST_MODE_KEY,
            DYNAMIC_STATE_KEY: DYNAMIC_STATE_KEY,
            dynamicState: dynamicState,
            testMode: testMode,
            setTestMode: setTestMode,
        };
    });
})();
