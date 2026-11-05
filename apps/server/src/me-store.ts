/**
 * v1.1 기기(차·폰) · 페어링 · 내 주차 · 푸시 구독.
 * 계정 없음: 기기마다 무작위 토큰(32바이트 base64url)을 주고 SHA-256(hex)만 저장한다.
 * 폰은 연결된 차 한 대의 주차만 볼 수 있다 (my_parkings 는 car_id 로만 찾는다).
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { InValue } from '@libsql/client'
import type { DeviceKind, DrivingExperience, MyParking, MyParkingInput, MyStatsResponse, PairedCar, PathPoint, SharedSettings } from '@parkinggack/api-types'
import type { Store } from './store.js'
import { round1 } from './scoring.js'

export interface Device {
  id: string
  kind: DeviceKind
  name: string | null
  /** 폰: 연결된 차 id */
  carId: string | null
  pairedMs: number | null
  createdMs: number
}

export interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
  deviceId: string
}

export type PairingStatus = { status: 'pending' | 'claimed' | 'expired'; phoneName: string | null }
export type ClaimResult =
  | { ok: true; token: string; phone: Device; car: PairedCar }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' }

export const PAIRING_CODE_RE = /^\d{6}$/

export const DEFAULT_SETTINGS: Readonly<SharedSettings> = { shareAnonymous: true, experience: 'UNKNOWN' }
/** 끝난 페어링은 하루 뒤 지움 */
const PAIRING_KEEP_MS = 24 * 3_600_000

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
const num = (v: InValue) => Number(v ?? 0)
const str = (v: InValue) => (v == null ? null : String(v))
const iso = (ms: number) => new Date(ms).toISOString()

/** 한국 시간 기준 "2026-11" */
export function monthKey(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 7)
}

