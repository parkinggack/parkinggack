/**
 * 주기 작업 — 서버리스(Vercel)에는 setInterval 이 없으므로:
 *  - light: 요청이 들어올 때 인스턴스마다 10분에 한 번 (시연 기록 시각 옮기기, 만료 링크·페어링 정리). 빠름
 *  - full : Vercel Cron(하루 한 번 GET /v1/cron/maintain) · Node 서버는 1시간마다 — light + 전체 점수 다시 계산(30·90일 창 갱신)
 *           + 주차왕 끝난 주 순위 고정 (주가 바뀐 뒤 아직 안 했으면 — 주차왕 요청 때도 먼저 확인한다)
 */
import type { Config } from './config.js'
import type { KingStore } from './king-store.js'
import type { MeStore } from './me-store.js'
import type { Store } from './store.js'

export const LIGHT_EVERY_MS = 10 * 60_000

export interface MaintenanceResult {
  rolledHours: number
  sharesExpired: number
  sharesPurged: number
  pairingsDeleted: number
  lots?: number
}

export class Maintenance {
  private lastLight = Number.NEGATIVE_INFINITY
  private running: Promise<MaintenanceResult> | null = null

  constructor(
    private readonly store: Store,
    private readonly me: MeStore,
    private readonly config: Pick<Config, 'demoRolling'>,
    private readonly king?: KingStore,
  ) {}

  /** 요청마다 불러도 됨 — 10분에 한 번만 실제로 한다. 실패해도 요청은 계속 */
  async light(): Promise<void> {
    const now = this.store.now()
    if (now - this.lastLight < LIGHT_EVERY_MS && now >= this.lastLight) return
    this.lastLight = now
    try {
      await (this.running ??= this.run(false).finally(() => (this.running = null)))
    } catch (e) {
      console.error('[parkinggack] 주기 작업 실패', e)
    }
  }

  async full(): Promise<MaintenanceResult> {
    this.lastLight = this.store.now()
    return this.run(true)
  }

  private async run(full: boolean): Promise<MaintenanceResult> {
    const rolledHours = this.config.demoRolling ? await this.store.rollDemo() : 0
    const shares = await this.store.cleanupShares()
    const pairingsDeleted = await this.me.cleanupPairings()
    const lots = full ? await this.store.recomputeAll() : undefined
    if (full) await this.king?.ensureSnapshots()
    return { rolledHours, sharesExpired: shares.expired, sharesPurged: shares.purged, pairingsDeleted, lots }
  }
}
