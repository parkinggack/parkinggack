/**
 * 지금 쓸 Api: 시연 모드(VITE_MOCK=1 또는 '시연 데이터로 둘러보기')면 브라우저 안의 시연 데이터, 아니면 서버.
 * 화면은 api() 를 부를 때마다 지금 모드의 것을 받는다 (시연을 끝내면 바로 서버로).
 */
import { API_BASE } from '../config'
import { createMockApi } from '../mock/mockApi'
import { session } from '../session'
import { createHttpApi, type Api } from './client'

let http: Api | null = null
let mock: (Api & { reset(): void }) | null = null

export function api(): Api {
  if (session.get().demo) {
    mock ??= createMockApi()
    return mock
  }
  http ??= createHttpApi({ base: API_BASE, token: () => session.get().token })
  return http
}

/** 시연을 처음부터 (차 찾았어요 등 되돌리기). 페이지를 막 열어 시연 Api 가 아직 없어도 남아 있는 시연 상태를 지운다 */
export function resetDemo() {
  ;(mock ?? createMockApi()).reset()
  mock = null
}

export { ApiError, errorText } from './client'
export type { Api } from './client'
