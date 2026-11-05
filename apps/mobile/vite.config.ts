import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

/**
 * 주차각 폰 앱 (짝꿍 앱, PWA). Preact + TypeScript, JSX는 Vite 기본 변환기(oxc)로 — 플러그인 없음.
 *
 * - 페이지 2개: index.html (앱 전체 — 히스토리 라우팅이라 모든 경로가 여기로), dev/index.html (/dev/ 예시 링크 + QR)
 * - API 계약 타입은 모노레포 packages/api-types 를 상대 경로로 가져온다 (@api-types 별칭, 타입만)
 * - BASE_PATH: 하위 경로에 올릴 때만 (예: GitHub Pages 프로젝트 사이트 → BASE_PATH=/parkinggack/). 기본 '/'
 * - 404.html = index.html 복사본: 다시 쓰기(rewrite)를 못 하는 호스트(GitHub Pages)에서도 /p/{id}·/pair/{code}가 앱을 연다
 */
const base = process.env.BASE_PATH || '/'
const apiTypes = fileURLToPath(new URL('../../packages/api-types/index.ts', import.meta.url))
const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url))

function spaFallback404(): Plugin {
  return {
    name: 'parkinggack-404-fallback',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const dir = options.dir ?? 'dist'
      copyFileSync(join(dir, 'index.html'), join(dir, '404.html'))
    },
  }
}

export default defineConfig({
  base,
  plugins: [spaFallback404()],
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  resolve: {
    alias: { '@api-types': apiTypes },
  },
  server: {
    host: true, // 같은 Wi-Fi의 폰에서 http://<노트북 IP>:5173 으로 열 수 있게
    port: 5173,
    fs: { allow: ['.', packagesDir] },
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: ['es2020', 'chrome80', 'safari14'],
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        dev: fileURLToPath(new URL('dev/index.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    env: { TZ: 'Asia/Seoul' },
    // spring.test.ts 가 style.css?raw 로 --spring-* 이징 글자를 확인 (기본은 CSS 를 비워서 들여옴)
    css: { include: [/style\.css/] },
  },
})
