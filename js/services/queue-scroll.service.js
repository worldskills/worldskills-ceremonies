(function () {
    'use strict';

    angular.module('ceremoniesApp').factory('QueueScroll', function ($timeout) {

        function scrollToActiveInFrame(frameId) {
            $timeout(function () {
                var card = document.querySelector('[data-frame-id="' + frameId + '"]');
                if (!card) return;
                var cardBody = card.querySelector('.queue-frame-card-body');
                if (!cardBody) return;
                var activeItem = cardBody.querySelector('.list-group-item-primary');
                if (!activeItem) return;
                var bodyRect = cardBody.getBoundingClientRect();
                var itemRect = activeItem.getBoundingClientRect();
                if (itemRect.bottom > bodyRect.bottom) {
                    cardBody.scrollTop += (itemRect.bottom - bodyRect.bottom) + 8;
                } else if (itemRect.top < bodyRect.top) {
                    cardBody.scrollTop -= (bodyRect.top - itemRect.top) + 8;
                }
            }, 30);
        }

        // After showing a queue-list item, scroll its container so the next
        // couple of upcoming items stay in view (list layout: flat queue-panel
        // list; grid layout: the per-frame card body).
        function scrollQueueLookahead(queueLayout, opts) {
            $timeout(function () {
                if (queueLayout === 'list' && opts.listIdx != null) {
                    var lookahead = Math.min(opts.listIdx + 2, opts.listLength - 1);
                    var target = document.querySelector('[data-queue-idx="' + lookahead + '"]');
                    if (target) {
                        var container = document.querySelector('.queue-panel .slide-list-area');
                        if (container) {
                            var cBottom = container.getBoundingClientRect().bottom;
                            var tBottom = target.getBoundingClientRect().bottom;
                            if (tBottom > cBottom) {
                                container.scrollTop += (tBottom - cBottom) + 8;
                            }
                        }
                    }
                } else if (queueLayout === 'grid' && opts.frameIdx != null && opts.frameId) {
                    var fItems = opts.frameItems || [];
                    var lookaheadF = Math.min(opts.frameIdx + 2, fItems.length - 1);
                    var card = document.querySelector('[data-frame-id="' + opts.frameId + '"]');
                    var cardBody = card ? card.querySelector('.queue-frame-card-body') : null;
                    if (cardBody) {
                        var items = cardBody.querySelectorAll('.list-group-item');
                        var tEl = items[lookaheadF];
                        if (tEl) {
                            var cbBottom = cardBody.getBoundingClientRect().bottom;
                            var tElBottom = tEl.getBoundingClientRect().bottom;
                            if (tElBottom > cbBottom) {
                                cardBody.scrollTop += (tElBottom - cbBottom) + 8;
                            }
                        }
                    }
                }
            }, 30);
        }

        // Scroll the flat queue-panel list so idx is comfortably in view.
        function scrollQueueListToIndex(idx) {
            $timeout(function () {
                var target = document.querySelector('[data-queue-idx="' + idx + '"]');
                var container = document.querySelector('.queue-panel .slide-list-area');
                if (target && container) {
                    var cRect = container.getBoundingClientRect();
                    var tRect = target.getBoundingClientRect();
                    if (tRect.bottom > cRect.bottom) container.scrollTop += (tRect.bottom - cRect.bottom) + 8;
                    else if (tRect.top < cRect.top) container.scrollTop -= (cRect.top - tRect.top) + 8;
                }
            }, 30);
        }

        return {
            scrollToActiveInFrame: scrollToActiveInFrame,
            scrollQueueLookahead: scrollQueueLookahead,
            scrollQueueListToIndex: scrollQueueListToIndex
        };
    });

})();
