/**
 * 환경변수 → 설정. 잘못된 값이면 시작하지 않는다 (ConfigError).
 * 표는 README.md "환경변수" · 배포는 docs/deploy.md.
 */
import { isAbsolute, resolve } from 'node:path'

export const DEV_ADMIN_TOKEN = 'dev-admin-token'

export type Platform = 'node' | 'vercel' | 'netlify'

/** SERVERLESS=vercel|netlify (serverless.ts 가 넣음) > NETLIFY > VERCEL */
export function detectPlatform(env: NodeJS.ProcessEnv): Platform {
  const s = env.SERVERLESS?.trim().toLowerCase()
  if (s === 'netlify' || s === 'vercel') return s
  if (env.NETLIFY) return 'netlify'
  if (env.VERCEL) return 'vercel'
  return 'node'
}

export interface Config {
  port: number
  host: string
  /** libSQL 주소: file:/…/parkinggack.db (로컬) · libsql://….turso.io (Turso) · :memory: */
  dbUrl: string
  dbAuthToken: string | undefined
  nodeEnv: string
  isProduction: boolean
  /** 어디서 도나: node(로컬·Docker) · vercel(Vercel Functions) · netlify(Netlify Functions) */
  platform: Platform
  /** Vercel·Netlify Functions 안에서 도는 중 (시드·setInterval 안 함) */
  serverless: boolean
  adminToken: string
  /** 개발용 기본 토큰을 쓰는 중 (시작할 때 크게 경고) */
  adminTokenIsDefault: boolean
  adminOrigins: string[]
  /** 짧은 링크·페어링 주소 앞부분 — `${publicWebBase}/s/${code}`, `${publicWebBase}/pair/${code}` */
  publicWebBase: string
  shareTtlMs: number
  pairingTtlMs: number
  /** 공개 POST, IP당 분당 */
  rateLimitPerMin: number
  /** 페어링 코드 틀린 시도, IP당 분당 (6자리 숫자 무차별 대입 막기) */
  claimFailuresPerMin: number
  /** 프록시(Vercel·Netlify·Fly.io·Render·Railway) 뒤라면 X-Forwarded-For 로 IP를 본다 */
  trustProxy: boolean
  /** trustProxy 일 때 X-Forwarded-For 보다 먼저 볼 헤더 (Netlify: x-nf-client-connection-ip — 클라이언트가 바꿀 수 없음) */
  clientIpHeader: string | null
  /** DB가 비어 있으면 시연 데이터를 넣는다 (로컬 Node 서버만 — Vercel 에서는 npm run seed) */
  seedOnEmpty: boolean
  /** 시연 기록 시각을 현재에 맞춰 옮긴다 (30일 대수 등 시연 수치가 날이 지나도 그대로) */
  demoRolling: boolean
  /** 웹 푸시 VAPID — 셋 다 있어야 켜짐 */
  vapid: { publicKey: string; privateKey: string; subject: string } | null
  /** Vercel Cron 이 보내는 `Authorization: Bearer <CRON_SECRET>` */
  cronSecret: string | undefined
  log: boolean
}

export class ConfigError extends Error {}

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const raw = env[key]
  if (raw == null || raw === '') return def
  const v = Number(raw)
  if (!Number.isInteger(v) || v < min || v > max) throw new ConfigError(`${key}=${raw} — ${min}~${max} 사이 정수여야 해요`)
  return v
}

function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase()
  if (raw == null || raw === '') return def
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  throw new ConfigError(`${key}=${env[key]} — true/false 로 적어 주세요`)
}

function url(raw: string, key: string): string {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
  } catch {
    throw new ConfigError(`${key}=${raw} — http(s) 주소여야 해요`)
  }
  return raw.replace(/\/+$/, '')
}

