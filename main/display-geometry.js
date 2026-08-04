const { screen: electronScreen } = require('electron');

function clampToWorkArea(x, y, width, height) {
    const displays = electronScreen.getAllDisplays();
    let display = displays.find(d =>
        x >= d.bounds.x && x < d.bounds.x + d.bounds.width &&
        y >= d.bounds.y && y < d.bounds.y + d.bounds.height
    ) || electronScreen.getPrimaryDisplay();

    return clampToDisplayWorkArea(display, x, y, width, height);
}

// Clamp a window to a specific display's work area, centering it when no
// explicit x/y is supplied.
function clampToDisplayWorkArea(display, x, y, width, height) {
    const wa = display.workArea;
    const w = Math.min(width, wa.width);
    const h = Math.min(height, wa.height);
    const defaultX = wa.x + Math.round((wa.width - w) / 2);
    const defaultY = wa.y + Math.round((wa.height - h) / 2);
    const cx = Math.max(wa.x, Math.min(x != null ? x : defaultX, wa.x + wa.width - w));
    const cy = Math.max(wa.y, Math.min(y != null ? y : defaultY, wa.y + wa.height - h));
    return { x: cx, y: cy, width: w, height: h };
}

// Index (into getAllDisplays) of the display containing a screen point,
// or null when the point isn't on any display.
function displayIndexForPoint(x, y) {
    if (x == null || y == null) return null;
    const displays = electronScreen.getAllDisplays();
    for (let i = 0; i < displays.length; i++) {
        const b = displays[i].bounds;
        if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return i;
    }
    return null;
}

// Resolve which display a frame should open on from its stored monitor index.
// Falls back to the primary display (and flags it) when the index is invalid.
function resolveTargetDisplay(position) {
    const displays = electronScreen.getAllDisplays();
    const monitor = position && typeof position.monitor === 'number' ? position.monitor : 0;
    if (monitor >= 0 && displays[monitor]) {
        return { display: displays[monitor], fellBack: false };
    }
    return {
        display: electronScreen.getPrimaryDisplay(),
        fellBack: true,
        requested: monitor,
        available: displays.length
    };
}

function listDisplays() {
    return electronScreen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: 'Display ' + (i + 1),
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
    }));
}

module.exports = {
    clampToWorkArea,
    clampToDisplayWorkArea,
    displayIndexForPoint,
    resolveTargetDisplay,
    listDisplays,
};
