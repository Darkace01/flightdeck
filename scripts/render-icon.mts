// Renders build/icon.png (used by electron-builder for every installer) from src/shared/icon.ts.
// Run with `npm run icon` after changing the icon drawing.
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { deflateSync } from 'node:zlib'

// The package is CommonJS, so Node won't load icon.ts as an ES module directly; strip its types and import the JS.
const source = stripTypeScriptTypes(readFileSync(new URL('../src/shared/icon.ts', import.meta.url), 'utf8'))
const { drawIcon } = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as typeof import('../src/shared/icon.ts')

const SIZE = 1024

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(rgba: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA, no interlace
  // Each scanline starts with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const out = new URL('../build/icon.png', import.meta.url)
writeFileSync(out, png(drawIcon(SIZE), SIZE))
console.log(`Wrote ${out.pathname}`)
