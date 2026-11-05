// public/icons/* 다시 만들기 — 로고(둥근 사각형 + P + 주차 칸 모서리, 디자인 메모 ps1)를 PNG로.
//
//   node scripts/icons.mjs        (Playwright 필요: npm i --no-save playwright && npx playwright install chromium)
//
// - icon.svg            파비콘·manifest(any) — 먹색 둥근 판에 흰 글자
// - icon-192/512.png    manifest(any)
// - maskable-512.png    manifest(maskable) — 판을 꽉 채우고 글자는 가운데 60% 안에 (안드로이드가 원·물방울로 자름)
// - apple-touch-icon.png 180×180, 투명 없음 (iOS가 모서리를 깎음)
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadChromium } from './playwright.mjs'

const out = fileURLToPath(new URL('../public/icons/', import.meta.url))
mkdirSync(out, { recursive: true })

const P = '<path d="M15 36V12h9a7 7 0 0 1 0 14h-9" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
const CORNER = '<path d="M27 38h8a3 3 0 0 0 3-3v-8" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="13" fill="#1e1e1e"/>${P}${CORNER}</svg>`
// 꽉 찬 판 + 글자를 가운데로 줄임 (안전 영역 = 지름 80%)
const full = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#1e1e1e"/><g transform="translate(${24 - 24 * scale} ${24 - 24 * scale}) scale(${scale})">${P}${CORNER}</g></svg>`

writeFileSync(out + 'icon.svg', rounded + '\n')

const chromium = await loadChromium()
const browser = await chromium.launch()
try {
  const shots = [
    ['icon-192.png', rounded, 192, true],
    ['icon-512.png', rounded, 512, true],
    ['maskable-512.png', full(0.62), 512, false],
    ['apple-touch-icon.png', full(0.78), 180, false],
  ]
  for (const [name, svg, size, transparent] of shots) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
    await page.screenshot({ path: out + name, omitBackground: transparent })
    await page.close()
    console.log('saved', name)
  }
} finally {
  await browser.close()
}
