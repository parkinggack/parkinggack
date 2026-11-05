import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.js'
import { MIGRATIONS, schemaVersion } from '../src/db.js'
import { openDatabase } from '../src/db-node.js'
import { NETLIFY_FUNCTION_PREFIX, createServerlessApp, netlifyHandler, netlifyScheduled } from '../src/netlify.js'

const ENV = {
  ADMIN_TOKEN: 'netlify-admin-token-0123456789',
  LOG: '0',
  DATABASE_URL: 'libsql://parkinggack-test.turso.io',
  DATABASE_AUTH_TOKEN: 't',
  ADMIN_ORIGINS: 'https://parkinggack-data.netlify.app',
  PUBLIC_WEB_BASE: 'https://parkinggack.netlify.app',
}
const SITE = 'https://parkinggack-api.netlify.app'

function app(env: Record<string, string> = {}) {
  const db = openDatabase(':memory:')
  const a = createServerlessApp({ ...ENV, ...env }, db, 'netlify')
  return { db, app: a, handler: netlifyHandler(() => a) }
}

describe('Netlify Functions', () => {
  it('설정: netlify 로 돌면 서버리스(시드 안 함 · 프록시 IP), Turso 가 아니면 시작하지 않음', () => {
    const c = loadConfig({ ...ENV, SERVERLESS: 'netlify' })
    expect(c).toMatchObject({ platform: 'netlify', serverless: true, trustProxy: true, seedOnEmpty: false, clientIpHeader: 'x-nf-client-connection-ip' })
    expect(loadConfig({ ...ENV, NETLIFY: 'true' }).platform).toBe('netlify')
    expect(loadConfig({ ...ENV, VERCEL: '1' })).toMatchObject({ platform: 'vercel', clientIpHeader: null })
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({ platform: 'node', serverless: false })
    expect(() => createServerlessApp({ ...ENV, DATABASE_URL: 'file:data/x.db' }, undefined, 'netlify')).toThrow(/Netlify/)
    expect(() => createServerlessApp({ ...ENV, ADMIN_TOKEN: 'dev-admin-token' }, undefined, 'netlify')).toThrow(ConfigError)
    expect(() => createServerlessApp(ENV, undefined, 'netlify')).not.toThrow() // 연결은 첫 요청 때
  })

  it('redirects 로 /.netlify/functions/api/… 로 와도, 원래 경로로 와도 같은 처리 + 첫 요청에서 마이그레이션', async () => {
    const { db, handler } = app()
    expect(await schemaVersion(db)).toBe(0)
    const a = await handler(new Request(`${SITE}${NETLIFY_FUNCTION_PREFIX}/health`), {})
    expect(a.status).toBe(200)
    expect(await a.json()).toMatchObject({ ok: true })
    expect(await schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    expect((await handler(new Request(`${SITE}/health`))).status).toBe(200)
    // 앞부분만 있으면 "/" 와 같다
    expect(await (await handler(new Request(`${SITE}${NETLIFY_FUNCTION_PREFIX}`))).json()).toEqual(await (await handler(new Request(`${SITE}/`))).json())
    const lots = await handler(new Request(`${SITE}${NETLIFY_FUNCTION_PREFIX}/v1/lots?limit=1`))
    expect(await lots.json()).toEqual({ lots: [] })
    const nf = await handler(new Request(`${SITE}/v1/nope`))
    expect(nf.status).toBe(404)
  })

  it('CORS: 폰(parkinggack) 은 *, 대시보드(parkinggack-data) 는 어드민 경로도', async () => {
    const { handler } = app()
    const pub = await handler(
      new Request(`${SITE}/v1/me/settings`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://parkinggack.netlify.app', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' },
      }),
    )
    expect(pub.headers.get('access-control-allow-origin')).toBe('*')
    const adm = await handler(
      new Request(`${SITE}/v1/admin/overview`, { method: 'OPTIONS', headers: { Origin: 'https://parkinggack-data.netlify.app', 'Access-Control-Request-Method': 'GET' } }),
    )
    expect(adm.headers.get('access-control-allow-origin')).toBe('https://parkinggack-data.netlify.app')
    const ok = await handler(new Request(`${SITE}/v1/admin/overview`, { headers: { Authorization: `Bearer ${ENV.ADMIN_TOKEN}` } }))
    expect(ok.status).toBe(200)
  })

  it('레이트 리밋은 x-nf-client-connection-ip 로 센다 (X-Forwarded-For 를 바꿔도 같은 사람)', async () => {
    const { handler } = app({ RATE_LIMIT_PER_MIN: '2' })
    const post = (nfIp: string, xff: string) =>
      handler(
        new Request(`${SITE}/v1/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nf-client-connection-ip': nfIp, 'X-Forwarded-For': xff },
          body: '{"kind":"car"}',
        }),
      )
    expect((await post('203.0.113.7', '1.1.1.1')).status).toBe(201)
    expect((await post('203.0.113.7', '2.2.2.2')).status).toBe(201)
    expect((await post('203.0.113.7', '3.3.3.3')).status).toBe(429)
    expect((await post('198.51.100.9', '3.3.3.3')).status).toBe(201)
  })

  it('예약 함수: 마이그레이션 확인 후 전체 정리, 결과 JSON', async () => {
    const db = openDatabase(':memory:')
    const a = createServerlessApp(ENV, db, 'netlify')
    const res = await netlifyScheduled(() => a)(new Request(`${SITE}/.netlify/functions/maintain`, { method: 'POST', body: '{"next_run":"2026-11-04T18:17:00Z"}' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rolledHours: 0, sharesExpired: 0, sharesPurged: 0, pairingsDeleted: 0, lots: 0 })
    expect(await schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
  })

  it('scripts/deploy-netlify.sh --dry-run: 세 사이트·환경변수·빌드·배포·확인을 찍고, 비밀값은 찍지 않는다', () => {
    const secrets = { NETLIFY_AUTH_TOKEN: 'nfp_secret_token_abc', DATABASE_AUTH_TOKEN: 'turso-secret-jwt-xyz', ADMIN_TOKEN: 'admin-secret-0123456789abcdef' }
    const r = spawnSync('bash', [fileURLToPath(new URL('../../../scripts/deploy-netlify.sh', import.meta.url)), '--dry-run'], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: 'libsql://parkinggack-me.turso.io', ...secrets },
      encoding: 'utf8',
    })
    expect(r.status, r.stderr).toBe(0)
    const out = r.stdout
    for (const v of Object.values(secrets)) expect(out).not.toContain(v)
    for (const site of ['parkinggack', 'parkinggack-api', 'parkinggack-data']) expect(out).toContain(`{"name":"${site}"}`)
    expect(out).toContain('ADMIN_ORIGINS=https://parkinggack-data.netlify.app')
    expect(out).toContain('PUBLIC_WEB_BASE=https://parkinggack.netlify.app')
    expect(out.match(/VITE_API_BASE=https:\/\/parkinggack-api\.netlify\.app npm run build/g)).toHaveLength(2)
    expect(out).toContain('netlify deploy --prod --no-build --dir public --functions netlify/functions --site <site-id:parkinggack-api>')
    expect(out).toContain('netlify deploy --prod --no-build --dir dist --site <site-id:parkinggack>')
    expect(out).toContain('netlify deploy --prod --no-build --dir dist --site <site-id:parkinggack-data>')
    expect(out).toContain('npm run migrate')
    expect(out).toContain('https://parkinggack-api.netlify.app/health')
    expect(out).toContain('https://parkinggack.netlify.app/pair/000000')
    // 토큰 없이도 dry-run 은 되고, 빠진 값을 알려 준다
    const bare = spawnSync('bash', [fileURLToPath(new URL('../../../scripts/deploy-netlify.sh', import.meta.url)), '--dry-run', '--only', 'web'], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: 'utf8',
    })
    expect(bare.status, bare.stderr).toBe(0)
    expect(bare.stdout).toContain('NETLIFY_AUTH_TOKEN —')
    expect(bare.stdout).not.toContain('--functions netlify/functions')
    expect(bare.stdout).toContain('netlify deploy --prod --no-build --dir dist --site <site-id:parkinggack>')
    expect(bare.stdout).not.toContain('npm run migrate')
    // 실제 실행은 토큰이 없으면 바로 멈춘다
    const real = spawnSync('bash', [fileURLToPath(new URL('../../../scripts/deploy-netlify.sh', import.meta.url))], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: 'utf8' })
    expect(real.status).toBe(1)
    expect(real.stderr).toContain('NETLIFY_AUTH_TOKEN 이 필요해요')
  })

  it('함수 파일·netlify.toml: redirects /* → api, esbuild, web-push 는 묶지 않음, 하루 한 번 예약', async () => {
    const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
    expect(toml).toMatch(/\[build\][^[]*base = "apps\/server"/)
    expect(toml).toMatch(/publish = "public"/)
    expect(toml).toMatch(/\[functions\][^[]*directory = "netlify\/functions"/)
    expect(toml).toMatch(/node_bundler = "esbuild"/)
    expect(toml).toMatch(/external_node_modules = \["web-push"\]/)
    expect(toml).toMatch(/\[\[redirects\]\]\s+from = "\/\*"\s+to = "\/\.netlify\/functions\/api\/:splat"\s+status = 200/)
    const api = await import('../netlify/functions/api.mts')
    expect(typeof api.default).toBe('function')
    const maintain = await import('../netlify/functions/maintain.mts')
    expect(typeof maintain.default).toBe('function')
    expect(maintain.config.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
    expect(existsSync(new URL('../public/robots.txt', import.meta.url))).toBe(true)
  })
})
