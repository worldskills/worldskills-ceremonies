'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { archive } = require('./profile-archive');
const { profileIcon } = require('./profile-icons');
const { DEFAULTS, connectionSettings, commandFor } = require('./org.worldskills.ceremonator.sdPlugin/settings');
const { validCommand } = require('../../src/main/remote-commands');

// Stable IDs make repeated builds diffable. Only our new profile is generated;
// no installed Stream Deck profiles are read or written by this build.
function uuid(name) {
    const hex = createHash('sha256').update('ceremonator-plus/' + name).digest('hex');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}

function buildProfile(pluginOutput) {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'layout.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginOutput, 'manifest.json'), 'utf8'));
    connectionSettings(layout.connection);
    const profileId = uuid('profile').toUpperCase() + '.sdProfile';
    const entries = [];
    const pages = new Map();
    function page(name) {
        const result = { id: uuid('page/' + name), name, actions: {} };
        pages.set(name, result);
        return result;
    }
    const home = page('Home');
    const test = page('Test');
    const prod = page('Prod');
    const frames = page('Frames');
    const blank = page('Blank');

    function action(target, coordinate, type, title, settings, color, icon) {
        const native = type.startsWith('com.elgato.');
        const actionUUID = native ? type : manifest.UUID + '.' + type;
        const definition = manifest.Actions.find((a) => a.UUID === actionUUID);
        if (!native && !definition) throw new Error('Unknown action: ' + actionUUID);
        const config = native ? settings : { ...DEFAULTS, ...layout.connection, ...settings, keyTitle: title };
        if (!native && !validCommand(commandFor(actionUUID, config))) throw new Error('Invalid layout action: ' + title);
        const state = { Title: title, ShowTitle: true, TitleAlignment: 'bottom', FontSize: 12, TitleColor: '#ffffff' };
        if (color || icon) {
            const asset = 'Images/' + coordinate.replace(',', '-') + '.svg';
            const sourceIcon = type === 'previous' ? 'previous' : type === 'next' ? 'next' : type === 'blank' ? 'blank' : 'live';
            let svg = icon ? profileIcon(icon, color) : fs.readFileSync(path.join(__dirname, 'org.worldskills.ceremonator.sdPlugin/images', sourceIcon + '@2x.svg'), 'utf8');
            if (color && !icon) svg = svg.replace('</svg>', '<rect x="6" y="6" width="132" height="8" rx="4" fill="' + color + '"/></svg>');
            entries.push([profileId + '/Profiles/' + target.id.toUpperCase() + '/' + asset, svg]);
            state.Image = asset;
        }
        target.actions[coordinate] = {
            ActionID: uuid(target.name + '/' + coordinate), LinkedTitle: true,
            Name: native ? (type.includes('.page.') ? 'Pages' : type.endsWith('openchild') ? 'Create Folder' : 'Parent Folder') : definition.Name,
            Plugin: { Name: native ? (type.includes('.page.') ? 'Pages' : 'Folders') : manifest.Name,
                UUID: native ? (type.includes('.page.') ? 'com.elgato.streamdeck.page' : type) : manifest.UUID,
                Version: native ? '1.0' : manifest.Version },
            Resources: null, Settings: config, State: 0, States: [state], UUID: actionUUID
        };
    }
    const folder = (parent, coordinate, child, title, color) => action(parent, coordinate,
        'com.elgato.streamdeck.profile.openchild', title || child.name, { ProfileUUID: child.id }, color, title ? 'Color' : child.name);
    const back = (target, coordinate) => action(target, coordinate, 'com.elgato.streamdeck.profile.backtoparent', 'Back', {}, undefined, 'Back');

    [test, prod, frames, blank].forEach((child, column) => {
        // Native child folders force Back into 0,0 during import. Frames is the
        // second top-level page so its Prev Red key can remain at 0,0.
        if (child === frames) action(home, column + ',0', 'com.elgato.streamdeck.page.next', 'Frames', {}, undefined, 'Frames');
        else folder(home, column + ',0', child);
    });
    [test, prod].forEach((target) => {
        back(target, '0,0');
        layout.grids[target.name].forEach((grid, index) => {
            action(target, (index + 1) + ',0', 'grid', 'Show Grid view\n' + (grid.feedType === 'main' ? 'Main' : 'Secondary'), grid, undefined, 'Grid');
        });
    });
    action(frames, '3,0', 'com.elgato.streamdeck.page.previous', 'Back', {}, undefined, 'Back');
    back(blank, '0,0');
    layout.frames.forEach((frame, column) => {
        if (!/^#[0-9a-f]{6}$/i.test(frame.color)) throw new Error('Invalid frame color.');
        action(frames, column + ',0', 'previous', 'Prev\n' + frame.name, { frameId: frame.id }, frame.color);
        action(frames, column + ',1', 'next', 'Next\n' + frame.name, { frameId: frame.id }, frame.color);
        const controls = page('Blank / ' + frame.name);
        folder(blank, (column + 1) + ',0', controls, frame.name, frame.color);
        back(controls, '0,0');
        action(controls, '1,0', 'blank', 'Blank\nMain', { frameIds: frame.id, feedType: 'main' }, frame.color);
        action(controls, '2,0', 'blank', 'Blank\nSecondary', { frameIds: frame.id, feedType: 'secondary' }, frame.color);
        action(controls, '3,0', 'continue', 'Live', { frameId: frame.id }, frame.color);
    });
    entries.push([profileId + '/manifest.json', JSON.stringify({
        Device: { Model: '20GBD9901', UUID: '' }, Name: layout.name,
        // Default is a separate fallback page in ProfilesV3, not an alias for a
        // page in Pages. Omitting it avoids duplicate-page remapping on import.
        Pages: { Current: home.id, Pages: [home.id, frames.id] }, Version: '3.0'
    }, null, 2)]);
    pages.forEach((target) => {
        if (Object.keys(target.actions).some((key) => !/^[0-3],[01]$/.test(key))) throw new Error('Action outside Stream Deck+ keypad.');
        entries.push([profileId + '/Profiles/' + target.id.toUpperCase() + '/manifest.json', JSON.stringify({
            Controllers: [{ Type: 'Keypad', Actions: target.actions }, { Type: 'Encoder', Actions: {} }],
            Name: target.name, Icon: ''
        }, null, 2)]);
    });
    const bytes = archive(entries);
    const profilePath = path.join(path.dirname(pluginOutput), 'Ceremonator-Stream-Deck-Plus.streamDeckProfile');
    fs.writeFileSync(profilePath, bytes);
    fs.mkdirSync(path.join(pluginOutput, 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(pluginOutput, 'profiles/ceremonator-plus.streamDeckProfile'), bytes);
    console.log('Stream Deck+ layout assembled: ' + profilePath);
}
module.exports = { buildProfile };
