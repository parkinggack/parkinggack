/** 테스트용 앱: 시연 DB 복사본(또는 빈 메모리 DB) + 고정 시계. 네트워크 없이 app.request 로 부른다 */
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { inject } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openAndMigrate } from '../src/db-node.js'
import type { PushMessage, PushSender, PushTarget } from '../src/push.js'
import { Store } from '../src/store.js'
import { NOW } from './now.js'

export { NOW }
export const DEV_TOKEN = 'dev-admin-token'
export const ADMIN = { Authorization: `Bearer ${DEV_TOKEN}` }

export type Res = { status: number; body: any; res: Response }

export interface TestApp {
  app: ReturnType<typeof createApp>
  store: Store
  clock: { t: number }
  get(path: string, headers?: Record<string, string>): Promise<Res>
  send(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res>
}

let copies = 0

/** seed=true(기본): 시연 데이터가 든 DB 복사본 · false: 빈 메모리 DB */
export async function makeApp(opts: { seed?: boolean; env?: Record<string, string>; now?: () => number; push?: PushSender } = {}): Promise<TestApp> {
  const clock = { t: NOW }
  const now = opts.now ?? (() => clock.t)
  const config = loadConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', RATE_LIMIT_PER_MIN: '100000', CLAIM_FAILURES_PER_MIN: '10000', ...opts.env })
  let url = ':memory:'
  if (opts.seed !== false) {
    const file = join(inject('tmpRoot'), `app-${process.pid}-${++copies}.db`)
    copyFileSync(inject('templateDb'), file)
    url = `file:${file}`
  }
  const store = new Store(await openAndMigrate(url), now)
  const app = createApp({ store, config, push: opts.push })

  const call = async (path: string, init?: RequestInit): Promise<Res> => {
    const res = await app.request(path, init)
    const text = await res.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    return { status: res.status, body, res }
  }
  return {
    app,
    store,
    clock,
    get: (path, headers = {}) => call(path, { headers }),
    send: (method, path, body, headers = {}) =>
      call(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
  }
}

let n = 0
/** 정상 기록 하나 (필드를 덮어써서 오류 경우를 만든다) */
export function record(over: Record<string, unknown> = {}) {
  n++
  return {
    clientRecordId: `test-rec-${String(n).padStart(6, '0')}-${Math.random().toString(36).slice(2, 10)}`,
    lotId: 'pangyo-new',
    floor: 'B2',
    reverseCount: 2,
    steeringTurns: 4,
    brakeCount: 9,
    durationSec: 95,
    rampTurns: 1.5,
    shape: 'PERPENDICULAR',
    approximate: false,
    vehicleClass: 'MIDSIZE',
    experience: 'Y3_10',
    parkedHour: 14,
    parkedWeekday: 2,
    ...over,
  }
}

/** 차량 앱 ShareLinkTest 벡터와 같은 값 */
export const VECTOR_PAYLOAD = {
  v: 1,
  lot: '아브뉴프랑 판교 주차장',
  f: 'B2',
  z: 'D',
  n: '07',
  t: 1793685120000,
  m: '엘리베이터 2번 쪽',
  h: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'],
  r: [1, 17, -1],
}

/** 보낸 알림을 기억하는 가짜 푸시 */
export function fakePush(): PushSender & { sent: Array<{ target: PushTarget; msg: PushMessage }>; goneEndpoints: Set<string> } {
  const sent: Array<{ target: PushTarget; msg: PushMessage }> = []
  const goneEndpoints = new Set<string>()
  return {
    publicKey: 'BTestPublicKey',
    sent,
    goneEndpoints,
    async send(target, msg) {
      sent.push({ target, msg })
      return goneEndpoints.has(target.endpoint) ? 'gone' : 'ok'
    },
  }
}