/** "2026-11" 에서 k달 전 */
export function monthBefore(key: string, k: number): string {
  const [y, m] = key.split('-').map(Number)
  const t = y * 12 + (m - 1) - k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

function rowToDevice(r: Record<string, InValue>): Device {
  return {
    id: String(r.id),
    kind: String(r.kind) as DeviceKind,
    name: str(r.name),
    carId: str(r.car_id),
    pairedMs: r.paired_ms == null ? null : num(r.paired_ms),
    createdMs: num(r.created_ms),
  }
}

function rowToParking(r: Record<string, InValue>): MyParking {
  return {
    id: String(r.id),
    lotId: str(r.lot_id),
    lotName: String(r.lot_name),
    floor: str(r.floor),
    zone: str(r.zone),
    number: str(r.number),
    note: str(r.note),
    parkedAt: iso(num(r.parked_ms)),
    summary: r.summary == null ? null : JSON.parse(String(r.summary)),
    hints: JSON.parse(String(r.hints)),
    route: r.route == null ? null : JSON.parse(String(r.route)),
    path: JSON.parse(String(r.path)) as PathPoint[],
    foundAt: r.found_ms == null ? null : iso(num(r.found_ms)),
    updatedAt: iso(num(r.updated_ms)),
  }
}

/** "B2 · D-07" — 층·구역·번호 중 있는 것만 */
export function spotText(p: Pick<MyParking, 'floor' | 'zone' | 'number' | 'lotName'>): string {
  const zn = p.zone && p.number ? `${p.zone}-${p.number}` : p.zone || p.number || ''
  return [p.floor, zn].filter(Boolean).join(' · ') || p.lotName || '주차 위치'
}

export class MeStore {
  constructor(private readonly s: Store) {}

  private get now() {
    return this.s.now()
  }

  // ───────── 기기 ─────────

  async registerDevice(kind: DeviceKind, name: string | null, carId: string | null = null): Promise<{ device: Device; token: string }> {
    const token = newToken()
    const now = this.now
    const device: Device = { id: randomUUID(), kind, name: name || null, carId, pairedMs: carId ? now : null, createdMs: now }
    await this.s.run('INSERT INTO devices (id, kind, name, token_hash, car_id, paired_ms, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      device.id,
      kind,
      device.name,
      hashToken(token),
      carId,
      device.pairedMs,
      now,
    ])
    return { device, token }
  }

  async deviceByToken(token: string): Promise<Device | null> {
    const r = await this.s.one('SELECT * FROM devices WHERE token_hash = ?', [hashToken(token)])
    return r ? rowToDevice(r) : null
  }

  async device(id: string): Promise<Device | null> {
    const r = await this.s.one('SELECT * FROM devices WHERE id = ?', [id])
    return r ? rowToDevice(r) : null
  }

  async phonesOf(carId: string): Promise<Device[]> {
    return (await this.s.all("SELECT * FROM devices WHERE car_id = ? AND kind = 'phone' ORDER BY paired_ms", [carId])).map(rowToDevice)
  }

  /** 폰 연결 끊기: 폰 기기·푸시 구독을 지운다 (토큰 폐기) */
  async deletePhones(ids: string[]): Promise<void> {
    if (!ids.length) return
    const ph = ids.map(() => '?').join(',')
    await this.s.db.batch(
      [
        { sql: `DELETE FROM push_subscriptions WHERE device_id IN (${ph})`, args: ids },
        { sql: `DELETE FROM devices WHERE id IN (${ph}) AND kind = 'phone'`, args: ids },
      ],
      'write',
    )
  }

  pairedCar(car: Device, phone: Device): PairedCar {
    return { deviceId: car.id, name: car.name, pairedAt: iso(phone.pairedMs ?? phone.createdMs) }
  }

  // ───────── 페어링 ─────────

  /** 숫자 6자리 코드. 진행 중인 코드와 겹치면 다시 뽑고, 끝난 코드 자리는 덮어쓴다 */
  async createPairing(carId: string, ttlMs: number): Promise<{ code: string; expiresMs: number }> {
    const now = this.now
    const expiresMs = now + ttlMs
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      const n = await this.s.run(
        `INSERT INTO pairings (code, car_id, created_ms, expires_ms) VALUES (:code, :car, :now, :exp)
         ON CONFLICT(code) DO UPDATE SET car_id = :car, created_ms = :now, expires_ms = :exp, claimed_ms = NULL, phone_id = NULL, phone_name = NULL
         WHERE pairings.expires_ms <= :now - ${PAIRING_KEEP_MS}`,
        { code, car: carId, now, exp: expiresMs },
      )
      if (n === 1) return { code, expiresMs }
    }
    throw new Error('페어링 코드를 만들지 못했어요')
  }

  /** 차가 자기 코드 상태를 본다. 다른 차의 코드면 null(404) */
  async pairingStatus(carId: string, code: string): Promise<PairingStatus | null> {
    const r = await this.s.one('SELECT * FROM pairings WHERE code = ? AND car_id = ?', [code, carId])
    if (!r) return null
    if (r.claimed_ms != null) return { status: 'claimed', phoneName: str(r.phone_name) }
    return { status: num(r.expires_ms) <= this.now ? 'expired' : 'pending', phoneName: null }
  }

  /** 폰이 코드로 연결 → 폰 토큰 */
  async claim(code: string, phoneName: string | null): Promise<ClaimResult> {
    const r = await this.s.one('SELECT * FROM pairings WHERE code = ?', [code])
    if (!r) return { ok: false, reason: 'not_found' }
    if (r.claimed_ms != null) return { ok: false, reason: 'used' }
    if (num(r.expires_ms) <= this.now) return { ok: false, reason: 'expired' }
    const car = await this.device(String(r.car_id))
    if (!car || car.kind !== 'car') return { ok: false, reason: 'not_found' }
    const { device: phone, token } = await this.registerDevice('phone', phoneName, car.id)
    // 같은 코드로 동시에 두 폰이 연결하면 하나만
    const n = await this.s.run('UPDATE pairings SET claimed_ms = ?, phone_id = ?, phone_name = ? WHERE code = ? AND claimed_ms IS NULL', [
      this.now,
      phone.id,
      phone.name,
      code,
    ])
    if (n === 0) {
      await this.deletePhones([phone.id])
      return { ok: false, reason: 'used' }
    }
    return { ok: true, token, phone, car: this.pairedCar(car, phone) }
  }

  async cleanupPairings(): Promise<number> {
    return this.s.run('DELETE FROM pairings WHERE expires_ms <= ?', [this.now - PAIRING_KEEP_MS])
  }

  // ───────── 내 주차 ─────────

  /** 차가 저장·수정. created = 처음 들어온 주차인지 (폰 알림용) */
  async putParking(carId: string, id: string, p: MyParkingInput): Promise<{ parking: MyParking; created: boolean }> {
    const now = this.now
    const args = {
      car: carId,
      id,
      lot_id: p.lotId,
      lot_name: p.lotName,
      floor: p.floor,
      zone: p.zone,
      number: p.number,
      note: p.note,
      parked: Date.parse(p.parkedAt),
      summary: p.summary ? JSON.stringify(p.summary) : null,
      hints: JSON.stringify(p.hints),
      route: p.route ? JSON.stringify(p.route) : null,
      path: JSON.stringify(p.path),
      now,
    }
    const existed = await this.s.one('SELECT 1 AS x FROM my_parkings WHERE car_id = ? AND id = ?', [carId, id])
    await this.s.run(
      `INSERT INTO my_parkings (car_id, id, lot_id, lot_name, floor, zone, number, note, parked_ms, summary, hints, route, path, found_ms, created_ms, updated_ms)
       VALUES (:car, :id, :lot_id, :lot_name, :floor, :zone, :number, :note, :parked, :summary, :hints, :route, :path, NULL, :now, :now)
       ON CONFLICT(car_id, id) DO UPDATE SET lot_id = :lot_id, lot_name = :lot_name, floor = :floor, zone = :zone, number = :number, note = :note,
         parked_ms = :parked, summary = :summary, hints = :hints, route = :route, path = :path, updated_ms = :now`,
      args,
    )
    return { parking: (await this.getParking(carId, id))!, created: !existed }
  }

  // ───────── 같이 쓰는 설정 (차마다) ─────────

  async settings(carId: string): Promise<SharedSettings> {
    const r = await this.s.one('SELECT share_anonymous, experience FROM car_settings WHERE car_id = ?', [carId])
    return r ? { shareAnonymous: num(r.share_anonymous) === 1, experience: String(r.experience) as DrivingExperience } : { ...DEFAULT_SETTINGS }
  }

  async patchSettings(carId: string, patch: Partial<SharedSettings>): Promise<SharedSettings> {
    const next = { ...(await this.settings(carId)), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as SharedSettings
    await this.s.run(
      `INSERT INTO car_settings (car_id, share_anonymous, experience, updated_ms) VALUES (?, ?, ?, ?)
       ON CONFLICT(car_id) DO UPDATE SET share_anonymous = excluded.share_anonymous, experience = excluded.experience, updated_ms = excluded.updated_ms`,
      [carId, next.shareAnonymous ? 1 : 0, next.experience, this.now],
    )
    return next
  }

  async getParking(carId: string, id: string): Promise<MyParking | null> {
    const r = await this.s.one('SELECT * FROM my_parkings WHERE car_id = ? AND id = ?', [carId, id])
    return r ? rowToParking(r) : null
  }

  /** 최신순, before(ISO) 보다 이전 것만 */
  async listParkings(carId: string, limit: number, before?: string): Promise<{ parkings: MyParking[]; nextBefore: string | null }> {
    const args: InValue[] = [carId]
    let where = 'car_id = ?'
    if (before) {
      where += ' AND parked_ms < ?'
      args.push(Date.parse(before))
    }
    const rows = await this.s.all(`SELECT * FROM my_parkings WHERE ${where} ORDER BY parked_ms DESC, id DESC LIMIT ?`, [...args, limit + 1])
    const page = rows.slice(0, limit).map(rowToParking)
    return { parkings: page, nextBefore: rows.length > limit ? page[page.length - 1].parkedAt : null }
  }

  /** 지금 주차 중: 가장 최근 주차가 아직 "차 찾았어요" 전이면 그것, 아니면 null (차는 한 곳에만 있으니까) */
  async currentParking(carId: string): Promise<MyParking | null> {
    const r = await this.s.one('SELECT * FROM my_parkings WHERE car_id = ? ORDER BY parked_ms DESC, id DESC LIMIT 1', [carId])
    if (!r || r.found_ms != null) return null
    return rowToParking(r)
  }

  async markFound(carId: string, id: string): Promise<MyParking | null> {
    await this.s.run('UPDATE my_parkings SET found_ms = COALESCE(found_ms, ?), updated_ms = ? WHERE car_id = ? AND id = ?', [this.now, this.now, carId, id])
    return this.getParking(carId, id)
  }

  /** M-32 · C-09: 한국 시간 달력 기준 */
  async stats(carId: string): Promise<MyStatsResponse> {
    const rows = await this.s.all('SELECT lot_id, parked_ms, summary FROM my_parkings WHERE car_id = ?', [carId])
    const thisMonth = monthKey(this.now)
    const months = Array.from({ length: 6 }, (_, k) => monthBefore(thisMonth, 5 - k))
    const byMonth = new Map<string, { n: number; rev: number }>()
    const lotCount = new Map<string, { count: number; last: number }>()
    for (const r of rows) {
      const ms = num(r.parked_ms)
      if (r.lot_id != null) {
        const c = lotCount.get(String(r.lot_id)) ?? { count: 0, last: 0 }
        c.count++
        c.last = Math.max(c.last, ms)
        lotCount.set(String(r.lot_id), c)
      }
      if (r.summary == null) continue
      const rev = Number(JSON.parse(String(r.summary)).reverseCount ?? 0)
      const m = monthKey(ms)
      const e = byMonth.get(m) ?? { n: 0, rev: 0 }
      e.n++
      e.rev += rev
      byMonth.set(m, e)
    }
    const avg = (m: string) => {
      const e = byMonth.get(m)
      return e && e.n ? round1(e.rev / e.n) : null
    }
    return {
      thisMonthAvgReverse: avg(thisMonth),
      lastMonthAvgReverse: avg(monthBefore(thisMonth, 1)),
      monthly: months.filter((m) => byMonth.has(m)).map((m) => ({ month: m, avgReverse: avg(m)! })),
      favorites: [...lotCount.entries()]
        .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
        .slice(0, 3)
        .map(([lotId, c]) => ({ lotId, count: c.count })),
    }
  }

  // ───────── 푸시 구독 ─────────

  async savePush(deviceId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.s.run(
      `INSERT INTO push_subscriptions (endpoint, device_id, p256dh, auth, created_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      [sub.endpoint, deviceId, sub.keys.p256dh, sub.keys.auth, this.now],
    )
  }

  async deletePush(deviceId: string, endpoint?: string): Promise<number> {
    return endpoint
      ? this.s.run('DELETE FROM push_subscriptions WHERE device_id = ? AND endpoint = ?', [deviceId, endpoint])
      : this.s.run('DELETE FROM push_subscriptions WHERE device_id = ?', [deviceId])
  }

  async dropPushEndpoint(endpoint: string): Promise<void> {
    await this.s.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint])
  }

  /** 이 차와 연결된 폰들의 구독 */
  async pushSubsForCar(carId: string): Promise<PushSub[]> {
    const rows = await this.s.all(
      `SELECT p.endpoint, p.p256dh, p.auth, p.device_id FROM push_subscriptions p JOIN devices d ON d.id = p.device_id
       WHERE d.car_id = ? AND d.kind = 'phone'`,
      [carId],
    )
    return rows.map((r) => ({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth), deviceId: String(r.device_id) }))
  }
}
