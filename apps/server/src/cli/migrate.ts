/**
 * npm run migrate — 마이그레이션만 적용 (Turso 에 배포하기 전에 노트북에서. DATABASE_URL·DATABASE_AUTH_TOKEN)
 */
import { ConfigError, loadConfig } from '../config.js'
import { migrate, schemaVersion } from '../db.js'
import { openDatabase } from '../db-node.js'

let config
try {
  config = loadConfig({ ...process.env, VERCEL: '' })
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`설정 오류: ${e.message}`)
    process.exit(1)
  }
  throw e
}
const db = openDatabase(config.dbUrl, config.dbAuthToken)
const applied = await migrate(db)
console.log(
  `${config.dbUrl.replace(/\/\/[^@/]*@/, '//***@')}: ${applied.length ? `v${applied.join(', v')} 적용` : '이미 최신'} → 스키마 v${await schemaVersion(db)}`,
)
db.close()
