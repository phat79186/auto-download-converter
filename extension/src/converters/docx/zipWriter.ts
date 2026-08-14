/**
 * Minimal ZIP writer using the STORE method (no compression). This is a fully
 * valid ZIP file per the spec - Word, LibreOffice, and every ZIP tool can open
 * STORE-method archives; we trade a slightly larger file for not needing a
 * DEFLATE implementation, which keeps this dependency-free and easy to audit.
 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc32: number;
  offset: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export class ZipWriter {
  private files: { name: string; data: Uint8Array }[] = [];

  addFile(name: string, content: string | Uint8Array): void {
    const data = typeof content === "string" ? strToBytes(content) : content;
    this.files.push({ name, data });
  }

  build(): Uint8Array {
    const chunks: Uint8Array[] = [];
    const entries: ZipEntry[] = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = strToBytes(file.name);
      const crc = crc32(file.data);
      const localHeader = concat([
        u32(0x04034b50), // local file header signature
        u16(20), // version needed
        u16(0), // flags
        u16(0), // compression method: 0 = store
        u16(0), // mod time
        u16(0), // mod date
        u32(crc),
        u32(file.data.length), // compressed size
        u32(file.data.length), // uncompressed size
        u16(nameBytes.length),
        u16(0), // extra field length
        nameBytes,
      ]);

      entries.push({ name: file.name, data: file.data, crc32: crc, offset });
      chunks.push(localHeader, file.data);
      offset += localHeader.length + file.data.length;
    }

    const centralDirStart = offset;
    for (const entry of entries) {
      const nameBytes = strToBytes(entry.name);
      const central = concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(entry.crc32),
        u32(entry.data.length),
        u32(entry.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(entry.offset),
        nameBytes,
      ]);
      chunks.push(central);
      offset += central.length;
    }
    const centralDirSize = offset - centralDirStart;

    const eocd = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(centralDirSize),
      u32(centralDirStart),
      u16(0),
    ]);
    chunks.push(eocd);

    return concat(chunks);
  }
}
