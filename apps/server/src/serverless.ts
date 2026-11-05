/**
 * Vercel Functions · Netlify Functions 공통: 인스턴스마다 앱 하나, 첫 요청에서 마이그레이션을 확인한다 (여러 인스턴스가 동시에 해도 안전).
 *  - DB: Turso(libsql://…) — 네이티브 모듈 없는 @libsql/client/http (함수 묶음에 네이티브 바이너리가 빠지지 않게)
 *  - 시드는 하지 않는다 (요청 안에서 수만 건을 넣으면 시간 초과) — 노트북에서 npm run seed (docs/deploy.md)
 *  - 주기 작업: 요청 때 가벼운 정리(인스턴스마다 10분에 한 번) + 하루 한 번 전체 정리
 *    (Vercel: vercel.json crons → GET /v1/cron/maintain · Netlify: 예약 함수 netlify/functions/maintain.mts)
 *  - 레이트 리밋은 메모리라서 인스턴스마다 따로 센다 (무료 시연 규모에서는 충분)
 */
import { createClient } from '@libsql/client/http'
import { createApp, type ParkingApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { migrate, type DB } from './db.js'
import type { MaintenanceResult } from './maintenance.js'
import { createPushSender } from './push.js'
import { Store } from './store.js'

export type ServerlessPlatform = 'vercel' | 'netlify'

const LABEL: Record<ServerlessPlatform, string> = { vercel: 'Vercel', netlify: 'Netlify' }

/** client 를 주면 그것으로 (테스트) */
export function createServerlessApp(env: NodeJS.ProcessEnv = process.env, client?: DB, platform: ServerlessPlatform = 'vercel'): ParkingApp {
  const config = loadConfig({ ...env, SERVERLESS: platform })
  if (!client && !/^(libsql|https?):\/\//.test(config.dbUrl)) {
    throw new ConfigError(`${LABEL[platform]} 에서는 DATABASE_URL 이 Turso 주소(libsql://…)여야 해요 — 함수에는 오래 남는 디스크가 없어요`)
  }
  const db = client ?? createClient({ url: config.dbUrl, authToken: config.dbAuthToken })
  return createApp({
    store: new Store(db),
    config,
    push: createPushSender(config),
    init: async () => {
      await migrate(db)
    },
  })
}

/**
 * 플랫폼이 붙이는 경로 앞부분을 뗀다 (Vercel rewrites → /api/…, Netlify redirects → /.netlify/functions/api/…).
 * 원래 경로로 와도 그대로 처리한다.
 */
export function stripPrefix(req: Request, prefixes: readonly string[]): Request {
  const url = new URL(req.url)
  for (const p of prefixes) {
    if (url.pathname === p || url.pathname.startsWith(`${p}/`)) {
      url.pathname = url.pathname.slice(p.length) || '/'
      return new Request(url, req)
    }
  }
  return req
}

/** 예약 함수용: 마이그레이션 확인 후 전체 정리 (시연 시각 옮기기 · 만료 링크·페어링 지우기 · 집계 다시) */
export async function runMaintenance(app: ParkingApp): Promise<MaintenanceResult> {
  await app.ready()
  return app.maintenance.full()
}
