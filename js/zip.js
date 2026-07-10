// ZipBuilder — empacotador ZIP mínimo em vanilla JS (método STORE, sem compressão).
// Usado pela exportação de frames: PNGs já são comprimidos, então STORE não perde nada,
// e evita dependência externa (o app é intencionalmente zero-build/zero-deps em runtime).
// Formato: local file headers + central directory + EOCD (PKZIP APPNOTE 4.4.x).

const _CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function _crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = _CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

class ZipBuilder {
    constructor() {
        this.entries = [];
    }

    // name: string ASCII (ex: "frame_0001.png"); data: Uint8Array
    addFile(name, data) {
        this.entries.push({
            name: name,
            data: data,
            crc: _crc32(data)
        });
    }

    // Retorna um Blob application/zip com todas as entradas.
    build() {
        const encoder = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;

        // Data/hora fixas em formato DOS (conteúdo é determinístico; timestamp não importa aqui)
        const dosTime = 0;
        const dosDate = (1 << 5) | 1; // 1980-01-01

        for (const entry of this.entries) {
            const nameBytes = encoder.encode(entry.name);
            const header = new DataView(new ArrayBuffer(30));
            header.setUint32(0, 0x04034b50, true);        // local file header signature
            header.setUint16(4, 20, true);                // version needed
            header.setUint16(6, 0, true);                 // flags
            header.setUint16(8, 0, true);                 // method: STORE
            header.setUint16(10, dosTime, true);
            header.setUint16(12, dosDate, true);
            header.setUint32(14, entry.crc, true);
            header.setUint32(18, entry.data.length, true); // compressed size (= uncompressed em STORE)
            header.setUint32(22, entry.data.length, true); // uncompressed size
            header.setUint16(26, nameBytes.length, true);
            header.setUint16(28, 0, true);                // extra length

            chunks.push(new Uint8Array(header.buffer), nameBytes, entry.data);

            const cdir = new DataView(new ArrayBuffer(46));
            cdir.setUint32(0, 0x02014b50, true);          // central directory signature
            cdir.setUint16(4, 20, true);                  // version made by
            cdir.setUint16(6, 20, true);                  // version needed
            cdir.setUint16(8, 0, true);                   // flags
            cdir.setUint16(10, 0, true);                  // method
            cdir.setUint16(12, dosTime, true);
            cdir.setUint16(14, dosDate, true);
            cdir.setUint32(16, entry.crc, true);
            cdir.setUint32(20, entry.data.length, true);
            cdir.setUint32(24, entry.data.length, true);
            cdir.setUint16(28, nameBytes.length, true);
            // extra/comment/disk/attrs = 0
            cdir.setUint32(42, offset, true);             // offset do local header
            central.push(new Uint8Array(cdir.buffer), nameBytes);

            offset += 30 + nameBytes.length + entry.data.length;
        }

        let centralSize = 0;
        for (const c of central) centralSize += c.length;

        const eocd = new DataView(new ArrayBuffer(22));
        eocd.setUint32(0, 0x06054b50, true);              // EOCD signature
        eocd.setUint16(8, this.entries.length, true);     // entries neste disco
        eocd.setUint16(10, this.entries.length, true);    // entries total
        eocd.setUint32(12, centralSize, true);
        eocd.setUint32(16, offset, true);                 // offset do central directory
        // comment length = 0

        return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
    }
}
