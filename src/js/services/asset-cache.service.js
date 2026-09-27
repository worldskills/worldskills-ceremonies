(function () {
    'use strict';

    // Keeps every flag, logo and background video an output can show alive for the life of the
    // window. A slide switch then never waits on a fetch, and a video never restarts its decode:
    // each URL owns one <video> that is only shown/hidden, never re-pointed or re-created.
    angular.module('ceremoniesApp').factory('AssetCache', function ($q) {
        var images = {};
        var videos = {};

        function image(url) {
            if (!images[url]) {
                var img = new Image();
                var promise = $q(function (resolve) {
                    var timer = window.setTimeout(failed, 15000);
                    function failed() {
                        window.clearTimeout(timer);
                        // Forget failures so the next preload retries the file.
                        if (images[url] && images[url].image === img) delete images[url];
                        resolve();
                    }
                    img.onerror = failed;
                    img.onload = function () {
                        window.clearTimeout(timer);
                        if (img.decode) $q.when(img.decode()).then(resolve, resolve);
                        else resolve();
                    };
                    img.src = url;
                });
                images[url] = { image: img, promise: promise };
            }
            return images[url].promise;
        }

        function video(url) {
            if (!videos[url]) {
                var el = document.createElement('video');
                el.className = 'screen-pooled-video';
                el.muted = true;
                el.loop = true;
                el.playsInline = true;
                el.preload = 'auto';
                el.src = url;
                // ScreenCtrl can create the pool while Angular is still linking <body>.
                window.setTimeout(function () {
                    document.body.insertBefore(el, document.body.firstChild);
                }, 0);
                videos[url] = el;
            }
            return videos[url];
        }

        // Videos are not awaited: a render must not stall on a multi-MB file.
        function preload(assets) {
            assets = assets || {};
            angular.forEach(assets.videos || [], video);
            return $q.all((assets.images || []).map(image));
        }

        function showVideo(url) {
            if (url) video(url);
            angular.forEach(videos, function (el, key) {
                var active = key === url;
                el.classList.toggle('is-active', active);
                if (active) {
                    var playing = el.play();
                    if (playing && playing.catch) playing.catch(angular.noop);
                } else if (!el.paused) {
                    el.pause();
                }
            });
        }

        function failed(url) {
            return !!(videos[url] && videos[url].__failed);
        }

        return { preload: preload, showVideo: showVideo, failed: failed };
    });
})();
