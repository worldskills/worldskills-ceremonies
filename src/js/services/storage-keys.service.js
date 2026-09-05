(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('StorageKeys', function () {
        function screenKey(frameId, feedType) {
            return 'screen-' + frameId + (feedType && feedType !== 'main' ? '-' + feedType : '');
        }

        function previewKey(frameId, feedType) {
            return screenKey(frameId, feedType) + '-preview';
        }

        return {
            screenKey: screenKey,
            previewKey: previewKey
        };
    });

})();
