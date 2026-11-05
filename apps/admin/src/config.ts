/** 빌드 때 정해지는 설정 (Vite 환경변수). 화면 코드는 여기서만 읽는다. */

const env = import.meta.env

export const DEFAULT_API_BASE = 'http://localhost:8787'
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자'

export function normalizeBase(url: string | undefined | null): string {
  const v = (url ?? '').trim()
  return (v || DEFAULT_API_BASE).replace(/\/+$/, '')
}

export const config = {
  apiBase: normalizeBase(env.VITE_API_BASE),
  /** 빌드부터 시연 모드 (VITE_MOCK=1, `npm run dev:mock`) */
  mockBuild: env.VITE_MOCK === '1' || env.VITE_MOCK === 'true',
  /** null 이면 타일 없이 SVG 지도 */
  tileUrl: env.VITE_TILE_URL === 'none' ? null : env.VITE_TILE_URL || DEFAULT_TILE_URL,
  tileAttribution: env.VITE_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION,
  /**
   * 대시보드 머리글 '시연용 예시 데이터' 표시. 서버 시드도 시연용 합성 기록이라 기본은 켬
   * (계약에 '시연 데이터인지' 필드가 없어서 빌드 설정으로 정한다). VITE_DEMO_BADGE=0 이면 끔
   */
  demoBadge: env.VITE_DEMO_BADGE !== '0' && env.VITE_DEMO_BADGE !== 'false',
}

/** 서버 기본 개발 토큰 (apps/server ADMIN_TOKEN 기본값, 시연 모드도 같은 값) */
export const DEV_ADMIN_TOKEN = 'dev-admin-token'
