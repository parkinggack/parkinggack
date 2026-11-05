/**
 * 아주 작은 Parquet 쓰기 (의존성 없음) — 행 묶음 하나, 열마다 데이터 페이지 하나, PLAIN 인코딩, 압축 없음, 모든 열 REQUIRED.
 * 글자 = BYTE_ARRAY(UTF8), 정수 = INT32, 소수 = DOUBLE. 메타데이터는 Thrift compact protocol.
 * 형식: https://github.com/apache/parquet-format (FileMetaData · PageHeader)
 */
import type { Table } from './datasets'
import { concat } from './zip'

// Thrift compact 형식 타입 번호
const T_TRUE = 1
const T_FALSE = 2
const T_I32 = 5
const T_I64 = 6
const T_BINARY = 8
const T_LIST = 9
const T_STRUCT = 12

class Bytes {
  buf = new Uint8Array(256)
  len = 0
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return
    let cap = this.buf.length * 2
    while (cap < this.len + n) cap *= 2
    const next = new Uint8Array(cap)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }
  byte(b: number) {
    this.grow(1)
    this.buf[this.len++] = b & 0xff
  }
  bytes(b: Uint8Array) {
    this.grow(b.length)
    this.buf.set(b, this.len)
    this.len += b.length
  }
  /** 부호 없는 varint (2^53 까지) */
  varint(n: number) {
    let v = n
    while (v >= 0x80) {
      this.byte((v % 0x80) | 0x80)
      v = Math.floor(v / 0x80)
    }
    this.byte(v)
  }
  i32le(v: number) {
    this.grow(4)
    new DataView(this.buf.buffer).setInt32(this.len, v, true)
    this.len += 4
  }
  f64le(v: number) {
    this.grow(8)
    new DataView(this.buf.buffer).setFloat64(this.len, v, true)
    this.len += 8
  }
  out(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1)
const utf8 = new TextEncoder()

/** Thrift compact protocol 쓰기 (필드는 번호 순서대로 써야 한다) */
class Thrift {
  b = new Bytes()
  private last: number[] = [0]
  private head(type: number, id: number) {
    const d = id - this.last[this.last.length - 1]
    if (d > 0 && d <= 15) this.b.byte((d << 4) | type)
    else {
      this.b.byte(type)
      this.b.varint(zigzag(id))
    }
    this.last[this.last.length - 1] = id
  }
  i32(id: number, v: number) {
    this.head(T_I32, id)
    this.b.varint(zigzag(v))
  }
  i64(id: number, v: number) {
    this.head(T_I64, id)
    this.b.varint(zigzag(v))
  }
  bool(id: number, v: boolean) {
    this.head(v ? T_TRUE : T_FALSE, id)
  }
  str(id: number, s: string) {
    const e = utf8.encode(s)
    this.head(T_BINARY, id)
    this.b.varint(e.length)
    this.b.bytes(e)
  }
  struct(id: number, body: () => void) {
    this.head(T_STRUCT, id)
    this.inner(body)
  }
  private inner(body: () => void) {
    this.last.push(0)
    body()
    this.b.byte(0)
    this.last.pop()
  }
  private listHead(id: number, elem: number, size: number) {
    this.head(T_LIST, id)
    if (size < 15) this.b.byte((size << 4) | elem)
    else {
      this.b.byte(0xf0 | elem)
      this.b.varint(size)
    }
  }
  listI32(id: number, xs: number[]) {
    this.listHead(id, T_I32, xs.length)
    xs.forEach((x) => this.b.varint(zigzag(x)))
  }
  listStr(id: number, xs: string[]) {
    this.listHead(id, T_BINARY, xs.length)
    xs.forEach((x) => {
      const e = utf8.encode(x)
      this.b.varint(e.length)
      this.b.bytes(e)
    })
  }
  listStruct<T>(id: number, xs: T[], each: (x: T) => void) {
    this.listHead(id, T_STRUCT, xs.length)
    xs.forEach((x) => this.inner(() => each(x)))
  }
  /** 맨 바깥 구조체 (FileMetaData · PageHeader) */
  static top(body: (t: Thrift) => void): Uint8Array {
    const t = new Thrift()
    body(t)
    t.b.byte(0)
    return t.b.out()
  }
}

// parquet-format 번호
const TYPE = { s: 6 /* BYTE_ARRAY */, i: 1 /* INT32 */, f: 5 /* DOUBLE */ } as const
const UTF8 = 0
const REQUIRED = 0
const PLAIN = 0
const RLE = 3
const UNCOMPRESSED = 0
const DATA_PAGE = 0

export function parquetBytes(t: Table, meta: Record<string, string> = {}): Uint8Array {
  const cols = t.columns.map(() => new Bytes())
  let n = 0
  for (const row of t.rows()) {
    row.forEach((v, i) => {
      const type = t.types[i]
      if (type === 's') {
        const e = utf8.encode(String(v))
        cols[i].i32le(e.length)
        cols[i].bytes(e)
      } else if (type === 'i') cols[i].i32le(Math.round(Number(v)) | 0)
      else cols[i].f64le(Number(v))
    })
    n++
  }

  const chunks: Uint8Array[] = [utf8.encode('PAR1')]
  let offset = 4
  const chunkMeta: { type: number; name: string; offset: number; size: number }[] = []
  t.columns.forEach((name, i) => {
    const data = cols[i].out()
    const header = Thrift.top((h) => {
      h.i32(1, DATA_PAGE)
      h.i32(2, data.length)
      h.i32(3, data.length)
      h.struct(5, () => {
        h.i32(1, n)
        h.i32(2, PLAIN)
        h.i32(3, RLE)
        h.i32(4, RLE)
      })
    })
    chunkMeta.push({ type: TYPE[t.types[i]], name, offset, size: header.length + data.length })
    chunks.push(header, data)
    offset += header.length + data.length
  })

  const footer = Thrift.top((f) => {
    f.i32(1, 1)
    f.listStruct(2, [null, ...t.columns.map((c, i) => ({ c, i }))], (x) => {
      if (!x) {
        f.str(4, 'schema')
        f.i32(5, t.columns.length)
        return
      }
      f.i32(1, TYPE[t.types[x.i]])
      f.i32(3, REQUIRED)
      f.str(4, x.c)
      if (t.types[x.i] === 's') f.i32(6, UTF8)
    })
    f.i64(3, n)
    f.listStruct(4, [0], () => {
      f.listStruct(1, chunkMeta, (c) => {
        f.i64(2, c.offset)
        f.struct(3, () => {
          f.i32(1, c.type)
          f.listI32(2, [PLAIN, RLE])
          f.listStr(3, [c.name])
          f.i32(4, UNCOMPRESSED)
          f.i64(5, n)
          f.i64(6, c.size)
          f.i64(7, c.size)
          f.i64(9, c.offset)
        })
      })
      f.i64(2, chunkMeta.reduce((a, c) => a + c.size, 0))
      f.i64(3, n)
    })
    const kv = Object.entries(meta)
    if (kv.length) {
      f.listStruct(5, kv, ([k, v]) => {
        f.str(1, k)
        f.str(2, v)
      })
    }
    f.str(6, 'parkinggack dashboard (browser)')
  })
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, footer.length, true)
  chunks.push(footer, len, utf8.encode('PAR1'))
  return concat(chunks)
}
