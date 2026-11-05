/**
 * 주차장 편집 폼 ↔ AdminLotInput 변환과 입력 검증.
 * 서버도 검증하지만(400 bad_request), 저장 전에 화면에서 먼저 알려 준다.
 */
import type { AdminLot, LotCategory, ReasonTag } from '@api-types'
import type { AdminLotInputV11, AdminLotV11 } from './types'

export interface LotFormValues {
  id: string
  name: string
  lat: string
  lng: string
  address: string
  floors: string[]
  zones: string[]
  numbers: string[]
  zoneDescription: string
  manualTags: ReasonTag[]
  publicInfo: string[]
  feeText: string
  /** v1.1 유형 (대시보드 D-03 필터). '' = 정하지 않음 */
  category: LotCategory | ''
  /** v1.1 대시보드 지역 id (예: pangyo). '' = 정하지 않음 */
  region: string
}

export type LotFormErrors = Partial<Record<keyof LotFormValues, string>>

export const DEFAULT_ZONES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const DEFAULT_NUMBERS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
export const DEFAULT_FLOORS = ['1F', 'B1', 'B2', 'B3', 'B4']

export const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
export const REGION_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
/** 폼 선택지 순서 (라벨은 계약의 LOT_CATEGORY_LABEL) */
export const LOT_CATEGORIES: readonly LotCategory[] = ['DEPARTMENT', 'MALL', 'OFFICE', 'PUBLIC', 'APARTMENT', 'OTHER']
export const MAX_NAME = 80
export const MAX_CHIP = 8

export function emptyForm(): LotFormValues {
  return {
    id: '', name: '', lat: '', lng: '', address: '',
    floors: [...DEFAULT_FLOORS], zones: [...DEFAULT_ZONES], numbers: [...DEFAULT_NUMBERS],
    zoneDescription: '', manualTags: [], publicInfo: [], feeText: '', category: '', region: '',
  }
}

export function formFromLot(lot: AdminLot): LotFormValues {
  const v11 = lot as AdminLotV11
  return {
    id: lot.id,
    name: lot.name,
    lat: String(lot.location.lat),
    lng: String(lot.location.lng),
    address: lot.address ?? '',
    floors: [...lot.floors],
    zones: [...(lot.zoneScheme?.zones ?? [])],
    numbers: [...(lot.zoneScheme?.numbers ?? [])],
    zoneDescription: lot.zoneScheme?.description ?? '',
    manualTags: [...(lot.manualTags ?? [])],
    publicInfo: [...(lot.publicInfo ?? [])],
    feeText: lot.feeText ?? '',
    category: v11.category ?? '',
    region: v11.region ?? '',
  }
}

function parseCoord(s: string): number {
  const t = s.trim().replace(',', '.')
  return t === '' ? NaN : Number(t)
}

function chipListError(list: string[], what: string, required: boolean): string | undefined {
  const cleaned = list.map((x) => x.trim())
  if (required && cleaned.length === 0) return `${what}을(를) 하나 이상 넣어 주세요`
  if (cleaned.some((x) => x === '')) return `빈 ${what}이(가) 있어요`
  const long = cleaned.find((x) => x.length > MAX_CHIP)
  if (long) return `"${long}"이(가) 너무 길어요 (${MAX_CHIP}자까지)`
  const seen = new Set<string>()
  for (const x of cleaned) {
    const k = x.toUpperCase()
    if (seen.has(k)) return `"${x}"이(가) 두 번 들어 있어요`
    seen.add(k)
  }
  return undefined
}

export function validateLotForm(v: LotFormValues, isNew: boolean): LotFormErrors {
  const e: LotFormErrors = {}
  if (isNew) {
    if (!v.id.trim()) e.id = 'id를 넣어 주세요 (영문 소문자·숫자·하이픈, 예: hyundai-pangyo)'
    else if (!ID_PATTERN.test(v.id.trim())) e.id = '영문 소문자·숫자·하이픈만, 앞뒤는 하이픈 없이 64자까지'
  }
  if (!v.name.trim()) e.name = '이름을 넣어 주세요'
  else if (v.name.trim().length > MAX_NAME) e.name = `이름은 ${MAX_NAME}자까지예요`

  const lat = parseCoord(v.lat)
  const lng = parseCoord(v.lng)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = '위도는 -90 ~ 90 사이 숫자예요 (예: 37.3926)'
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = '경도는 -180 ~ 180 사이 숫자예요 (예: 127.1121)'

  const floors = chipListError(v.floors, '층', true)
  if (floors) e.floors = floors
  const zones = chipListError(v.zones, '구역', false)
  if (zones) e.zones = zones
  const numbers = chipListError(v.numbers, '번호', false)
  if (numbers) e.numbers = numbers
  if (v.publicInfo.some((x) => x.trim() === '')) e.publicInfo = '빈 줄은 지우거나 채워 주세요'
  if (v.region.trim() && !REGION_PATTERN.test(v.region.trim())) e.region = '영문 소문자·숫자·하이픈만 (예: pangyo)'
  return e
}

/** 위도·경도가 대한민국 대략 범위 밖이면 경고 문구 (저장은 막지 않음) */
export function coordWarning(v: LotFormValues): string | null {
  const lat = parseCoord(v.lat)
  const lng = parseCoord(v.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return '국내 좌표 범위 밖이에요. 위도·경도를 바꿔 넣지 않았는지 확인해 주세요'
  }
  return null
}

const trimOrNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** category·region 은 고른 경우에만 보낸다 (계약: 선택 필드) */
export function toLotInput(v: LotFormValues): AdminLotInputV11 {
  const out: AdminLotInputV11 = {
    id: v.id.trim(),
    name: v.name.trim(),
    location: { lat: parseCoord(v.lat), lng: parseCoord(v.lng) },
    address: trimOrNull(v.address),
    floors: v.floors.map((x) => x.trim()),
    zoneScheme: {
      zones: v.zones.map((x) => x.trim()),
      numbers: v.numbers.map((x) => x.trim()),
      description: trimOrNull(v.zoneDescription),
    },
    manualTags: [...v.manualTags],
    publicInfo: v.publicInfo.map((x) => x.trim()).filter((x) => x !== ''),
    feeText: trimOrNull(v.feeText),
  }
  if (v.category) out.category = v.category
  if (v.region.trim()) out.region = v.region.trim()
  return out
}

/** PUT 본문: id는 경로에 있으므로 뺀다 (계약: Partial<AdminLotInput>) */
export function toLotPatch(v: LotFormValues): Partial<AdminLotInputV11> {
  const { id: _id, ...rest } = toLotInput(v)
  void _id
  return rest
}

/** 층 목록 다음 지하층: ["1F","B1","B2"] → "B3" */
export function nextBasement(floors: readonly string[]): string {
  let max = 0
  for (const f of floors) {
    const m = /^B(\d+)$/i.exec(f.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `B${max + 1}`
}

/** 지상 다음 층: ["1F","B1"] → "2F" */
export function nextAboveGround(floors: readonly string[]): string {
  let max = 0
  for (const f of floors) {
    const m = /^(\d+)F$/i.exec(f.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${max + 1}F`
}

/** 배열에서 i번째를 delta(-1/+1)만큼 옮긴 새 배열 */
export function move<T>(list: readonly T[], i: number, delta: number): T[] {
  const j = i + delta
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  const [x] = next.splice(i, 1)
  next.splice(j, 0, x)
  return next
}
