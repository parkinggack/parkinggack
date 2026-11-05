/**
 * IP별 토큰 버킷 (메모리). 공개 POST에만 쓴다: 분당 `perMinute`개, 한 번에 최대 `perMinute`개까지 몰아 보내도 됨.
 * 서버가 한 대라는 전제 (여러 대면 Redis 등으로 바꿀 것).
 */
export interface TakeResult {
  ok: boolean
  /** ok=false 일 때 다음 토큰까지 초 (Retry-After) */
  retryAfterSec: number
  remaining: number
}

interface Bucket {
  tokens: number
  at: number
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private readonly perMs: number

  constructor(
    readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {
    this.perMs = perMinute / 60_000
  }

  take(key: string): TakeResult {
    const t = this.now()
    const b = this.buckets.get(key) ?? { tokens: this.perMinute, at: t }
    b.tokens = Math.min(this.perMinute, b.tokens + (t - b.at) * this.perMs)
    b.at = t
    this.buckets.set(key, b)
    if (b.tokens >= 1) {
      b.tokens -= 1
      return { ok: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) }
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / this.perMs / 1000)), remaining: 0 }
  }

  /** 쓰지 않고 남은 양만 본다 (실패할 때만 take 하는 페어링 코드 시도 제한용). 0이면 다음 토큰까지 초 */
  peek(key: string): TakeResult {
    const t = this.now()
    const b = this.buckets.get(key)
    const tokens = b ? Math.min(this.perMinute, b.tokens + (t - b.at) * this.perMs) : this.perMinute
    return tokens >= 1
      ? { ok: true, retryAfterSec: 0, remaining: Math.floor(tokens) }
      : { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - tokens) / this.perMs / 1000)), remaining: 0 }
  }

  /** 다 찬(=한동안 안 온) 버킷 정리 */
  sweep(): number {
    const t = this.now()
    let removed = 0
    for (const [k, b] of this.buckets) {
      if (b.tokens + (t - b.at) * this.perMs >= this.perMinute) {
        this.buckets.delete(k)
        removed++
      }
    }
    return removed
  }

  get size(): number {
    return this.buckets.size
  }
}
