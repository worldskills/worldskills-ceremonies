const { screen: electronScreen } = require('electron');

function centerOnDisplay(display, width, height) {
    const wa = display.workArea;
    return {
        x: wa.x + Math.round((wa.width - width) / 2),
        y: wa.y + Math.round((wa.height - height) / 2)
    };
}

function displayIndexForPoint(x, y) {
    if (x == null || y == null) return null;
    const displays = electronScreen.getAllDisplays();
    for (let i = 0; i < displays.length; i++) {
        const b = displays[i].bounds;
        if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return i;
    }
    return null;
}

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
    const displays = electronScreen.getAllDisplays();
    const primaryId = electronScreen.getPrimaryDisplay().id;

    return displays.map((d, i) => {
        // Newer Electron releases expose the OS monitor name as Display.label.
        // Keep a descriptive fallback for the Electron version bundled by this app.
        const nativeName = typeof d.label === 'string' ? d.label.trim() : '';
        const name = nativeName || (d.internal
            ? 'Built-in display'
            : d.bounds.width + '\u00d7' + d.bounds.height);
        const primarySuffix = d.id === primaryId ? ' (Primary)' : '';

        return {
            id: d.id,
            name: name,
            label: 'Display ' + (i + 1) + ' \u2014 ' + name + primarySuffix,
            bounds: d.bounds,
            workArea: d.workArea,
            scaleFactor: d.scaleFactor,
        };
    });
}

module.exports = {
    centerOnDisplay,
    displayIndexForPoint,
    resolveTargetDisplay,
    listDisplays,
};
