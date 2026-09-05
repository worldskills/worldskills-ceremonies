'use strict';
// Assemble a portable folder; never depend on Ceremonator's node_modules after installation.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const name = 'org.worldskills.ceremonator.sdPlugin';
const source = path.join(__dirname, name);
const output = path.join(root, 'out', 'streamdeck', name);
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
const wsRoot = path.dirname(require.resolve('ws/package.json'));
fs.cpSync(wsRoot, path.join(output, 'node_modules', 'ws'), { recursive: true });
// Reuse the app's WorldSkills icon. Its ICNS contains the exact PNG sizes
// required by Stream Deck, so extracting them needs no platform image tools.
const icon = fs.readFileSync(path.join(root, 'images', 'worldskills-hand.icns'));
const iconNames = { ic08: 'plugin.png', ic09: 'plugin@2x.png' };
const extracted = new Set();
for (let offset = 8; offset < icon.length;) {
    const type = icon.toString('ascii', offset, offset + 4);
    const length = icon.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > icon.length) throw new Error('Invalid bundled ICNS icon.');
    if (iconNames[type]) {
        fs.writeFileSync(path.join(output, 'images', iconNames[type]), icon.subarray(offset + 8, offset + length));
        extracted.add(type);
    }
    offset += length;
}
if (extracted.size !== 2) throw new Error('The app icon must contain 256px and 512px PNG images.');
require('./build-profile').buildProfile(output);
console.log('Stream Deck plugin assembled: ' + output);
