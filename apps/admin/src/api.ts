/**
 * 주차각 서버 API 클라이언트. 계약: packages/api-types/index.ts (docs/api.md)
 *
 * - createApiClient: 어드민 (/v1/admin/*) — 모든 호출에 `Authorization: Bearer <토큰>`
 * - createInsightsClient: 공개 대시보드 통계 (/v1/insights/*) — 인증 없음, 집계값만
 * - 401 → onUnauthorized() (화면은 토큰을 지우고 로그인으로) 후 ApiError('unauthorized')
 * - 서버 에러 본문 `{"error":{"code","message"}}` → ApiError(code, message)
 * - 네트워크 오류(서버 꺼짐, CORS 거부) → ApiError('network')
 */
import type {
  AdminLotInput,
  AdminLotResponse,
  AdminLotsResponse,
  AdminOverviewResponse,
  AdminRecordsResponse,
  ErrorCode,
  InsightsCompareResponse,
  InsightsLotResponse,
  InsightsOverviewResponse,
  LotCategory,
} from '@api-types'
import type { AdminLotInputV11 } from './types'

export type ApiErrorCode = ErrorCode | 'network' | 'unknown'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ApiClientOptions {
  baseUrl: string
  /** 없으면 Authorization 헤더를 붙이지 않는다 (공개 API) */
  getToken?: () => string | null
  /** 401을 받으면 부른다 (토큰 지우고 로그인 화면으로) */
  onUnauthorized?: () => void
  fetchImpl?: FetchLike
}

type Query = Record<string, string | number | boolean | null | undefined>

export function buildQuery(q?: Query): string {
  if (!q) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

const KNOWN_CODES: ReadonlySet<string> = new Set([
  'bad_request', 'unauthorized', 'not_found', 'gone', 'conflict', 'rate_limited', 'internal',
])

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400: return 'bad_request'
    case 401: return 'unauthorized'
    case 404: return 'not_found'
    case 409: return 'conflict'
    case 410: return 'gone'
    case 429: return 'rate_limited'
    default: return status >= 500 ? 'internal' : 'unknown'
  }
}

/** 사람이 읽을 기본 문구 (서버가 message를 안 줬을 때) */
export function defaultMessage(code: ApiErrorCode): string {
  switch (code) {
    case 'bad_request': return '입력값을 다시 확인해 주세요'
    case 'unauthorized': return '관리자 토큰이 맞지 않아요. 다시 들어와 주세요'
    case 'not_found': return '찾는 항목이 없어요'
    case 'gone': return '기간이 지난 항목이에요'
    case 'conflict': return '같은 id가 이미 있어요'
    case 'rate_limited': return '요청이 너무 잦아요. 잠시 뒤 다시 해 주세요'
    case 'internal': return '서버에 문제가 생겼어요. 잠시 뒤 다시 해 주세요'
    case 'network': return '서버에 연결할 수 없어요'
    default: return '알 수 없는 응답이에요'
  }
}

async function readError(res: Response): Promise<ApiError> {
  let code: ApiErrorCode = codeForStatus(res.status)
  let message = ''
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body?.error?.code && KNOWN_CODES.has(body.error.code)) code = body.error.code as ApiErrorCode
    if (typeof body?.error?.message === 'string') message = body.error.message
  } catch {
    /* 본문이 JSON이 아니면 상태 코드로만 */
  }
  return new ApiError(res.status, code, message || defaultMessage(code))
}

function createRequester(opts: ApiClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const doFetch: FetchLike = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    const token = opts.getToken?.() ?? null
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res: Response
    try {
      res = await doFetch(base + path + buildQuery(query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'network', `${defaultMessage('network')} (${base})`)
    }

    if (res.status === 401) {
      const err = await readError(res)
      opts.onUnauthorized?.()
      throw err
    }
    if (!res.ok) throw await readError(res)
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new ApiError(res.status, 'unknown', '서버 응답을 읽을 수 없어요')
    }
  }
  return { base, request }
}

export function createApiClient(opts: ApiClientOptions) {
  const { base, request } = createRequester(opts)
  const lotPath = (id: string) => `/v1/admin/lots/${encodeURIComponent(id)}`

  return {
    baseUrl: base,
    health: () => request<{ ok: boolean; version: string }>('GET', '/health'),
    overview: () => request<AdminOverviewResponse>('GET', '/v1/admin/overview'),
    listLots: (q?: string) => request<AdminLotsResponse>('GET', '/v1/admin/lots', undefined, { q }),
    createLot: (input: AdminLotInput | AdminLotInputV11) => request<AdminLotResponse>('POST', '/v1/admin/lots', input),
    updateLot: (id: string, patch: Partial<AdminLotInput> | Partial<AdminLotInputV11>) => request<AdminLotResponse>('PUT', lotPath(id), patch),
    deleteLot: (id: string) => request<void>('DELETE', lotPath(id)),
    lotRecords: (id: string, limit = 100) =>
      request<AdminRecordsResponse>('GET', `${lotPath(id)}/records`, undefined, { limit }),
    recompute: () => request<{ lots: number }>('POST', '/v1/admin/recompute'),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/** 대시보드 기본 지역 (지금은 판교 하나) */
export const DEFAULT_REGION = 'pangyo'

export interface InsightsQuery {
  days?: number
  region?: string
}

/**
 * 공개 대시보드 통계 (D-10 난이도 한눈에 · D-11 주차장 상세 · D-12 내보내기 · D-03 비교표). 인증 헤더 없이 GET만 — 서버 CORS는 공개 GET에 `*`.
 * category 는 하나 또는 여러 개(쉼표로 이어 보냄). 서버가 하나만 받으면 화면은 전체를 받아 거른다.
 */
export function createInsightsClient(opts: Omit<ApiClientOptions, 'getToken' | 'onUnauthorized'>) {
  const { base, request } = createRequester({ baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl })
  return {
    baseUrl: base,
    overview: (q: InsightsQuery = {}) =>
      request<InsightsOverviewResponse>('GET', '/v1/insights/overview', undefined, { region: q.region ?? DEFAULT_REGION, days: q.days ?? 30 }),
    /**
     * 주차장 상세. floor 를 주면 동선(overlays)은 그 층 하나만, maxPaths 는 동선 수 상한 (서버 기본 300, 1~2000).
     * 도면(layout)·후진 잦은 곳·층별 평균·히트맵은 늘 전 층. 동선이 필요 없으면 maxPaths: 1 로 가볍게.
     */
    lot: (id: string, q: Pick<InsightsQuery, 'days'> & { floor?: string | null; maxPaths?: number } = {}) =>
      request<InsightsLotResponse>('GET', `/v1/insights/lots/${encodeURIComponent(id)}`, undefined, {
        days: q.days ?? 30,
        floor: q.floor,
        maxPaths: q.maxPaths,
      }),
    compare: (q: InsightsQuery & { category?: LotCategory | LotCategory[] | null } = {}) =>
      request<InsightsCompareResponse>('GET', '/v1/insights/compare', undefined, {
        region: q.region ?? DEFAULT_REGION,
        category: Array.isArray(q.category) ? q.category.join(',') : q.category,
        days: q.days ?? 30,
      }),
  }
}

export type InsightsClient = ReturnType<typeof createInsightsClient>

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
