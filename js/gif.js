// GifEncoder — GIF89a animado em vanilla JS (paleta global por median-cut + LZW).
// Sem dependências: o app é zero-build. Pensado para clipes curtos (o GIF não comprime bem
// vídeo longo); a exportação limita resolução/fps antes de chegar aqui.

class GifEncoder {
    constructor(width, height, palette, options) {
        this.width = width;
        this.height = height;
        this.palette = palette;              // Uint8Array(256*3)
        this.loop = (options && options.loop != null) ? options.loop : 0;
        this._chunks = [];
        this._nearestCache = new Int16Array(32768).fill(-1);
        this._writeHeader();
    }

    // Constrói uma paleta de até 256 cores a partir de amostras RGBA (array de Uint8ClampedArray)
    static buildPalette(samples, maxColors) {
        const max = maxColors || 256;
        let count = 0;
        for (const s of samples) count += s.length / 4;
        const step = Math.max(1, Math.floor(count / 120000));
        const px = [];
        let k = 0;
        for (const s of samples) {
            for (let i = 0; i < s.length; i += 4) {
                if ((k++ % step) === 0) px.push((s[i] << 16) | (s[i + 1] << 8) | s[i + 2]);
            }
        }
        const boxes = [px];
        while (boxes.length < max) {
            // Divide a caixa com maior variação no canal de maior amplitude
            let bestIdx = -1, bestRange = -1, bestChannel = 0;
            boxes.forEach((box, idx) => {
                if (box.length < 2) return;
                for (let ch = 0; ch < 3; ch++) {
                    const shift = 16 - ch * 8;
                    let mn = 255, mx = 0;
                    for (const c of box) {
                        const v = (c >> shift) & 255;
                        if (v < mn) mn = v;
                        if (v > mx) mx = v;
                    }
                    const range = (mx - mn) * Math.sqrt(box.length);
                    if (range > bestRange) { bestRange = range; bestIdx = idx; bestChannel = ch; }
                }
            });
            if (bestIdx < 0 || bestRange <= 0) break;
            const box = boxes[bestIdx];
            const shift = 16 - bestChannel * 8;
            box.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
            const mid = box.length >> 1;
            boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
        }
        const palette = new Uint8Array(256 * 3);
        boxes.forEach((box, i) => {
            let r = 0, g = 0, b = 0;
            for (const c of box) { r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255; }
            const n = Math.max(1, box.length);
            palette[i * 3] = Math.round(r / n);
            palette[i * 3 + 1] = Math.round(g / n);
            palette[i * 3 + 2] = Math.round(b / n);
        });
        palette._size = Math.max(1, boxes.length);
        return palette;
    }

    _nearest(r, g, b) {
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const cached = this._nearestCache[key];
        if (cached >= 0) return cached;
        const p = this.palette;
        const n = p._size || 256;
        let best = 0, bestD = Infinity;
        for (let i = 0; i < n; i++) {
            const dr = p[i * 3] - r, dg = p[i * 3 + 1] - g, db = p[i * 3 + 2] - b;
            const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
            if (d < bestD) { bestD = d; best = i; }
        }
        this._nearestCache[key] = best;
        return best;
    }

    _bytes(arr) { this._chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr)); }
    _u16(v) { return [v & 255, (v >> 8) & 255]; }

    _writeHeader() {
        const str = (s) => Array.from(s, (c) => c.charCodeAt(0));
        this._bytes(str('GIF89a'));
        this._bytes([...this._u16(this.width), ...this._u16(this.height), 0xF7, 0, 0]);
        this._bytes(this.palette);
        // NETSCAPE2.0: repetição (0 = infinito)
        this._bytes([0x21, 0xFF, 0x0B, ...str('NETSCAPE2.0'), 0x03, 0x01, ...this._u16(this.loop), 0x00]);
    }

    // rgba: Uint8ClampedArray(width*height*4); delayCs: atraso em centésimos de segundo
    addFrame(rgba, delayCs) {
        const n = this.width * this.height;
        const indices = new Uint8Array(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) {
            indices[i] = this._nearest(rgba[j], rgba[j + 1], rgba[j + 2]);
        }
        // Graphic Control Extension (disposal = 1: mantém o frame)
        this._bytes([0x21, 0xF9, 0x04, 0x04, ...this._u16(Math.max(2, Math.round(delayCs))), 0x00, 0x00]);
        // Image Descriptor
        this._bytes([0x2C, 0, 0, 0, 0, ...this._u16(this.width), ...this._u16(this.height), 0x00]);
        this._bytes([8]); // LZW min code size
        this._lzw(indices);
    }

    _lzw(indices) {
        const out = [];
        let block = [];
        let bitBuf = 0, bitCount = 0;
        const emitByte = (b) => {
            block.push(b);
            if (block.length === 255) { out.push(255, ...block); block = []; }
        };
        let codeSize = 9;
        const clear = 256, eoi = 257;
        let next = 258;
        let dict = new Map();
        const write = (code) => {
            bitBuf |= code << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) { emitByte(bitBuf & 255); bitBuf >>>= 8; bitCount -= 8; }
        };
        write(clear);
        let prefix = indices[0];
        for (let i = 1; i < indices.length; i++) {
            const c = indices[i];
            const key = (prefix << 8) | c;
            const found = dict.get(key);
            if (found !== undefined) {
                prefix = found;
                continue;
            }
            write(prefix);
            if (next < 4096) {
                dict.set(key, next++);
                if (next > (1 << codeSize) && codeSize < 12) codeSize++;
            } else {
                write(clear);
                dict = new Map();
                next = 258;
                codeSize = 9;
            }
            prefix = c;
        }
        write(prefix);
        write(eoi);
        if (bitCount > 0) emitByte(bitBuf & 255);
        if (block.length) out.push(block.length, ...block);
        out.push(0);
        this._bytes(out);
    }

    finish() {
        this._bytes([0x3B]);
        return new Blob(this._chunks, { type: 'image/gif' });
    }
}
