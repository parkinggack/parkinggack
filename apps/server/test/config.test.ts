import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, DEV_ADMIN_TOKEN, loadConfig, resolveDbUrl } from '../src/config.js'
import { MIGRATIONS, migrate, schemaVersion } from '../src/db.js'
import { openAndMigrate, openDatabase } from '../src/db-node.js'
import { createApp } from '../src/app.js'
import { Store } from '../src/store.js'
import { NOW, makeApp } from './helpers.js'

describe('설정', () => {
  it('기본값', () => {
    const c = loadConfig({})
    expect(c).toMatchObject({
      port: 8787,
      host: '0.0.0.0',
      isProduction: false,
      serverless: false,
      adminToken: DEV_ADMIN_TOKEN,
      adminTokenIsDefault: true,
      adminOrigins: ['http://localhost:5174', 'http://localhost:5173'],
      publicWebBase: 'https://parkinggack.vercel.app',
      shareTtlMs: 48 * 3_600_000,
      pairingTtlMs: 10 * 60_000,
      rateLimitPerMin: 60,
      claimFailuresPerMin: 10,
      trustProxy: false,
      seedOnEmpty: true,
      demoRolling: true,
      vapid: null,
      dbAuthToken: undefined,
    })
    expect(c.dbUrl).toBe(`file:${join(process.cwd(), 'data', 'parkinggack.db')}`)
  })

  it('DB 주소: DATABASE_URL > DB_PATH > data/parkinggack.db', () => {
    expect(resolveDbUrl({ DB_PATH: '/tmp/x.db' })).toBe('file:/tmp/x.db')
    expect(resolveDbUrl({ DB_PATH: ':memory:' })).toBe(':memory:')
    expect(resolveDbUrl({ DATABASE_URL: 'file:data/y.db', DB_PATH: '/tmp/x.db' })).toBe(`file:${join(process.cwd(), 'data', 'y.db')}`)
    expect(resolveDbUrl({ DATABASE_URL: 'libsql://parkinggack-me.turso.io' })).toBe('libsql://parkinggack-me.turso.io')
    expect(() => resolveDbUrl({ DATABASE_URL: 'postgres://x' })).toThrow(ConfigError)
    // Turso 는 토큰 필요
    expect(() => loadConfig({ DATABASE_URL: 'libsql://parkinggack-me.turso.io' })).toThrow(ConfigError)
    expect(loadConfig({ DATABASE_URL: 'libsql://parkinggack-me.turso.io', DATABASE_AUTH_TOKEN: 'tok' }).dbAuthToken).toBe('tok')
  })

  it('환경변수', () => {
    const c = loadConfig({
      PORT: '9000',
      HOST: '127.0.0.1',
      ADMIN_TOKEN: 'secret',
      ADMIN_ORIGINS: 'https://a.example, https://b.example/',
      PUBLIC_WEB_BASE: 'http://localhost:5173/',
      SHARE_TTL_HOURS: '2',
      PAIRING_TTL_MIN: '5',
      RATE_LIMIT_PER_MIN: '5',
      CLAIM_FAILURES_PER_MIN: '3',
      TRUST_PROXY: 'true',
      SEED_ON_EMPTY: '0',
      DEMO_ROLLING: 'off',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:me@example.com',
      CRON_SECRET: 'cron',
    })
    expect(c).toMatchObject({
      port: 9000,
      host: '127.0.0.1',
      adminToken: 'secret',
      adminTokenIsDefault: false,
      adminOrigins: ['https://a.example', 'https://b.example'],
      publicWebBase: 'http://localhost:5173',
      shareTtlMs: 2 * 3_600_000,
      pairingTtlMs: 5 * 60_000,
      rateLimitPerMin: 5,
      claimFailuresPerMin: 3,
      trustProxy: true,
      seedOnEmpty: false,
      demoRolling: false,
      vapid: { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:me@example.com' },
      cronSecret: 'cron',
    })
  })

  it('운영(NODE_ENV=production)·Vercel 에서는 ADMIN_TOKEN 필수 · 개발 토큰 금지 · 16자 이상', () => {
    for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
      expect(() => loadConfig(env)).toThrow(ConfigError)
      expect(() => loadConfig({ ...env, ADMIN_TOKEN: DEV_ADMIN_TOKEN })).toThrow(ConfigError)
      expect(() => loadConfig({ ...env, ADMIN_TOKEN: 'short' })).toThrow(ConfigError)
    }
    expect(loadConfig({ NODE_ENV: 'production', ADMIN_TOKEN: 'x'.repeat(24) }).isProduction).toBe(true)
    // Vercel: 시드 안 함, 프록시 뒤
    expect(loadConfig({ VERCEL: '1', ADMIN_TOKEN: 'x'.repeat(24) })).toMatchObject({ serverless: true, seedOnEmpty: false, trustProxy: true })
  })

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['SHARE_TTL_HOURS', '0'],
    ['TRUST_PROXY', 'maybe'],
    ['PUBLIC_WEB_BASE', 'ftp://x'],
    ['ADMIN_ORIGINS', 'not a url'],
    ['VAPID_PUBLIC_KEY', 'only-public'],
    ['VAPID_SUBJECT', 'me@example.com'],
  ])('잘못된 값: %s=%s', (k, v) => {
    expect(() => loadConfig({ [k]: v })).toThrow(ConfigError)
  })
})

