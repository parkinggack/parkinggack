/**
 * 화면이 바뀔 때 어떻게 움직일지 — 순수 함수 (테스트: transition.test.ts). 실제로 움직이는 건 ui/Stage.tsx.
 *
 *   push  앞으로: 새 화면이 오른쪽에서 밀려 들어오고, 이전 화면은 왼쪽으로 조금 밀리며 옅어짐
 *   pop   뒤로: 그 반대 (떠나는 화면이 오른쪽으로 나가고, 아래 화면이 왼쪽에서 제자리로)
 *   tab   아래 탭끼리 (홈·주차장·주차왕·기록·설정): 미끄러지지 않고 옅게 나타나며 내용이 살짝 위로 (탭바는 그대로)
 *   rise  모달 같은 화면(M-53 주간 결과, 코드 입력)이 아래에서 올라옴 / sink 닫힐 때 내려감
 *   fade  그 밖의 바꿔 놓기 (들어갈 수 없는 화면을 바꿀 때 등): tab 과 같은 움직임
 *   none  첫 화면, 같은 화면, '동작 줄이기'
 */
import { tabOf, type NavKind, type Route } from '../router'
import { SPRING_POP, SPRING_SCREEN, SPRING_SHEET, type Spring } from './spring'

export type TransitionKind = 'none' | 'push' | 'pop' | 'tab' | 'rise' | 'sink' | 'fade'

/** 아래에서 올라오는 화면 */
export function isModalRoute(r: Route): boolean {
  return r.name === 'king-result' || r.name === 'connect-code'
}

/** 첫 실행·연결 흐름 (바꿔 놓기로 다음 단계에 가면 앞으로 가는 것처럼) */
const FLOW = new Set<Route['name']>(['start', 'start-spot', 'start-share', 'connect', 'connect-code', 'connected', 'pair'])

/** 탭 아래 깊이 들어간 화면 (바꿔 놓기로 탭 화면에 가면 뒤로 가는 것처럼 — 예: '차 찾았어요' → 홈) */
const DETAIL = new Set<Route['name']>(['parking', 'link', 'short', 'lot', 'lot-easier', 'record', 'king-me', 'experience'])

export function transitionFor(from: Route | null, to: Route, nav: NavKind, opts: { reducedMotion?: boolean } = {}): TransitionKind {
  if (!from || nav === 'initial' || opts.reducedMotion) return 'none'
  if (from.name === to.name && JSON.stringify(from) === JSON.stringify(to)) return 'none'
  if (tabOf(from) && tabOf(to)) return 'tab'
  if (nav === 'pop') return isModalRoute(from) ? 'sink' : 'pop'
  if (nav === 'push') return isModalRoute(to) ? 'rise' : 'push'
  // replace
  if (isModalRoute(to) && !isModalRoute(from)) return 'rise'
  if (isModalRoute(from) && !isModalRoute(to) && !FLOW.has(to.name)) return 'sink'
  if (tabOf(to) && DETAIL.has(from.name)) return 'pop'
  if (FLOW.has(from.name) && to.name !== 'start') return 'push'
  return 'fade'
}

/** 한 겹(layer)의 움직임 — Web Animations 키프레임 + 쓸 스프링(없으면 opacity 용 ease-out) */
export interface Track {
  keyframes: Keyframe[]
  /** 스프링 이징으로 (transform). null 이면 ease-out 짧게 (opacity) */
  spring: Spring | null
  /** spring 이 null 일 때 길이 (ms) */
  ms?: number
}

export interface LayerMotion {
  /** 위에 그릴지 */
  z: number
  /** 겹 전체 */
  tracks: Track[]
  /** 겹 안의 내용(탭바·아래 버튼 빼고)만 — tab/fade 의 '살짝 위로' */
  content?: Track[]
}

export interface Motion {
  enter: LayerMotion
  exit: LayerMotion
}

const BACK_SHIFT = '-25%'
const DIM = 0.35

export function motionFor(kind: TransitionKind): Motion | null {
  switch (kind) {
    case 'push':
      return {
        enter: { z: 2, tracks: [{ keyframes: [{ transform: 'translate3d(100%, 0, 0)' }, { transform: 'translate3d(0, 0, 0)' }], spring: SPRING_SCREEN }] },
        exit: {
          z: 1,
          tracks: [
            { keyframes: [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${BACK_SHIFT}, 0, 0)` }], spring: SPRING_SCREEN },
            { keyframes: [{ opacity: 1 }, { opacity: DIM }], spring: null, ms: 360 },
          ],
        },
      }
    case 'pop':
      return {
        enter: {
          z: 1,
          tracks: [
            { keyframes: [{ transform: `translate3d(${BACK_SHIFT}, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], spring: SPRING_SCREEN },
            { keyframes: [{ opacity: DIM }, { opacity: 1 }], spring: null, ms: 360 },
          ],
        },
        exit: { z: 2, tracks: [{ keyframes: [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(100%, 0, 0)' }], spring: SPRING_SCREEN }] },
      }
    case 'rise':
      return {
        enter: { z: 2, tracks: [{ keyframes: [{ transform: 'translate3d(0, 100%, 0)' }, { transform: 'translate3d(0, 0, 0)' }], spring: SPRING_SHEET }] },
        exit: { z: 1, tracks: [{ keyframes: [{ opacity: 1 }, { opacity: 0.6 }], spring: null, ms: 420 }] },
      }
    case 'sink':
      return {
        enter: { z: 1, tracks: [{ keyframes: [{ opacity: 0.6 }, { opacity: 1 }], spring: null, ms: 420 }] },
        exit: { z: 2, tracks: [{ keyframes: [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, 100%, 0)' }], spring: SPRING_SHEET }] },
      }
    case 'tab':
    case 'fade':
      return {
        enter: {
          z: 2,
          tracks: [{ keyframes: [{ opacity: 0 }, { opacity: 1 }], spring: null, ms: kind === 'tab' ? 200 : 240 }],
          content: [{ keyframes: [{ transform: `translate3d(0, ${kind === 'tab' ? 14 : 10}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], spring: SPRING_POP }],
        },
        // 떠나는 탭은 그대로 두고 위에서 새 탭이 옅게 덮는다 (탭바가 깜빡이지 않게)
        exit: { z: 1, tracks: [] },
      }
    case 'none':
      return null
  }
}
