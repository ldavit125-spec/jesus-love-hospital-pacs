import zlib from 'node:zlib';

export type ZipEntry = {
  path: string; // e.g. "DEMO-CHEST-PA-001/image001.dcm"
  data: Buffer | Uint8Array | string;
};

// CRC-32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard uncompressed (store) or deflate-compressed ZIP buffer in pure Node.js.
 * Using deflate keeps DICOM and text packages compact and fast.
 */
export function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  // DOS time for consistent zip timestamps
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    Math.floor(now.getSeconds() / 2);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const rawData = Buffer.isBuffer(entry.data)
      ? entry.data
      : typeof entry.data === 'string'
        ? Buffer.from(entry.data, 'utf8')
        : Buffer.from(entry.data);

    const crc32 = computeCrc32(rawData);
    const uncompressedSize = rawData.length;

    // Use deflate compression
    let compressedData: Buffer = zlib.deflateRawSync(rawData, { level: 6 });
    let compressionMethod = 8; // Deflated

    // If compressed size is larger than uncompressed, fallback to STORE (0)
    if (compressedData.length >= uncompressedSize) {
      compressedData = rawData;
      compressionMethod = 0; // Stored
    }
    const compressedSize = compressedData.length;

    const pathBuffer = Buffer.from(entry.path.replace(/\\/g, '/'), 'utf8');

    // Local file header (30 bytes + path length)
    const localHeader = Buffer.alloc(30 + pathBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8 filename bit set)
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(pathBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    pathBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // Central directory file header (46 bytes + path length)
    const centralDir = Buffer.alloc(46 + pathBuffer.length);
    centralDir.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    centralDir.writeUInt16LE(20, 4); // Version made by (2.0)
    centralDir.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    centralDir.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralDir.writeUInt16LE(compressionMethod, 10);
    centralDir.writeUInt16LE(dosTime, 12);
    centralDir.writeUInt16LE(dosDate, 14);
    centralDir.writeUInt32LE(crc32, 16);
    centralDir.writeUInt32LE(compressedSize, 20);
    centralDir.writeUInt32LE(uncompressedSize, 24);
    centralDir.writeUInt16LE(pathBuffer.length, 28);
    centralDir.writeUInt16LE(0, 30); // Extra field length
    centralDir.writeUInt16LE(0, 32); // File comment length
    centralDir.writeUInt16LE(0, 34); // Disk number start
    centralDir.writeUInt16LE(0, 36); // Internal file attributes
    centralDir.writeUInt32LE(0, 38); // External file attributes
    centralDir.writeUInt32LE(offset, 42); // Relative offset of local header
    pathBuffer.copy(centralDir, 46);

    centralDirs.push(centralDir);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralDirs.reduce((acc, b) => acc + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  return Buffer.concat([...localHeaders, ...centralDirs, eocd]);
}
