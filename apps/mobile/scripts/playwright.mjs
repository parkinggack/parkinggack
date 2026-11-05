// Playwright(Chromium)는 의존성에 넣지 않았다 (브라우저가 커서). 이 폴더에 설치돼 있거나(npm i --no-save playwright),
// 전역(NODE_PATH)에 있으면 그걸 쓴다.
import { createRequire } from 'node:module'

export async function loadChromium() {
  try {
    return (await import('playwright')).chromium
  } catch {
    /* 로컬에 없음 */
  }
  try {
    return createRequire(import.meta.url)('playwright').chromium // CommonJS 경로는 NODE_PATH도 본다
  } catch {
    console.error('playwright가 없어요: npm i --no-save playwright && npx playwright install chromium')
    process.exit(1)
  }
}
