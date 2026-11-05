/**
 * npm run seed            — DB가 비어 있을 때만 시연 데이터 넣기 (이미 시드한 DB 에 주차왕 시연 참여자가 없으면 그것만 더함)
 * npm run seed -- --reset — 주차장·기록·별점·도면을 모두 지우고 다시 만들기 (짧은 링크·기기·내 주차는 그대로)
 * DATABASE_URL·DATABASE_AUTH_TOKEN 을 주면 Turso 에 (docs/deploy.md)
 */
import { ConfigError, loadConfig } from '../config.js'
import { openAndMigrate } from '../db-node.js'
import { seedDatabase } from '../seed/index.js'
import { Store } from '../store.js'

const reset = process.argv.includes('--reset')
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
const where = config.dbUrl.replace(/\/\/[^@/]*@/, '//***@')
const db = await openAndMigrate(config.dbUrl, config.dbAuthToken)
const store = new Store(db)
const t = Date.now()
let last = -1
const s = await seedDatabase(store, {
  reset,
  onProgress: (done, total) => {
    const pct = Math.floor((done / total) * 10)
    if (pct !== last && !/^file:|^:memory:/.test(config.dbUrl)) console.log(`  ${pct * 10}% (${done}/${total} 문장)`)
    last = pct
  },
})
db.close()

console.log(s.skipped ? `이미 데이터가 있어서 건너뛰었어요 (다시 만들려면 --reset): ${where}` : `시연 데이터를 ${reset ? '다시 ' : ''}만들었어요: ${where} (${((Date.now() - t) / 1000).toFixed(1)}초)`)
console.log(`주차장 ${s.lots}곳 · 기록 ${s.records}건 · 별점 ${s.ratings}건 · 주차왕 시연 참여자 ${s.king}명\n`)
console.log('판교 시연 주차장              난이도   30일 대수   (목표)')
for (const p of s.pangyo) {
  const d = p.difficulty == null ? '부족' : `★${p.difficulty.toFixed(1)}`
  const tg = p.target.difficulty == null ? '부족' : `★${p.target.difficulty.toFixed(1)}`
  const ok = p.difficulty === p.target.difficulty && p.sampleCount === p.target.sampleCount ? 'ok' : '다름!'
  console.log(`${p.id.padEnd(26)} ${d.padStart(6)}   ${String(p.sampleCount).padStart(5)}대   (${tg} · ${p.target.sampleCount}대) ${ok}`)
}
