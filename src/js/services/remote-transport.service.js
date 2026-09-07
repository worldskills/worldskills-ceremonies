(function () {
    'use strict';

    // The one WebSocket link the browser pages (Remote tablet, Operator) hold to the control
    // window: PIN auth, PIN storage, and reconnect with backoff. Callers own their own UI copy
    // and message routing; they hear about the link over `remote:*` scope events.
    angular.module('ceremoniesControlWorkspace').factory('RemoteTransport', function ($rootScope, $timeout) {
        var PIN_KEY = 'ceremonator:remotePin';
        // Codes the server closes with when the PIN itself is the problem. Never retried —
        // reconnecting on a bad or blocked PIN just burns the attempt limit.
        var REFUSED = [4001, 4003, 4008];

        var socket = null;
        var retry = null;
        var pin = '';
        var clientType = 'remote';
        var attempts = 0;
        var authenticated = false;
        var wasAuthenticated = false;

        // Socket callbacks run outside the digest, so the $evalAsync both schedules one and
        // orders the broadcast behind whatever the caller is already doing.
        function emit(name, data) {
            $rootScope.$evalAsync(function () {
                $rootScope.$broadcast('remote:' + name, data);
            });
        }

        function loadPin() {
            try {
                return window.localStorage.getItem(PIN_KEY) || '';
            } catch (error) {
                return '';
            }
        }

        function savePin() {
            try {
                window.localStorage.setItem(PIN_KEY, pin);
                return true;
            } catch (error) {
                return false;
            }
        }

        function forgetPin() {
            try {
                window.localStorage.removeItem(PIN_KEY);
                return true;
            } catch (error) {
                return false;
            }
        }

        function socketUrl() {
            var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return protocol + '//' + window.location.host + '/ws';
        }

        function open() {
            var connection = new WebSocket(socketUrl());

            retry = null;
            authenticated = false;
            socket = connection;

            connection.onopen = function () {
                // A socket replaced while this one was dialing must not authenticate.
                if (socket !== connection) {
                    return;
                }
                connection.send(JSON.stringify({ type: 'auth', pin: pin, client: clientType }));
            };

            connection.onmessage = function (event) {
                var message;
                if (socket !== connection) {
                    return;
                }

                try {
                    message = JSON.parse(event.data);
                } catch (error) {
                    emit('invalid-message');
                    return;
                }

                if (message.type === 'auth-ok') {
                    authenticated = true;
                    wasAuthenticated = true;
                    attempts = 0;
                    emit('authenticated', message);
                } else if (message.type === 'state') {
                    emit('state', message);
                } else {
                    emit('message', message);
                }
            };

            connection.onerror = function () {
                // onclose carries the outcome.
            };

            connection.onclose = function (event) {
                if (socket !== connection) {
                    return;
                }

                socket = null;
                authenticated = false;

                if (REFUSED.indexOf(event.code) >= 0) {
                    wasAuthenticated = false;
                    emit('refused', event.code);
                    return;
                }

                emit(wasAuthenticated ? 'reconnecting' : 'connection-failed', event.code);
                retry = $timeout(open, Math.min(15000, 1000 * Math.pow(2, attempts++)) + Math.random() * 500);
            };
        }

        function drop() {
            if (retry) {
                $timeout.cancel(retry);
                retry = null;
            }
            if (socket) {
                var previous = socket;
                // Cleared first so the old socket's onclose reports nothing.
                socket = null;
                previous.close();
            }
        }

        // Dial again now, keeping the auth history and the backoff counter — for a caller
        // that has decided the link is stale.
        function reconnect() {
            drop();
            open();
        }

        function connect(nextPin, client) {
            pin = String(nextPin || '').trim();
            clientType = client === 'operator' ? 'operator' : 'remote';
            wasAuthenticated = false;
            attempts = 0;
            reconnect();
        }

        function close() {
            drop();
            authenticated = false;
            wasAuthenticated = false;
        }

        // Pre-serialized payloads are accepted so a caller can size-check its own message.
        function sendRaw(payload) {
            if (!authenticated || !socket || socket.readyState !== WebSocket.OPEN) {
                return false;
            }
            try {
                socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
            } catch (error) {
                return false;
            }
            return true;
        }

        function send(action) {
            return sendRaw({ type: 'action', action: action });
        }

        return {
            connect: connect,
            reconnect: reconnect,
            close: close,
            send: send,
            sendRaw: sendRaw,
            loadPin: loadPin,
            savePin: savePin,
            forgetPin: forgetPin
        };
    });

})();
