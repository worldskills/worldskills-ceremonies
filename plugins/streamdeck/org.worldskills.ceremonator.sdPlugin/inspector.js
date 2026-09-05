'use strict';
let socket;
let context;
let action;
let settings;
const defaults = { url: 'http://127.0.0.1:17321', pin: '', keyTitle: '', frameId: '', frameIds: '', feedType: 'main',
    channel: 'live', columns: 2, width: 1280, height: 720, fullscreen: false };
const fields = Object.keys(defaults);
const field = (id) => document.getElementById(id);
function send(event, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, context, action, payload }));
}
function renderSettings() {
    fields.forEach((id) => {
        if (id === 'fullscreen') field(id).checked = settings[id] === true;
        else {
            if (id === 'frameId' && settings[id] && !Array.from(field(id).options).some((o) => o.value === settings[id])) {
                field(id).add(new Option(settings[id], settings[id]));
            }
            field(id).value = settings[id];
        }
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
        element.querySelectorAll('input,select').forEach((input) => { input.disabled = element.hidden; });
    });
    field('allFeeds').removeAttribute('selected');
    if (kind !== 'blank') field('allFeeds').remove();
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
        if (message.event !== 'sendToPropertyInspector') return;
        const data = message.payload;
        field('status').textContent = data.status;
        const selected = field('frameId').value;
        const frames = data.frames || [];
        field('frameId').replaceChildren(new Option('Select a frame…', ''));
        frames.forEach((frame) => field('frameId').add(new Option(frame.label + ' (' + frame.id + ')', frame.id)));
        if (selected && !frames.some((frame) => frame.id === selected)) field('frameId').add(new Option(selected + ' (unavailable)', selected));
        field('frameId').value = selected;
        field('available').textContent = frames.length ? 'Frames: ' + frames.map((frame) => frame.id + ' — ' + frame.label).join(', ') : '';
        Array.from(field('feedType').options).forEach((option) => {
            option.disabled = data.ready && option.value !== 'all' && !(data.feedTypes || []).some((feed) => feed.id === option.value);
        });
    };
    socket.onclose = () => { field('status').textContent = 'Stream Deck disconnected. Reopen these settings.'; };
};
field('settings').addEventListener('submit', (event) => {
    event.preventDefault();
    fields.forEach((id) => { settings[id] = id === 'fullscreen' ? field(id).checked : field(id).value; });
    send('setSettings', settings);
    field('status').textContent = 'Settings saved. Connecting…';
});
