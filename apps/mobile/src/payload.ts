/**
 * 차량 앱 C-07 링크 읽기/만들기.
 *
 *   {BASE}/p/{id}#{base64url(UTF-8 JSON), 패딩 없음}
 *   {"v":1,"lot":"아브뉴프랑 판교 주차장","f":"B2","z":"D","n":"07","t":1793685120000,
 *    "m":"엘리베이터 2번 쪽","h":["램프를 다 내려와서 곧장","오른쪽 칸 줄, 약 15m 지점"],"r":[1,17,-1]}
 *
 * 만드는 쪽: apps/vehicle/.../share/ShareLink.kt — 키 순서·형식을 바꾸면 양쪽 테스트 벡터를 같이 고칠 것.
 * fragment(#)는 서버로 가지 않는다. 링크는 누구나 만들 수 있으므로 값은 모두 검사하고, 화면에는 textContent로만 넣는다.
 */

export interface Parking {
  /** 형식 버전 (지금 1). 더 큰 값도 아는 필드만 읽어서 보여 준다 */
  v: number
  lot: string
  /** 층 "B2" · 구역 "D" · 기둥 번호 "07" — 없으면 빈 문자열 */
  f: string
  z: string
  n: string
  /** 주차 시각 (epoch ms) */
  t: number
  /** 차에서 남긴 메모 */
  m?: string
  /** 돌아가는 길 힌트 (최대 4줄) */
  h?: string[]
  /** 힌트 그림용 압축 경로 — route.ts 참고 */
  r?: number[]
}

export type DecodeResult =
  | { ok: true; parking: Parking }
  | { ok: false; reason: 'empty' | 'invalid' }

export const MAX_HINTS = 4
const MAX_LOT = 60
const MAX_TEXT = 80
const MAX_ROUTE = 2 + 2 * 6 + 1

/** base64url이 원칙이지만, 다른 도구가 만든 일반 base64(+/)·패딩(=)도 받아 준다 */
const B64ANY = /^[A-Za-z0-9_\-+/]+$/

/** base64url(패딩 없어도 됨) → UTF-8 문자열. 잘못된 입력이면 null */
export function base64UrlToText(input: string): string | null {
  const s = input.trim().replace(/=+$/, '')
  if (!s || !B64ANY.test(s) || s.length % 4 === 1) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  let bin: string
  try {
    bin = atob(b64)
  } catch {
    return null
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return utf8Decode(bytes)
}

export function textToBase64Url(text: string): string {
  const bytes = utf8Encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function utf8Decode(bytes: Uint8Array): string | null {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return null
    }
  }
  // 아주 오래된 WebView 대비
  try {
    let pct = ''
    for (let i = 0; i < bytes.length; i++) pct += '%' + bytes[i].toString(16).padStart(2, '0')
    return decodeURIComponent(pct)
  } catch {
    return null
  }
}

function utf8Encode(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)
  const bin = unescape(encodeURIComponent(text))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** URL의 # 뒤 (앞의 '#'은 있어도 없어도 됨) → 주차 정보 */
export function decodePayload(fragment: string | null | undefined): DecodeResult {
  const raw = (fragment ?? '').replace(/^#/, '').trim()
  if (!raw) return { ok: false, reason: 'empty' }
  const text = base64UrlToText(raw)
  if (text == null) return { ok: false, reason: 'invalid' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const parking = validate(data)
  return parking ? { ok: true, parking } : { ok: false, reason: 'invalid' }
}

function str(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null
  return clean(x).slice(0, max)
}

/** 제어 문자 제거, 공백 정리 */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function validate(data: unknown): Parking | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (typeof o.v !== 'number' || !Number.isInteger(o.v) || o.v < 1) return null
  if (typeof o.t !== 'number' || !Number.isFinite(o.t) || o.t <= 0) return null
  const lot = str(o.lot, MAX_LOT)
  const f = o.f === undefined ? '' : str(o.f, 12)
  const z = o.z === undefined ? '' : str(o.z, 12)
  const n = o.n === undefined ? '' : str(o.n, 12)
  if (lot === null || f === null || z === null || n === null) return null

  const p: Parking = { v: o.v, lot: lot || '주차 위치', f, z, n, t: Math.round(o.t) }
  const m = str(o.m, MAX_TEXT)
  if (m) p.m = m
  if (Array.isArray(o.h)) {
    const h = o.h
      .map((x) => str(x, MAX_TEXT))
      .filter((x): x is string => !!x)
      .slice(0, MAX_HINTS)
    if (h.length) p.h = h
  }
  if (Array.isArray(o.r) && o.r.length <= MAX_ROUTE && o.r.every((x) => typeof x === 'number' && Number.isInteger(x))) {
    p.r = o.r as number[]
  }
  return p
}

/** 차량 앱(ShareLink.payloadJson)과 같은 키 순서로 JSON 만들기 — 개발용 링크·테스트 */
export function payloadJson(p: Parking): string {
  const o: Record<string, unknown> = { v: p.v, lot: p.lot, f: p.f, z: p.z, n: p.n, t: p.t }
  if (p.m) o.m = p.m
  if (p.h?.length) {
    o.h = p.h.slice(0, MAX_HINTS)
    if (p.r?.length) o.r = p.r
  }
  return JSON.stringify(o)
}

export function encodePayload(p: Parking): string {
  return textToBase64Url(payloadJson(p))
}

/** `${base}/p/${id}#${payload}` */
export function buildLink(base: string, id: string, p: Parking): string {
  return `${base.replace(/\/+$/, '')}/p/${encodeURIComponent(id)}#${encodePayload(p)}`
}

/** 경로 /p/{id} 의 id (앞에 배포 경로가 붙어 있어도 됨). 없으면 '' */
export function idFromPath(pathname: string): string {
  const m = /\/p\/([^/?#]+)/.exec(pathname)
  if (!m) return ''
  try {
    return decodeURIComponent(m[1]).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  } catch {
    return ''
  }
}

/**
 * 링크에서 payload 찾기. 보통은 location.hash.
 * 어떤 QR 앱·메신저는 '#'을 '%23'으로 바꿔 경로에 붙여 열기도 해서 그것도 받아 준다.
 */
export function fragmentFromLocation(loc: { hash: string; pathname: string }): string {
  if (loc.hash && loc.hash.length > 1) return loc.hash
  const i = loc.pathname.toLowerCase().indexOf('%23')
  return i >= 0 ? loc.pathname.slice(i + 3) : ''
}
