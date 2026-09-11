(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('QueueScroll', function ($timeout) {
        function scrollToActiveInFrame(frameId) {
            $timeout(function () {
                var card = document.querySelector('[data-frame-id="' + frameId + '"]');
                var activeItem = card && card.querySelector('.list-group-item-primary');
                if (activeItem) {
                    activeItem.scrollIntoView({ block: 'nearest' });
                }
            }, 30);
        }

        function scrollQueueLookahead(queueLayout, opts) {
            $timeout(function () {
                var target;
                if (queueLayout === 'list' && opts.listIdx != null) {
                    var lookahead = Math.min(opts.listIdx + 2, opts.listLength - 1);
                    target = document.querySelector('[data-queue-idx="' + lookahead + '"]');
                } else if (queueLayout === 'grid' && opts.frameIdx != null && opts.frameId) {
                    var fItems = opts.frameItems || [];
                    var lookaheadF = Math.min(opts.frameIdx + 2, fItems.length - 1);
                    var card = document.querySelector('[data-frame-id="' + opts.frameId + '"]');
                    var items = card ? card.querySelectorAll('.list-group-item') : [];
                    target = items[lookaheadF];
                }
                if (target) {
                    target.scrollIntoView({ block: 'nearest' });
                }
            }, 30);
        }

        function scrollQueueListToIndex(idx) {
            $timeout(function () {
                var target = document.querySelector('[data-queue-idx="' + idx + '"]');
                if (target) {
                    target.scrollIntoView({ block: 'nearest' });
                }
            }, 30);
        }

        return {
            scrollToActiveInFrame: scrollToActiveInFrame,
            scrollQueueLookahead: scrollQueueLookahead,
            scrollQueueListToIndex: scrollQueueListToIndex,
        };
    });
})();
