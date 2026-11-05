import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../src/config.js'
import { MIGRATIONS, schemaVersion } from '../src/db.js'
import { openDatabase } from '../src/db-node.js'
import { apiHandler, createServerlessApp } from '../src/vercel.js'
import { ADMIN, makeApp } from './helpers.js'

const ENV = { ADMIN_TOKEN: 'vercel-admin-token-0123456789', CRON_SECRET: 'cron-secret-xyz', LOG: '0', DATABASE_URL: 'libsql://parkinggack-test.turso.io', DATABASE_AUTH_TOKEN: 't' }

describe('Vercel Functions', () => {
  it('Turso 주소가 아니면 시작하지 않는다 (함수에는 오래 남는 디스크가 없음)', () => {
    expect(() => createServerlessApp({ ...ENV, DATABASE_URL: 'file:data/x.db' })).toThrow(ConfigError)
    expect(() => createServerlessApp({ ...ENV, ADMIN_TOKEN: '' })).toThrow(ConfigError)
    expect(() => createServerlessApp(ENV)).not.toThrow() // 연결은 첫 요청 때
  })

  it('첫 요청에서 마이그레이션 (빈 DB → 최신), 시드는 하지 않음', async () => {
    const db = openDatabase(':memory:')
    const app = createServerlessApp(ENV, db)
    expect(await schemaVersion(db)).toBe(0)
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    expect(await (await app.request('/v1/lots')).json()).toEqual({ lots: [] })
  })

  it('/api/… 로 와도 같은 처리 (rewrites)', async () => {
    const db = openDatabase(':memory:')
    const app = createServerlessApp(ENV, db)
    const handle = apiHandler(() => app)
    expect((await handle(new Request('https://x.vercel.app/health'))).status).toBe(200)
    expect(await (await handle(new Request('https://x.vercel.app/api/health'))).json()).toMatchObject({ ok: true })
    expect((await handle(new Request('https://x.vercel.app/api/v1/lots?limit=1'))).status).toBe(200)
    const post = await handle(
      new Request('https://x.vercel.app/api/v1/devices', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' }, body: '{"kind":"car"}' }),
    )
    expect(post.status).toBe(201)
  })

  it('Cron: CRON_SECRET 또는 어드민 토큰, 아니면 401', async () => {
    const t = await makeApp({ env: { CRON_SECRET: 'cron-secret-xyz' } })
    expect((await t.get('/v1/cron/maintain')).status).toBe(401)
    expect((await t.get('/v1/cron/maintain', { Authorization: 'Bearer wrong' })).status).toBe(401)
    const ok = await t.get('/v1/cron/maintain', { Authorization: 'Bearer cron-secret-xyz' })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ rolledHours: 0, sharesExpired: 0, sharesPurged: 0, pairingsDeleted: 0, lots: 51 })
    expect((await t.get('/v1/cron/maintain', ADMIN)).status).toBe(200)
  })

  it('vercel.json: 모든 경로 → /api, 서울(icn1), 하루 한 번 Cron, 빌드 결과 포함', () => {
    const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    expect(v.regions).toEqual(['icn1'])
    expect(v.rewrites).toEqual([{ source: '/(.*)', destination: '/api' }])
    expect(v.crons).toEqual([{ path: '/v1/cron/maintain', schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) }])
    expect(v.buildCommand).toBe('npm run build')
    expect(v.functions['api/index.ts'].includeFiles).toBe('dist/**')
    expect(existsSync(new URL('../api/index.ts', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../public/robots.txt', import.meta.url))).toBe(true)
    const entry = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8')
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) expect(entry).toContain(`export const ${m} = handle`)
  })
})
