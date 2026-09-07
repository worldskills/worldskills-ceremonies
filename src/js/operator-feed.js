(function () {
    'use strict';
    var token = new URLSearchParams(location.search).get('token');
    var base = '/operator-assets/' + encodeURIComponent(token) + '/';
    window.operatorFeed = { data: null, projectBase: base + 'project/' };
    var documentBase = document.createElement('base');
    documentBase.href = base + 'active/';
    document.head.appendChild(documentBase);
    // Module constants are queued with unshift in AngularJS 1.5. Override in
    // configuration, after the desktop constants have all been registered.
    angular.module('ceremoniesApp').config(function ($provide) {
        $provide.constant('TEMPLATE_BASE', base + 'active/');
        $provide.constant('DATA_BASE', base + 'project/data/');
    });
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = base + 'active/css/screen.css';
    css.onerror = function () { parent.postMessage({ type: 'operator-feed-error', category: 'stylesheet', error: 'Feed stylesheet could not load.' }, location.origin); };
    css.onload = function () { parent.postMessage({ type: 'operator-feed-recovered', category: 'stylesheet' }, location.origin); };
    document.head.appendChild(css);
    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin || event.source !== parent || !event.data || event.data.type !== 'operator-feed-state') return;
        if (window.operatorFeed.receive) window.operatorFeed.receive(event.data.payload, event.data.languages, event.data.testMode);
    });
    var assetSerial = 0;
    function safeSource(source) {
        try { return new URL(source, document.baseURI).pathname.replace(/^\/operator-assets\/[^/]+\//, ''); }
        catch (error) { return 'unknown file'; }
    }
    function recovered(event) {
        var target = event.target;
        if (target && target.operatorErrorKey) {
            parent.postMessage({ type: 'operator-feed-recovered', category: target.operatorErrorKey }, location.origin);
        }
    }
    window.addEventListener('load', recovered, true);
    window.addEventListener('loadeddata', recovered, true);
    window.addEventListener('error', function (event) {
        var target = event.target;
        if (target && /^(IMG|VIDEO|SCRIPT)$/.test(target.tagName)) {
            if (!target.operatorErrorKey) target.operatorErrorKey = 'asset-' + (++assetSerial);
            var source = safeSource(target.currentSrc || target.src || '');
            var reason = 'could not load';
            if (target.tagName === 'VIDEO' && target.error) {
                reason = ({ 1: 'loading was aborted', 2: 'network loading failed',
                    3: 'could not be decoded', 4: 'format is unsupported or the file is unavailable' })[target.error.code] || reason;
            }
            parent.postMessage({ type: 'operator-feed-error', category: target.operatorErrorKey,
                error: target.tagName.toLowerCase() + ' ' + source + ': ' + reason + '.' }, location.origin);
        } else if (event.message) {
            parent.postMessage({ type: 'operator-feed-error', category: 'script',
                error: 'Script error in ' + safeSource(event.filename || '') + (event.lineno ? ':' + event.lineno : '') + ': ' +
                    String(event.message).replace(/\/operator-assets\/[^/]+\//g, '/operator-assets/[session]/') }, location.origin);
        }
    }, true);
    angular.module('ceremoniesApp').run(function ($rootScope) {
        $rootScope.$on('$includeContentError', function () {
            parent.postMessage({ type: 'operator-feed-error', category: 'template', error: 'The slide template could not load.' }, location.origin);
        });
        $rootScope.$on('$includeContentLoaded', function () {
            parent.postMessage({ type: 'operator-feed-recovered', category: 'template' }, location.origin);
        });
    });
})();