/** DATABASE_URL > DB_PATH(파일 경로) > ./data/parkinggack.db */
export function resolveDbUrl(env: NodeJS.ProcessEnv): string {
  const u = env.DATABASE_URL?.trim()
  if (u) {
    if (u === ':memory:' || /^(libsql|https?|wss?):\/\//.test(u)) return u
    if (u.startsWith('file:')) {
      const p = u.slice('file:'.length)
      return p === ':memory:' ? ':memory:' : `file:${isAbsolute(p) ? p : resolve(p)}`
    }
    throw new ConfigError(`DATABASE_URL=${u} — file:…, libsql://… 또는 :memory: 여야 해요`)
  }
  const p = env.DB_PATH?.trim()
  if (p === ':memory:') return ':memory:'
  return `file:${resolve(p || 'data/parkinggack.db')}`
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development'
  const isProduction = nodeEnv === 'production'
  const platform = detectPlatform(env)
  const serverless = platform !== 'node'

  const tokenRaw = env.ADMIN_TOKEN?.trim() ?? ''
  if (isProduction || serverless) {
    if (!tokenRaw) throw new ConfigError('운영(NODE_ENV=production·Vercel·Netlify)에서는 ADMIN_TOKEN 이 꼭 필요해요 (예: openssl rand -hex 24)')
    if (tokenRaw === DEV_ADMIN_TOKEN) throw new ConfigError('운영 환경에서 개발용 ADMIN_TOKEN(dev-admin-token)은 쓸 수 없어요')
    if (tokenRaw.length < 16) throw new ConfigError('운영 환경 ADMIN_TOKEN 은 16자 이상으로 해 주세요')
  }
  const adminToken = tokenRaw || DEV_ADMIN_TOKEN

  const origins = (env.ADMIN_ORIGINS ?? 'http://localhost:5174,http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  for (const o of origins) url(o, 'ADMIN_ORIGINS')

  const dbUrl = resolveDbUrl(env)
  const dbAuthToken = env.DATABASE_AUTH_TOKEN?.trim() || undefined
  if (/^(libsql|https?|wss?):\/\//.test(dbUrl) && !dbAuthToken && !/localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new ConfigError('Turso(libsql://) 를 쓰려면 DATABASE_AUTH_TOKEN 이 필요해요 (turso db tokens create parkinggack)')
  }

  const vp = env.VAPID_PUBLIC_KEY?.trim()
  const vk = env.VAPID_PRIVATE_KEY?.trim()
  const vs = env.VAPID_SUBJECT?.trim()
  if ((vp || vk) && !(vp && vk)) throw new ConfigError('VAPID_PUBLIC_KEY 와 VAPID_PRIVATE_KEY 는 같이 정해 주세요 (npx web-push generate-vapid-keys)')
  if (vs && !/^(mailto:|https:\/\/)/.test(vs)) throw new ConfigError('VAPID_SUBJECT 는 mailto: 나 https:// 로 시작해야 해요')

  return {
    port: int(env, 'PORT', 8787, 1, 65535),
    host: env.HOST || '0.0.0.0',
    dbUrl,
    dbAuthToken,
    nodeEnv,
    isProduction,
    platform,
    serverless,
    adminToken,
    adminTokenIsDefault: adminToken === DEV_ADMIN_TOKEN,
    adminOrigins: origins,
    publicWebBase: url(env.PUBLIC_WEB_BASE || 'https://parkinggack.vercel.app', 'PUBLIC_WEB_BASE'),
    shareTtlMs: int(env, 'SHARE_TTL_HOURS', 48, 1, 24 * 30) * 3_600_000,
    pairingTtlMs: int(env, 'PAIRING_TTL_MIN', 10, 1, 60) * 60_000,
    rateLimitPerMin: int(env, 'RATE_LIMIT_PER_MIN', 60, 1, 100_000),
    claimFailuresPerMin: int(env, 'CLAIM_FAILURES_PER_MIN', 10, 1, 10_000),
    trustProxy: bool(env, 'TRUST_PROXY', serverless),
    clientIpHeader: platform === 'netlify' ? 'x-nf-client-connection-ip' : null,
    seedOnEmpty: bool(env, 'SEED_ON_EMPTY', !serverless),
    demoRolling: bool(env, 'DEMO_ROLLING', true),
    vapid: vp && vk ? { publicKey: vp, privateKey: vk, subject: vs || 'mailto:parkinggack@example.com' } : null,
    cronSecret: env.CRON_SECRET?.trim() || undefined,
    log: bool(env, 'LOG', nodeEnv !== 'test'),
  }
}
