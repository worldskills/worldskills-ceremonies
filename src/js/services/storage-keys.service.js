(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('StorageKeys', function () {
        function screenKey(frameId) {
            return 'screen-' + frameId;
        }

        function previewKey(frameId) {
            return 'screen-' + frameId + '-preview';
        }

        return {
            screenKey: screenKey,
            previewKey: previewKey
        };
    });

})();
