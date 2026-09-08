(function () {
    'use strict';

    var token = new URLSearchParams(location.search).get('token');
    var base = '/operator-assets/' + encodeURIComponent(token) + '/';
    var documentBase = document.createElement('base');
    var css = document.createElement('link');
    var assetSerial = 0;

    function tell(type, category, error) {
        parent.postMessage({ type: type, category: category, error: error }, location.origin);
    }

    function safeSource(source) {
        try {
            return new URL(source, document.baseURI).pathname.replace(/^\/operator-assets\/[^/]+\//, '');
        } catch (error) {
            return 'unknown file';
        }
    }

    function recovered(event) {
        var target = event.target;
        if (target && target.operatorErrorKey) {
            tell('operator-feed-recovered', target.operatorErrorKey);
        }
    }

    function assetFailed(target) {
        if (!target.operatorErrorKey) {
            target.operatorErrorKey = 'asset-' + ++assetSerial;
        }

        var source = safeSource(target.currentSrc || target.src || '');
        var reason = 'could not load';
        if (target.tagName === 'VIDEO' && target.error) {
            reason =
                {
                    1: 'loading was aborted',
                    2: 'network loading failed',
                    3: 'could not be decoded',
                    4: 'format is unsupported or the file is unavailable',
                }[target.error.code] || reason;
        }

        tell(
            'operator-feed-error',
            target.operatorErrorKey,
            target.tagName.toLowerCase() + ' ' + source + ': ' + reason + '.'
        );
    }

    function scriptFailed(event) {
        // A session token in a script error would leak the asset route into the Operator's alerts.
        var message = String(event.message).replace(/\/operator-assets\/[^/]+\//g, '/operator-assets/[session]/');
        var where = safeSource(event.filename || '') + (event.lineno ? ':' + event.lineno : '');
        tell('operator-feed-error', 'script', 'Script error in ' + where + ': ' + message);
    }

    window.operatorFeed = { data: null, projectBase: base + 'project/' };

    documentBase.href = base + 'active/';
    document.head.appendChild(documentBase);

    css.rel = 'stylesheet';
    css.href = base + 'active/css/screen.css';
    css.onerror = function () {
        tell('operator-feed-error', 'stylesheet', 'Feed stylesheet could not load.');
    };
    css.onload = function () {
        tell('operator-feed-recovered', 'stylesheet');
    };
    document.head.appendChild(css);

    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin || event.source !== parent) {
            return;
        }
        if (!event.data || event.data.type !== 'operator-feed-state') {
            return;
        }
        if (window.operatorFeed.receive) {
            window.operatorFeed.receive(event.data.payload, event.data.languages, event.data.testMode);
        }
    });

    window.addEventListener('load', recovered, true);
    window.addEventListener('loadeddata', recovered, true);

    window.addEventListener(
        'error',
        function (event) {
            var target = event.target;
            if (target && /^(IMG|VIDEO|SCRIPT)$/.test(target.tagName)) {
                assetFailed(target);
            } else if (event.message) {
                scriptFailed(event);
            }
        },
        true
    );

    // Module constants are queued with unshift in AngularJS 1.5. Override in
    // configuration, after the desktop constants have all been registered.
    angular
        .module('ceremoniesApp')
        .config(function ($provide) {
            $provide.constant('TEMPLATE_BASE', base + 'active/');
            $provide.constant('DATA_BASE', base + 'project/data/');
        })
        .run(function ($rootScope) {
            $rootScope.$on('$includeContentError', function () {
                tell('operator-feed-error', 'template', 'The slide template could not load.');
            });
            $rootScope.$on('$includeContentLoaded', function () {
                tell('operator-feed-recovered', 'template');
            });
        });
})();
