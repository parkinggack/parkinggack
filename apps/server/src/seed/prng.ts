/** 시드 데이터용 결정적 난수 (mulberry32). 같은 seed → 같은 값 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  /** [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** lo..hi (둘 다 포함) */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  /** 표준 정규분포 (Box–Muller) */
  normal(): number {
    const u = 1 - this.next()
    const v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  poisson(lambda: number): number {
    if (lambda <= 0) return 0
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()))
    const l = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= this.next()
    } while (p > l)
    return k - 1
  }

  /** 가중치 비례로 하나 고르기 (인덱스) */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0)
    let x = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i]
      if (x < 0) return i
    }
    return weights.length - 1
  }

  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    return items[this.weightedIndex(items.map((i) => i[1]))][0]
  }

  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  /** UUID v4 모양 (clientRecordId 용) */
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => this.int(0, 15).toString(16))
    hex[12] = '4'
    hex[16] = ((this.int(0, 15) & 0x3) | 0x8).toString(16)
    const s = hex.join('')
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
  }
}

/** 문자열 → 32비트 seed (FNV-1a) */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
