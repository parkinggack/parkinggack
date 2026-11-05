/**
 * Netlify Functions(v2, 웹 표준 Request → Response) 진입 — 공통 부분은 serverless.ts.
 *  - netlify/functions/api.mts: netlify.toml 의 redirects 가 모든 경로를 /.netlify/functions/api/:splat 로 보낸다.
 *    원래 경로로 오든 /.netlify/functions/api/… 로 오든 앞부분을 떼고 같은 앱으로 처리한다.
 *  - netlify/functions/maintain.mts: 예약 함수(하루 한 번) — HTTP 를 거치지 않고 전체 정리를 직접 부른다.
 *  - 클라이언트 IP: x-nf-client-connection-ip (Netlify 가 넣는 값, 레이트 리밋·페어링 코드 시도 제한)
 */
import { handle } from 'hono/netlify'
import type { ParkingApp } from './app.js'
import { createServerlessApp, runMaintenance, stripPrefix } from './serverless.js'

export { createServerlessApp } from './serverless.js'

export const NETLIFY_FUNCTION_PREFIX = '/.netlify/functions/api'

/** Netlify 가 두 번째 인자로 주는 Context (여기서는 쓰지 않고 Hono 로 넘기기만) */
type NetlifyContext = unknown

export function netlifyHandler(getApp: () => ParkingApp): (req: Request, context?: NetlifyContext) => Promise<Response> {
  return async (req, context) => handle(getApp())(stripPrefix(req, [NETLIFY_FUNCTION_PREFIX]), context as never)
}

/** 예약 함수: 결과를 로그로 남기고 200 */
export function netlifyScheduled(getApp: () => ParkingApp): (req?: Request) => Promise<Response> {
  return async () => {
    const result = await runMaintenance(getApp())
    console.log('[parkinggack] 하루 정리', JSON.stringify(result))
    return Response.json(result)
  }
}

let app: ParkingApp | null = null
const getApp = () => (app ??= createServerlessApp(process.env, undefined, 'netlify'))

export const api = netlifyHandler(getApp)
export const maintain = netlifyScheduled(getApp)
