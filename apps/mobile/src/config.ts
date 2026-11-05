/**
 * 빌드 때 정하는 값 (Vite 환경 변수 — .env.local 또는 배포 설정에서).
 *
 * - VITE_API_BASE: 주차각 서버 주소 (끝 / 없이). 기본 http://localhost:8787 (apps/server 로컬)
 * - VITE_MOCK=1: 서버 없이 브라우저 안의 시연 데이터로만 동작 (시안과 같은 값). 앱 안의 '시연 데이터로 둘러보기'도 같은 데이터
 */
export const API_BASE: string = String(import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/+$/, '')

export const ENV_MOCK: boolean = import.meta.env.VITE_MOCK === '1'

/** 판교역 — 위치 권한이 없을 때 주차장 목록의 기준점 */
export const DEFAULT_CENTER = { label: '판교역', lat: 37.3947, lng: 127.1112 } as const

/** 지금 주차 중 확인 주기 (웹 푸시가 없을 때) */
export const POLL_MS = 30_000

export const APP_VERSION = '1.0.0'
