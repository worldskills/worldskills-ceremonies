'use strict';

let socket;
let context;
let action;
let settings;

// Mirrors DEFAULTS in settings.js; the inspector runs in a browser with no CommonJS.
const defaults = {
    url: 'http://127.0.0.1:17321',
    pin: '',
    keyTitle: '',
    frameId: '',
    frameIds: '',
    feedType: 'main',
    channel: 'live',
    columns: 2,
    width: 1280,
    height: 720,
    fullscreen: false,
};
const fields = Object.keys(defaults);

function field(id) {
    return document.getElementById(id);
}

function send(event, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }
    socket.send(JSON.stringify({ event, context, action, payload }));
}

function renderSettings() {
    fields.forEach((id) => {
        const element = field(id);
        if (id === 'fullscreen') {
            element.checked = settings[id] === true;
            return;
        }
        // Keep a saved frame selectable before the instance reports its frames.
        const missing =
            id === 'frameId' && settings[id] && !Array.from(element.options).some((o) => o.value === settings[id]);
        if (missing) {
            element.add(new Option(settings[id], settings[id]));
        }
        element.value = settings[id];
    });
}

function renderStatus(payload) {
    field('status').textContent = payload.status;

    const selected = field('frameId').value;
    const frames = payload.frames || [];
    field('frameId').replaceChildren(new Option('Select a frame…', ''));
    frames.forEach((frame) => {
        field('frameId').add(new Option(frame.label + ' (' + frame.id + ')', frame.id));
    });
    if (selected && !frames.some((frame) => frame.id === selected)) {
        field('frameId').add(new Option(selected + ' (unavailable)', selected));
    }
    field('frameId').value = selected;

    field('available').textContent = frames.length
        ? 'Frames: ' + frames.map((frame) => frame.id + ' — ' + frame.label).join(', ')
        : '';

    Array.from(field('feedType').options).forEach((option) => {
        option.disabled =
            payload.ready &&
            option.value !== 'all' &&
            !(payload.feedTypes || []).some((feed) => feed.id === option.value);
    });
}

window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfo) {
    const data = JSON.parse(actionInfo);
    context = uuid;
    action = data.action;
    settings = { ...defaults, ...data.payload.settings };
    const kind = action.split('.').pop();

    document.querySelectorAll('[data-kinds]').forEach((element) => {
        element.hidden = !element.dataset.kinds.split(' ').includes(kind);
        element.querySelectorAll('input,select').forEach((input) => {
            input.disabled = element.hidden;
        });
    });

    field('allFeeds').removeAttribute('selected');
    if (kind !== 'blank') {
        field('allFeeds').remove();
    }
    field('frameIds').required = kind === 'blank';
    // Allow Apply with no frame yet so the first connection can discover frames.
    renderSettings();

    socket = new WebSocket('ws://127.0.0.1:' + port);

    socket.onopen = () => {
        socket.send(JSON.stringify({ event: registerEvent, uuid }));
        send('sendToPlugin', { event: 'refresh' });
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.event === 'didReceiveSettings') {
            settings = { ...defaults, ...message.payload.settings };
            renderSettings();
        }
        if (message.event !== 'sendToPropertyInspector') {
            return;
        }
        renderStatus(message.payload);
    };

    socket.onclose = () => {
        field('status').textContent = 'Stream Deck disconnected. Reopen these settings.';
    };
};

field('settings').addEventListener('submit', (event) => {
    event.preventDefault();
    fields.forEach((id) => {
        settings[id] = id === 'fullscreen' ? field(id).checked : field(id).value;
    });
    send('setSettings', settings);
    field('status').textContent = 'Settings saved. Connecting…';
});
