/**
 * 이 폰에 남기는 앱 상태 (localStorage, 키는 pg:*). 계정이 없어서 '연결된 차'가 곧 내 데이터의 열쇠다.
 *
 * - token: 페어링 claim으로 받은 폰 기기 토큰 → Authorization: Device <token>
 * - prefs: M-12(익명 기록), M-14·M-40(알림), M-40(어두운 화면·운전 경력)
 *   ※ 익명 기록·운전 경력은 차가 쓰는 값인데 v1.1 계약에 폰 → 차로 보내는 API가 없어 이 폰에만 저장한다 (README 참고)
 * - demo: '시연 데이터로 둘러보기' — 서버 대신 mock/mockApi
 */
import type { DrivingExperience, PairedCar } from '@api-types'
import { ENV_MOCK } from './config'
import { getItem, getJSON, setItem, setJSON } from './storage'

export type Theme = 'system' | 'light' | 'dark'
export type OnOff = 'on' | 'off'

export interface Prefs {
  /** 익명 기록 보내기 (M-12 보낼게요 / 나만 볼게요) — null = 아직 안 고름 */
  share: OnOff | null
  /** 주차 끝나면 알림 (M-14) — null = 아직 안 고름 */
  notify: OnOff | null
  theme: Theme
  experience: DrivingExperience | null
}

export interface Session {
  token: string | null
  car: PairedCar | null
  /** 첫 실행(M-10~M-14)을 끝냈거나 건너뜀 */
  onboarded: boolean
  /** 시연 데이터 (서버 없이) */
  demo: boolean
  prefs: Prefs
}

const K = {
  token: 'pg:token',
  car: 'pg:car',
  onboarded: 'pg:onboarded',
  demo: 'pg:demo',
  share: 'pg:pref:share',
  notify: 'pg:pref:notify',
  theme: 'pg:pref:theme',
  experience: 'pg:pref:experience',
} as const

const EXPERIENCES: DrivingExperience[] = ['UNDER_1Y', 'Y1_3', 'Y3_10', 'OVER_10Y', 'UNKNOWN']

const isCar = (v: unknown): v is PairedCar => {
  const c = v as PairedCar
  return !!c && typeof c === 'object' && typeof c.deviceId === 'string' && typeof c.pairedAt === 'string'
}
const onOff = (v: string | null): OnOff | null => (v === 'on' || v === 'off' ? v : null)

function read(): Session {
  const theme = getItem(K.theme)
  const exp = getItem(K.experience) as DrivingExperience | null
  return {
    token: getItem(K.token),
    car: getJSON(K.car, isCar),
    onboarded: getItem(K.onboarded) === '1',
    demo: ENV_MOCK || getItem(K.demo) === '1',
    prefs: {
      share: onOff(getItem(K.share)),
      notify: onOff(getItem(K.notify)),
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      experience: exp && EXPERIENCES.includes(exp) ? exp : null,
    },
  }
}

type Listener = (s: Session) => void
let current: Session = read()
const listeners = new Set<Listener>()

function emit() {
  current = read()
  listeners.forEach((l) => l(current))
}

export const session = {
  get: (): Session => current,
  /** 다른 탭에서 바뀌었거나 테스트에서 저장소를 바꾼 뒤 */
  reload() {
    emit()
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  paired(): boolean {
    return !!current.token
  },
  setPaired(token: string, car: PairedCar | null) {
    setItem(K.token, token)
    setJSON(K.car, car)
    emit()
  },
  setCar(car: PairedCar | null) {
    setJSON(K.car, car)
    emit()
  },
  clearPairing() {
    setItem(K.token, null)
    setJSON(K.car, null)
    emit()
  },
  setOnboarded(v = true) {
    setItem(K.onboarded, v ? '1' : null)
    emit()
  },
  setDemo(v: boolean) {
    setItem(K.demo, v ? '1' : null)
    emit()
  },
  setPref<K2 extends keyof Prefs>(key: K2, value: Prefs[K2]) {
    setItem(K[key], value == null || value === 'system' ? null : String(value))
    emit()
  },
}

/** 운전 경력 → 화면 글자 */
export const EXPERIENCE_LABEL: Record<DrivingExperience, string> = {
  UNDER_1Y: '1년 미만',
  Y1_3: '1~3년',
  Y3_10: '3~10년',
  OVER_10Y: '10년 넘게',
  UNKNOWN: '말하지 않을게요',
}

export const EXPERIENCE_ORDER = EXPERIENCES

/** 다크 테마가 지금 켜져 있는지 (system이면 기기 설정) */
export function effectiveDark(theme: Theme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]:not([media])')
  if (meta) meta.setAttribute('content', effectiveDark(theme) ? '#1e1e1e' : '#ffffff')
}
