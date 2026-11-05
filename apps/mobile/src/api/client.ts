/**
 * 주차각 서버 API 클라이언트 (계약: packages/api-types/index.ts, 설명: docs/api.md).
 *
 * - 폰 기기 토큰은 `Authorization: Device <token>` (페어링 claim 응답으로 받음 — /v1/devices 호출 없음)
 * - 실패는 모두 ApiError: HTTP 오류는 서버의 {error:{code,message}}, 네트워크 끊김·시간 초과는 code 'offline'
 * - 같은 인터페이스(Api)를 시연 데이터(mock/mockApi.ts)도 구현한다 → 화면은 어느 쪽인지 모른다
 */
import type {
  ClaimPairingResponse,
  CurrentParkingResponse,
  EasierLotsResponse,
  ErrorCode,
  GetShareResponse,
  KingBoardResponse,
  KingJoinRequest,
  KingMeResponse,
  KingNicknameResponse,
  KingResultResponse,
  ListLotsResponse,
  LotDetailResponse,
  MatchLotResponse,
  MeResponse,
  MyParking,
  MyParkingsResponse,
  MyStatsResponse,
} from '@api-types'

export type ApiErrorCode = ErrorCode | 'offline' | 'bad_response'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
  get offline() {
    return this.code === 'offline'
  }
}

export interface PushSubscriptionBody {
  endpoint: string
  expirationTime?: number | null
  keys?: Record<string, string>
}

export interface LotsQuery {
  lat?: number
  lng?: number
  radius?: number
  limit?: number
}

/** 화면이 쓰는 서버 호출 전부 */
export interface Api {
  /** POST /v1/pairings/:code/claim (인증 없음) */
  claimPairing(code: string, phoneName?: string | null): Promise<ClaimPairingResponse>
  /** GET /v1/me */
  me(): Promise<MeResponse>
  /** DELETE /v1/me — 연결 끊기 (폰 토큰 폐기) */
  unpair(): Promise<void>
  /** GET /v1/me/parkings/current */
  currentParking(): Promise<MyParking | null>
  /** GET /v1/me/parkings?limit&before */
  parkings(opts?: { limit?: number; before?: string | null }): Promise<MyParkingsResponse>
  /** POST /v1/me/parkings/:id/found */
  found(id: string): Promise<MyParking>
  /** GET /v1/me/stats */
  stats(): Promise<MyStatsResponse>
  /** GET /v1/lots?lat&lng&radius&limit */
  lots(q?: LotsQuery): Promise<ListLotsResponse['lots']>
  /** GET /v1/lots/:id */
  lot(id: string): Promise<LotDetailResponse['lot']>
  /** GET /v1/lots/:id/easier */
  easier(id: string, opts?: { max?: number; radius?: number }): Promise<EasierLotsResponse['suggestions']>
  /** GET /v1/lots/match?name&lat&lng */
  match(name: string, at?: { lat: number; lng: number }): Promise<MatchLotResponse>
  /** GET /v1/shares/:code (짧은 링크 /s/:code) */
  share(code: string): Promise<GetShareResponse>
  /** GET /v1/push/key → VAPID 공개 키. 서버에 없으면 null (404) */
  pushKey(): Promise<string | null>
  /** POST /v1/me/push */
  pushSubscribe(sub: PushSubscriptionBody): Promise<void>
  /** DELETE /v1/me/push */
  pushUnsubscribe(): Promise<void>

