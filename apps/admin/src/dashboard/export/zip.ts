/**
 * 아주 작은 ZIP 쓰기 (의존성 없음). 압축은 브라우저 기본 CompressionStream('deflate-raw')가 있을 때만,
 * 없으면 그대로 담는다(STORE). 파일 이름은 UTF-8. 4GB 를 넘는 ZIP64 는 다루지 않는다.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry { name: string; data: Uint8Array }

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null
  try {
    const cs = new CompressionStream('deflate-raw')
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** entries → ZIP 바이트. compress 가 true 이고 브라우저가 지원하면 deflate (더 작을 때만) */
export async function zip(entries: readonly ZipEntry[], opts: { compress?: boolean; date?: Date } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const { time, date } = dosTime(opts.date ?? new Date())
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    let body = e.data
    let method = 0
    if (opts.compress !== false) {
      const z = await deflateRaw(e.data)
      if (z && z.length < e.data.length) {
        body = z
        method = 8
      }
    }
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 이름
    lv.setUint16(8, method, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, e.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, body)

    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, e.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)
    offset += local.length + body.length
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  return concat([...parts, ...central, end])
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/** 긴 글 조각들 → UTF-8 바이트 (한 번에 큰 문자열을 만들지 않게) */
export function encodeChunks(chunks: Iterable<string>): Uint8Array {
  const enc = new TextEncoder()
  const out: Uint8Array[] = []
  let buf = ''
  for (const c of chunks) {
    buf += c
    if (buf.length > 1 << 20) {
      out.push(enc.encode(buf))
      buf = ''
    }
  }
  if (buf) out.push(enc.encode(buf))
  return concat(out)
}
