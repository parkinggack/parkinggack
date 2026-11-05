/**
 * Netlify Functions(v2) 진입점 — API 전체. netlify.toml 의 [[redirects]] 가 모든 경로를 여기로 보낸다 (/* → /.netlify/functions/api/:splat).
 * Netlify 가 esbuild 로 TypeScript 소스를 바로 묶는다 (따로 빌드 단계 없음). DB 는 Turso(DATABASE_URL·DATABASE_AUTH_TOKEN).
 */
import { api } from '../../src/netlify.ts'

export default api
