import { describe, expect, it } from 'vitest'
import { carCorners, HOME_PARK, legLength, poseAt, poseTransform, scriptDuration, START_ARRIVE, unwrap, type DriveScript, type Leg, type Pt } from './carpath'

const CAR = { w: 34.5, len: 64.4, r: 10.3 } // M-20 카드의 CarTop w=34.5 (rx 10.3)
const START_CAR = { w: 40.5, len: 75.6, r: 12.1 }

function samples(sc: DriveScript, stepMs = 4) {
  const out = []
  const D = scriptDuration(sc)
  for (let t = 0; t <= D + stepMs; t += stepMs) out.push({ t, p: poseAt(sc, t) })
  return out
}

const inRect = (c: Pt, r: { x0: number; y0: number; x1: number; y1: number }) => c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1

describe('M-20 카드 주차 애니메이션 (HOME_PARK)', () => {
  it('약 2.5초, 끝 자세는 시안 그대로 translate(268 62) rotate(0)', () => {
    const D = scriptDuration(HOME_PARK)
    expect(D).toBeGreaterThanOrEqual(2300)
    expect(D).toBeLessThanOrEqual(2800)
    expect(poseTransform(poseAt(HOME_PARK, D))).toBe('translate(268 62) rotate(0)')
    expect(poseTransform(poseAt(HOME_PARK, D + 5000))).toBe('translate(268 62) rotate(0)')
  })

  it('오른쪽 화면 밖에서 서쪽을 보며 칸 아래 통로(y≈162)로 들어온다', () => {
    const p = poseAt(HOME_PARK, 0)
    expect(p.rot).toBeCloseTo(-90, 5)
    expect(Math.abs(p.y - 165)).toBeLessThan(4)
    // 차 전체가 카드(350) 밖
    for (const c of carCorners(p, CAR.w, CAR.len, CAR.r)) expect(c.x).toBeGreaterThan(350)
  })

  it('마지막 구간 끝 = 대본의 끝 자세 (구간이 이어짐)', () => {
    const legs = HOME_PARK.steps.filter((s): s is Leg => 'segs' in s)
    for (const sc of [HOME_PARK, START_ARRIVE]) {
      const legsOf = sc.steps.filter((s): s is Leg => 'segs' in s)
      const last = legsOf[legsOf.length - 1]
      const D = sc.steps.reduce((t, s) => t + ('pause' in s ? s.pause : s.ms), 0)
      const p = poseAt({ ...sc, settle: undefined }, D)
      expect(p.x).toBeCloseTo(sc.end.x, 6)
      expect(p.y).toBeCloseTo(sc.end.y, 6)
      expect(p.rot).toBeCloseTo(sc.end.rot, 6)
      expect(legLength(last)).toBeGreaterThan(10)
    }
    expect(legs.map((l) => l.dir)).toEqual([1, -1, 1]) // 앞으로 꺾어 들어가기 → 살짝 후진 → 앞으로
  })

  it('방향이 끊기지 않는다 (후진으로 바뀔 때도 앞은 같은 쪽 — 4ms마다 3° 넘게 돌지 않음)', () => {
    const s = samples(HOME_PARK)
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i].p.rot - s[i - 1].p.rot)).toBeLessThan(3)
    // 위치도 순간 이동 없음
    for (let i = 1; i < s.length; i++) expect(Math.hypot(s[i].p.x - s[i - 1].p.x, s[i].p.y - s[i - 1].p.y)).toBeLessThan(4)
  })

  it('칸을 조금 지나쳐 꺾고(−10°쯤 덜 꺾임), 후진하며 똑바로 편 뒤 들어간다', () => {
    const legs = HOME_PARK.steps.filter((s): s is Leg => 'segs' in s)
    const t1 = HOME_PARK.steps.indexOf(legs[0])
    expect(t1).toBe(0)
    const afterTurn = poseAt(HOME_PARK, legs[0].ms)
    expect(afterTurn.rot).toBeGreaterThan(-15)
    expect(afterTurn.rot).toBeLessThan(-5)
    expect(afterTurn.x).toBeLessThan(268) // 칸 가운데를 살짝 지나침
    const rev = HOME_PARK.steps.slice(0, 3).reduce((t, s) => t + ('pause' in s ? s.pause : s.ms), 0)
    const afterReverse = poseAt(HOME_PARK, rev)
    expect(Math.abs(afterReverse.rot)).toBeLessThan(0.5)
    expect(afterReverse.y).toBeGreaterThan(afterTurn.y) // 뒤로(아래로) 갔음
    expect(afterReverse.y - afterTurn.y).toBeLessThan(25) // 조금만
  })

  it('멈춘 뒤 앞이 1~2px 숙였다 돌아온다', () => {
    const settleFrom = scriptDuration(HOME_PARK) - HOME_PARK.settle!.ms
    let maxDip = 0
    for (let t = settleFrom; t <= settleFrom + HOME_PARK.settle!.ms; t += 2) maxDip = Math.max(maxDip, 62 - poseAt(HOME_PARK, t).y)
    expect(maxDip).toBeGreaterThan(1)
    expect(maxDip).toBeLessThan(2.2)
  })

  it('차는 늘 오른쪽(x ≥ 215)에만 — 층·구역·주차장 이름 글자와 오른쪽 아래 화살표를 가리지 않음', () => {
    const text = { x0: 0, y0: 0, x1: 214, y1: 230 } // B2 · D-07 · '아브뉴프랑 판교 · 2시간 전'
    const chevron = { x0: 310, y0: 188, x1: 326, y1: 206 } // 오른쪽 아래 › 의 선 (22px 아이콘, 안쪽 여백 22) + 여유
    for (const { p } of samples(HOME_PARK)) {
      for (const c of carCorners(p, CAR.w, CAR.len, CAR.r)) {
        expect(inRect(c, text)).toBe(false)
        expect(c.x).toBeGreaterThanOrEqual(215)
        expect(inRect(c, chevron)).toBe(false)
      }
    }
  })

  it('주차선(x=236·300, y 0..120)을 넘지 않는다', () => {
    for (const { p } of samples(HOME_PARK)) {
      const cs = carCorners(p, CAR.w, CAR.len, CAR.r)
      for (const c of cs) {
        if (c.y < 118) {
          expect(c.x).toBeGreaterThan(237)
          expect(c.x).toBeLessThan(299)
        }
      }
    }
  })

  it("'동작 줄이기'면 언제든 끝 자세", () => {
    for (const t of [0, 300, 1200, 2400]) expect(poseAt(HOME_PARK, t, true)).toEqual(HOME_PARK.end)
  })
})

