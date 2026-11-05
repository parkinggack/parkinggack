/** `npm run dev` / `npm start` 진입점 */
import { ConfigError, loadConfig } from './config.js'
import { startServer } from './server.js'

let config
try {
  config = loadConfig()
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`[parkinggack] 설정 오류: ${e.message}`)
    process.exit(1)
  }
  throw e
}

const running = await startServer(config)

let closing = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (closing) process.exit(1)
    closing = true
    console.log(`[parkinggack] ${sig} — 종료 중`)
    running.close().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
