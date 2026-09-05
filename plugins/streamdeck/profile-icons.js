'use strict';
// Editable vector symbols for profile navigation; labels remain native key titles.
const symbols = {
    Test: '<path d="M56 22h32M62 22v25L40 82q-5 9 7 9h50q12 0 7-9L82 47V22M51 67h42"/>',
    Prod: '<rect x="26" y="24" width="92" height="58" rx="5"/><path d="M52 95h40M72 82v13"/><path d="m62 39 26 15-26 15z" fill="white" stroke="none"/>',
    Frames: '<rect x="18" y="31" width="30" height="44" rx="4" stroke="#D51067"/><rect x="57" y="31" width="30" height="44" rx="4" stroke="#FEE300"/><rect x="96" y="31" width="30" height="44" rx="4" stroke="#0084AD"/>',
    Blank: '<rect x="28" y="22" width="88" height="65" rx="5"/><path d="m40 77 64-45"/>',
    Back: '<path d="m65 30-30 26 30 26M36 56h57q17 0 17 20v10"/>',
    Grid: '<rect x="22" y="20" width="100" height="62" rx="5"/><path d="M55 21v60M89 21v60M23 51h98M50 94h44M72 82v12"/>',
    Color: '<rect x="27" y="24" width="90" height="62" rx="6"/><path d="M50 97h44M72 86v11"/>'
};
const backgrounds = { Test: '#234841', Prod: '#442e64', Frames: '#172b46', Blank: '#3b2730', Back: '#263244', Grid: '#173e59' };
function profileIcon(name, color) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">' +
        '<rect width="144" height="144" rx="16" fill="' + (backgrounds[name] || '#182b43') + '"/>' +
        '<g fill="none" stroke="' + (color || '#ffffff') + '" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">' +
        (symbols[name] || symbols.Color) + '</g></svg>';
}
module.exports = { profileIcon };