describe('DB · 마이그레이션', () => {
  it('파일 DB: 폴더를 만들고, 다시 열어도 마이그레이션은 한 번만', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-db-'))
    try {
      const url = `file:${join(dir, 'nested', 'test.db')}`
      const db = await openAndMigrate(url)
      expect(await schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
      expect(await migrate(db)).toEqual([])
      db.close()
      const again = await openAndMigrate(url)
      expect(await schemaVersion(again)).toBe(MIGRATIONS.at(-1)!.version)
      expect((await again.execute('PRAGMA journal_mode')).rows[0][0]).toBe('wal')
      again.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('v1 DB 를 v2 로 올려도 데이터는 그대로, 새 열은 기본값', async () => {
    const db = openDatabase(':memory:')
    await migrate(db, MIGRATIONS.slice(0, 1))
    await db.execute(
      `INSERT INTO lots (id, name, lat, lng, floors, zone_scheme, created_at, updated_at) VALUES ('old', '예전 주차장', 37.5, 127, '["B1"]', '{"zones":[],"numbers":[]}', 1, 1)`,
    )
    expect(await migrate(db)).toEqual([2, 3, 4])
    const store = new Store(db, () => NOW)
    expect(await store.getLot('old')).toMatchObject({ name: '예전 주차장', category: 'OTHER', region: 'other' })
    for (const t of ['devices', 'pairings', 'my_parkings', 'push_subscriptions', 'lot_layouts', 'lot_hotspots', 'lot_overlays', 'king_participants', 'king_week_scores', 'king_weeks']) {
      expect(await store.count(`SELECT COUNT(*) AS c FROM ${t}`)).toBe(0)
    }
  })

  it('동시에 마이그레이션해도 한 번만 (서버리스 인스턴스 여럿)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-db-'))
    try {
      const url = `file:${join(dir, 'race.db')}`
      const a = openDatabase(url)
      const b = openDatabase(url)
      await a.execute('PRAGMA busy_timeout = 5000')
      await b.execute('PRAGMA busy_timeout = 5000')
      const [x, y] = await Promise.all([migrate(a), migrate(b)])
      expect([...x, ...y].sort()).toEqual([1, 2, 3, 4])
      expect(await schemaVersion(a)).toBe(4)
      a.close()
      b.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('새 버전 마이그레이션을 더하면 그것만 적용', async () => {
    const db = openDatabase(':memory:')
    await migrate(db)
    expect(await migrate(db, [...MIGRATIONS, { version: 99, name: 'test', sql: 'CREATE TABLE extra (x INTEGER)' }])).toEqual([99])
    expect(await schemaVersion(db)).toBe(99)
  })
})

describe('주기 작업 (maintenance)', () => {
  it('full: 시연 시각을 옮기고 점수를 다시 계산, DEMO_ROLLING=0 이면 안 옮김', async () => {
    const t = await makeApp()
    t.clock.t = NOW + 3 * 24 * 3_600_000
    const noRoll = createApp({ store: t.store, config: loadConfig({ DEMO_ROLLING: '0', LOG: '0' }) })
    expect((await noRoll.maintenance.full()).rolledHours).toBe(0)
    expect((await t.store.getLot('hyundai-pangyo'))!.sampleCount).toBeLessThan(1284)
    const r = await t.app.maintenance.full()
    expect(r.rolledHours).toBe(72)
    expect(r.lots).toBe(51)
    expect((await t.store.getLot('hyundai-pangyo'))!.sampleCount).toBe(1284)
  })

  it('light: 요청 때 (인스턴스마다) 10분에 한 번만 — 서버리스에 setInterval 이 없어서', async () => {
    const t = await makeApp()
    let rolls = 0
    const roll = t.store.rollDemo.bind(t.store)
    t.store.rollDemo = () => (rolls++, roll())
    t.clock.t = NOW + 2 * 3_600_000
    await t.get('/v1/lots?limit=1') // 첫 요청 → 2시간 옮김
    expect(rolls).toBe(1)
    expect(await t.store.getMeta('demo_anchor_ms')).toBe(String(NOW + 2 * 3_600_000))
    t.clock.t += 5 * 60_000
    await t.get('/v1/lots?limit=1') // 5분 뒤 → 건너뜀
    await t.get('/health') // health 는 안 함
    expect(rolls).toBe(1)
    t.clock.t += 2 * 3_600_000
    await t.get('/v1/lots?limit=1') // 10분 넘음 → 다시
    expect(rolls).toBe(2)
    expect(await t.store.getMeta('demo_anchor_ms')).toBe(String(NOW + 4 * 3_600_000))
  })
})
