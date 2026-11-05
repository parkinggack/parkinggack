/**
 * Vercel Functions(Node) 진입 — 공통 부분은 serverless.ts.
 * vercel.json 이 모든 경로를 /api 로 보낸다. 원래 경로가 오지만, /api/… 로 직접 불러도 되게 앞의 /api 를 뗀다.
 */
import type { ParkingApp } from './app.js'
import { createServerlessApp, stripPrefix } from './serverless.js'

export { createServerlessApp } from './serverless.js'

export function apiHandler(getApp: () => ParkingApp): (req: Request) => Promise<Response> {
  return async (req) => getApp().fetch(stripPrefix(req, ['/api']))
}

let app: ParkingApp | null = null
/** api/index.ts 가 내보내는 처리기 (인스턴스마다 앱 하나) */
export const handle = apiHandler(() => (app ??= createServerlessApp(process.env, undefined, 'vercel')))
