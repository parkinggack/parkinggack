/**
 * Vercel Functions 진입점 (Node 런타임, 웹 표준 Request → Response).
 * vercel.json 의 rewrites 가 모든 경로를 여기로 보낸다. 빌드(npm run build)가 만든 dist 를 쓴다 —
 * Vercel 이 TypeScript 소스의 '.js' 상대 import 를 따라가지 못하는 경우가 있어서 컴파일된 파일을 직접 가리킨다.
 */
// @ts-ignore — dist 는 Vercel 빌드 단계(npm run build)에서 생긴다
import { handle } from '../dist/apps/server/src/vercel.js'

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
export const OPTIONS = handle
export const HEAD = handle