  // v1.2 주차왕
  /** GET /v1/king/nickname?region= → 새 닉네임 후보 (인증 없음, 저장 안 함 — M-52 다시 뽑기) */
  kingNickname(region?: string | null): Promise<string>
  /** POST /v1/me/king/join → { me } */
  kingJoin(body: KingJoinRequest): Promise<KingMeResponse>
  /** DELETE /v1/me/king (그만두기: 순위판에서 빠짐, 기록은 그대로) */
  kingLeave(): Promise<void>
  /** GET /v1/me/king — M-50 위 카드 · M-51 */
  kingMe(): Promise<KingMeResponse>
  /** GET /v1/me/king/board — M-50 목록 (상위 5 + 내 앞뒤) */
  kingBoard(): Promise<KingBoardResponse>
  /** GET /v1/me/king/results/last — M-53. 지난주 점수가 없으면(404) null */
  kingResultLast(): Promise<KingResultResponse | null>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface HttpApiOptions {
  base: string
  /** 지금 저장된 폰 토큰 (없으면 null) */
  token: () => string | null
  fetch?: FetchLike
  timeoutMs?: number
  /** navigator.onLine 대신 (테스트) */
  online?: () => boolean
}

const OFFLINE_MESSAGE = '인터넷에 연결되지 않았어요'

export function createHttpApi(opts: HttpApiOptions): Api {
  const base = opts.base.replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? 10_000
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init))
  const online = opts.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))

  async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    if (!online()) throw new ApiError(0, 'offline', OFFLINE_MESSAGE)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = auth ? opts.token() : null
    if (token) headers.Authorization = `Device ${token}`

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    let res: Response
    try {
      res = await doFetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      // TypeError(Failed to fetch, CORS 포함) · AbortError(시간 초과) — 화면에서는 모두 '연결 안 됨'
      throw new ApiError(0, 'offline', OFFLINE_MESSAGE)
    } finally {
      if (timer) clearTimeout(timer)
    }

    if (res.status === 204) return undefined as T
    const text = await res.text().catch(() => '')
    let data: unknown = undefined
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = undefined
      }
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error
      throw new ApiError(res.status, (err?.code as ErrorCode) || codeForStatus(res.status), err?.message || `HTTP ${res.status}`)
    }
    if (data === undefined) {
      if (!text) return undefined as T
      throw new ApiError(res.status, 'bad_response', '서버 응답을 읽지 못했어요')
    }
    return data as T
  }

  const enc = encodeURIComponent
  const query = (q: Record<string, string | number | null | undefined>) => {
    const parts = Object.entries(q)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${enc(k)}=${enc(String(v))}`)
    return parts.length ? `?${parts.join('&')}` : ''
  }

  return {
    claimPairing: (code, phoneName) =>
      request<ClaimPairingResponse>('POST', `/v1/pairings/${enc(code)}/claim`, { phoneName: phoneName ?? null }, false),
    me: () => request<MeResponse>('GET', '/v1/me'),
    unpair: () => request<void>('DELETE', '/v1/me'),
    currentParking: async () => (await request<CurrentParkingResponse>('GET', '/v1/me/parkings/current')).parking,
    parkings: (o = {}) => request<MyParkingsResponse>('GET', `/v1/me/parkings${query({ limit: o.limit ?? 20, before: o.before })}`),
    found: async (id) => (await request<{ parking: MyParking }>('POST', `/v1/me/parkings/${enc(id)}/found`, {})).parking,
    stats: () => request<MyStatsResponse>('GET', '/v1/me/stats'),
    lots: async (q = {}) => (await request<ListLotsResponse>('GET', `/v1/lots${query({ lat: q.lat, lng: q.lng, radius: q.radius, limit: q.limit })}`, undefined, false)).lots,
    lot: async (id) => (await request<LotDetailResponse>('GET', `/v1/lots/${enc(id)}`, undefined, false)).lot,
    easier: async (id, o = {}) =>
      (await request<EasierLotsResponse>('GET', `/v1/lots/${enc(id)}/easier${query({ max: o.max ?? 3, radius: o.radius })}`, undefined, false)).suggestions,
    match: (name, at) => request<MatchLotResponse>('GET', `/v1/lots/match${query({ name, lat: at?.lat, lng: at?.lng })}`, undefined, false),
    share: (code) => request<GetShareResponse>('GET', `/v1/shares/${enc(code)}`, undefined, false),
    pushKey: async () => {
      try {
        const r = await request<{ publicKey?: string }>('GET', '/v1/push/key', undefined, false)
        return typeof r?.publicKey === 'string' && r.publicKey ? r.publicKey : null
      } catch (e) {
        // 서버에 키가 없거나(404) 예전 서버(엔드포인트 없음) → 알림은 앱을 열어 둘 때 확인하는 방식으로
        if (e instanceof ApiError && !e.offline) return null
        throw e
      }
    },
    pushSubscribe: (sub) => request<void>('POST', '/v1/me/push', sub),
    pushUnsubscribe: () => request<void>('DELETE', '/v1/me/push'),

    kingNickname: async (region) => {
      const r = await request<KingNicknameResponse>('GET', `/v1/king/nickname${query({ region })}`, undefined, false)
      if (typeof r?.nickname !== 'string' || !r.nickname) throw new ApiError(200, 'bad_response', '서버 응답을 읽지 못했어요')
      return r.nickname
    },
    kingJoin: async (body) => {
      const r = await request<{ me?: KingMeResponse } & Partial<KingMeResponse>>('POST', '/v1/me/king/join', body)
      // 계약은 { me } — 예전 모양(KingMeResponse 그대로)도 받아 줌
      const me = r?.me ?? (typeof r?.joined === 'boolean' ? (r as KingMeResponse) : null)
      if (!me) throw new ApiError(200, 'bad_response', '서버 응답을 읽지 못했어요')
      return me
    },
    kingLeave: () => request<void>('DELETE', '/v1/me/king'),
    kingMe: () => request<KingMeResponse>('GET', '/v1/me/king'),
    kingBoard: () => request<KingBoardResponse>('GET', '/v1/me/king/board'),
    kingResultLast: async () => {
      try {
        return await request<KingResultResponse>('GET', '/v1/me/king/results/last')
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_found') return null
        throw e
      }
    },
  }
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'bad_request'
    case 401:
    case 403:
      return 'unauthorized'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 410:
      return 'gone'
    case 429:
      return 'rate_limited'
    default:
      return 'internal'
  }
}

/** 화면에 보일 한 줄 (운전자를 탓하지 않는 말) */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.offline) return '인터넷에 연결되면 다시 불러올게요'
    if (e.code === 'not_found') return '찾을 수 없어요'
    if (e.code === 'gone') return '시간이 지나 사라졌어요'
    if (e.code === 'rate_limited') return '잠시 뒤에 다시 해주세요'
  }
  return '잠시 뒤에 다시 해주세요'
}
