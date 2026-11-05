/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 주차각 서버 주소. 기본 http://localhost:8787 */
  readonly VITE_API_BASE?: string
  /** '1' 이면 서버 없이 시연 데이터 (src/mock) */
  readonly VITE_MOCK?: string
  /** 지도 타일 URL 템플릿. 'none' 이면 단순 그림(SVG) 지도 */
  readonly VITE_TILE_URL?: string
  readonly VITE_TILE_ATTRIBUTION?: string
  /** '0' 이면 대시보드 머리글의 '시연용 예시 데이터' 표시를 끈다 (실제 기록만 쌓인 뒤). 기본 켜짐 */
  readonly VITE_DEMO_BADGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