describe('M-10 시작 화면 차 (START_ARRIVE)', () => {
  it('왼쪽 밖에서 동쪽으로 들어와 칸에 앞으로 대고, 끝은 시안 translate(221 626) rotate(180)', () => {
    const p0 = poseAt(START_ARRIVE, 0)
    expect(p0.rot).toBeCloseTo(90, 5)
    for (const c of carCorners(p0, START_CAR.w, START_CAR.len, START_CAR.r)) expect(c.x).toBeLessThan(0)
    expect(poseTransform(poseAt(START_ARRIVE, scriptDuration(START_ARRIVE)))).toBe('translate(221 626) rotate(180)')
    expect(scriptDuration(START_ARRIVE)).toBeLessThan(2000)
  })

  it('방향이 끊기지 않고(180°에서 −180°로 튀지 않음), 칸 선(x=188·254, y 560..700)을 넘지 않음, 글자(y<340) 위로 가지 않음', () => {
    const s = samples(START_ARRIVE)
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i].p.rot - s[i - 1].p.rot)).toBeLessThan(3)
    for (const { p } of s) {
      for (const c of carCorners(p, START_CAR.w, START_CAR.len, START_CAR.r)) {
        expect(c.y).toBeGreaterThan(340)
        if (c.y > 562) {
          expect(c.x).toBeGreaterThan(189)
          expect(c.x).toBeLessThan(253)
        }
      }
    }
  })
})

describe('각도 펴기', () => {
  it('unwrap: ref 에서 ±180 안으로', () => {
    expect(unwrap(-179, 180)).toBe(181)
    expect(unwrap(179, -180)).toBe(-181)
    expect(unwrap(10, 0)).toBe(10)
  })
})
