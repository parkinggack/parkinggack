/**
 * Node 서버 (npm run dev / npm start / Docker): 설정 → DB(마이그레이션) → 빈 DB면 시드 → 시연 시각 옮기기·점수 다시 계산 → HTTP.
 * 주기 작업: 1시간마다 maintenance.full (시연 시각·만료 정리·전체 점수), 1분마다 레이트 리밋 버킷 정리.
 * (Vercel 에서는 이 파일을 쓰지 않는다 — api/index.ts · 요청 때 가벼운 정리 + 하루 한 번 Cron)
 */
import type { AddressInfo } from 'node:net'
import { serve, type ServerType } from '@hono/node-server'
import { createApp } from './app.js'
import type { Config } from './config.js'
import { schemaVersion, type DB } from './db.js'
import { openAndMigrate } from './db-node.js'
import { createPushSender } from './push.js'
import { TokenBucketLimiter } from './ratelimit.js'
import { seedDatabase } from './seed/index.js'
import { ensureKingDemo } from './seed/king.js'
import { Store } from './store.js'
import { VERSION } from './version.js'

export interface Running {
  server: ServerType
  db: DB
  store: Store
  port: number
  close(): Promise<void>
}

const log = (...a: unknown[]) => console.log('[parkinggack]', ...a)

const safeUrl = (u: string) => u.replace(/\/\/[^@/]*@/, '//***@')

export async function startServer(config: Config): Promise<Running> {
  if (config.adminTokenIsDefault) {
    const bar = '!'.repeat(72)
    console.warn(`\n${bar}\n  주의: ADMIN_TOKEN 이 없어서 개발용 토큰 "dev-admin-token" 을 씁니다.\n  외부에 열린 서버라면 ADMIN_TOKEN 을 꼭 정하세요 (NODE_ENV=production 에서는 필수).\n${bar}\n`)
  }

  const db = await openAndMigrate(config.dbUrl, config.dbAuthToken)
  const store = new Store(db)
  log(`DB ${safeUrl(config.dbUrl)} (스키마 v${await schemaVersion(db)})`)

  if (config.seedOnEmpty && (await store.lotCount()) === 0) {
    const t = Date.now()
    const s = await seedDatabase(store)
    log(`빈 DB라 시연 데이터를 넣었어요: 주차장 ${s.lots}곳 · 기록 ${s.records}건 · 별점 ${s.ratings}건 · 주차왕 시연 참여자 ${s.king}명 (${((Date.now() - t) / 1000).toFixed(1)}초)`)
  } else if (config.seedOnEmpty) {
    const n = await ensureKingDemo(store)
    if (n) log(`v1.2 주차왕 시연 참여자 ${n}명을 넣었어요 (판교 5개 리그)`)
  }

  const limiter = new TokenBucketLimiter(config.rateLimitPerMin)
  const app = createApp({ store, config, limiter, push: createPushSender(config) })
  const first = await app.maintenance.full()
  if (first.rolledHours) log(`시연 기록 시각을 ${first.rolledHours}시간 앞으로 옮겼어요`)
  if (!config.vapid) log('VAPID 키가 없어서 웹 푸시는 꺼져 있어요 (GET /v1/push/key → 404)')

  const timers = [
    setInterval(() => app.maintenance.full().catch((e) => console.error('[parkinggack] 주기 작업 실패', e)), 60 * 60_000),
    setInterval(() => limiter.sweep(), 60_000),
  ]
  timers.forEach((t) => t.unref())

  return new Promise((resolveStart) => {
    const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info: AddressInfo) => {
      log(`v${VERSION} http://${config.host}:${info.port}  (에뮬레이터에서는 http://10.0.2.2:${info.port})`)
      resolveStart({
        server,
        db,
        store,
        port: info.port,
        close: () =>
          new Promise<void>((done) => {
            timers.forEach(clearInterval)
            server.close(() => {
              db.close()
              done()
            })
          }),
      })
    })
  })
}
