const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xEDB88320 & mask);
    }
  }
  return (~crc) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng({ width, height, color, output }) {
  const [r, g, b, a = 255] = color;
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[rowLength * y] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowLength * y + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(output, png);
  console.log(`Wrote ${output}`);
}

const tasks = [
  { width: 32, height: 32, file: 'apps/assets/academicnightingale-icon-32.png' },
  { width: 192, height: 192, file: 'apps/assets/academicnightingale-icon-192.png' },
  { width: 512, height: 512, file: 'apps/assets/academicnightingale-icon-512.png' },
  { width: 1280, height: 720, file: 'apps/assets/admin-screenshot-wide.png' },
  { width: 1080, height: 1920, file: 'apps/assets/admin-screenshot-portrait.png' },
];

const brandColor = [14, 116, 144, 255];

for (const task of tasks) {
  createPng({ width: task.width, height: task.height, color: brandColor, output: task.file });
}

const smallPng = fs.readFileSync('apps/assets/academicnightingale-icon-32.png');
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);

const directory = Buffer.alloc(16);
directory[0] = 32; // width
directory[1] = 32; // height
directory[2] = 0; // colors
directory[3] = 0; // reserved
directory.writeUInt16LE(1, 4); // planes
directory.writeUInt16LE(32, 6); // bit depth
directory.writeUInt32LE(smallPng.length, 8);
directory.writeUInt32LE(6 + 16, 12);

const ico = Buffer.concat([icoHeader, directory, smallPng]);
fs.writeFileSync('apps/assets/favicon.ico', ico);
fs.writeFileSync('favicon.ico', ico);
console.log('Wrote apps/assets/favicon.ico and root favicon.ico');
