/**
 * 이 폰에만 남기는 값 (localStorage). WebView에서 DOM storage가 꺼져 있거나 사파리 개인 정보 보호 모드면
 * 예외가 나므로 전부 감싸고, 저장이 안 되면 이번 화면에서만 기억한다.
 */
const memory = new Map<string, string>()

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

export function getItem(key: string): string | null {
  try {
    const v = storage()?.getItem(key)
    if (v != null) return v
  } catch {
    /* 저장소 없음 */
  }
  return memory.get(key) ?? null
}

export function setItem(key: string, value: string | null) {
  if (value == null) memory.delete(key)
  else memory.set(key, value)
  try {
    const s = storage()
    if (!s) return
    if (value == null) s.removeItem(key)
    else s.setItem(key, value)
  } catch {
    /* 저장소 없음 */
  }
}

export function getJSON<T>(key: string, check: (v: unknown) => v is T): T | null {
  const raw = getItem(key)
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    return check(v) ? v : null
  } catch {
    return null
  }
}

export function setJSON(key: string, value: unknown) {
  setItem(key, value == null ? null : JSON.stringify(value))
}

/** 테스트용: 메모리 사본 비우기 */
export function clearMemory() {
  memory.clear()
}

const LAST = 'pg:last'

export interface LastLink {
  /** location.pathname + hash — 같은 사이트 안에서 다시 열 때 */
  href: string
  title: string
  lot: string
  t: number
}

const isLast = (o: unknown): o is LastLink => {
  const x = o as LastLink
  return !!x && typeof x.href === 'string' && typeof x.title === 'string' && typeof x.t === 'number'
}

/** 링크(/p/…#, /s/…)로 마지막에 연 주차 위치 — 연결 안 한 폰의 홈에서 다시 열기 */
export function loadLast(): LastLink | null {
  const v = getJSON(LAST, isLast)
  return v ? { ...v, lot: typeof v.lot === 'string' ? v.lot : '' } : null
}

export function saveLast(last: LastLink | null) {
  setJSON(LAST, last)
}
