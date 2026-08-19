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
    return electronScreen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: 'Display ' + (i + 1),
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
    }));
}

module.exports = {
    centerOnDisplay,
    displayIndexForPoint,
    resolveTargetDisplay,
    listDisplays,
};
