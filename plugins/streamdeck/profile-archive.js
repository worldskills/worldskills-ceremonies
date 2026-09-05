'use strict';
// A small, dependency-free ZIP writer for the generated JSON/SVG profile assets.
// Stored entries keep the layout portable on Windows and macOS without a zip executable.
function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function archive(entries) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const [name, contents] of entries) {
        const filename = Buffer.from(name);
        const data = Buffer.from(contents);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x800, 6); // UTF-8 filenames
        header.writeUInt16LE(33, 12); // 1980-01-01; deterministic builds
        header.writeUInt32LE(crc32(data), 14);
        header.writeUInt32LE(data.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(filename.length, 26);
        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50, 0);
        directory.writeUInt16LE(20, 4);
        header.copy(directory, 6, 4, 30);
        directory.writeUInt32LE(offset, 42);
        local.push(header, filename, data);
        central.push(directory, filename);
        offset += header.length + filename.length + data.length;
    }
    const index = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(index.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, index, end]);
}
module.exports = { archive };
