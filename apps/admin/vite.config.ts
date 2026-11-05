import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * - 개발 서버 5174 (폰 웹 5173과 겹치지 않게). `--host`로 떠서 같은 네트워크의 태블릿에서도 열림
 * - API 계약 타입은 모노레포 packages/api-types 를 상대 경로로 가져온다 (@api-types 별칭)
 * - 대시보드 시연 데이터 생성기는 packages/insights-demo (@insights-demo 별칭, 서버와 같이 씀).
 *   화면은 도면 규칙만 쓴다 (@insights-layout = 그 안의 layout.ts, 시연 수치는 번들에 안 들어감)
 * - 해시 라우팅(#/lots/...)이라 정적 호스팅에 다시 쓰기(rewrite) 설정이 필요 없다
 * - BASE_PATH: 하위 경로에 올릴 때만 (예: /admin/). 기본 '/'
 */
const apiTypes = fileURLToPath(new URL('../../packages/api-types/index.ts', import.meta.url))
const insightsDemo = fileURLToPath(new URL('../../packages/insights-demo/index.ts', import.meta.url))
const insightsLayout = fileURLToPath(new URL('../../packages/insights-demo/layout.ts', import.meta.url))
const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url))

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: { '@api-types': apiTypes, '@insights-demo': insightsDemo, '@insights-layout': insightsLayout },
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    fs: { allow: ['.', packagesDir] },
  },
  preview: {
    host: true,
    port: 4174,
  },
  build: {
    target: ['es2020', 'chrome90', 'safari14'],
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    env: { TZ: 'Asia/Seoul', VITE_TILE_URL: 'none' },
  },
})
