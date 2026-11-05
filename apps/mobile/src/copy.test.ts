import { describe, expect, it } from 'vitest'
import { COPY, FORBIDDEN, parkedNoticeText } from './copy'
import { difficultyLabel } from './format'
import { homeTip, monthHeadline, recordTitle } from './insights'
import { lotFixtures, parkingFixtures, pitchFor, shareFixture } from './mock/fixtures'
import { FAIL_TEXT } from './pairing'
import { samples } from './samples'
import { EXPERIENCE_LABEL } from './session'

const NOW = new Date('2026-11-03T17:02:00+09:00').getTime()

describe('카피 규칙', () => {
  const parkings = parkingFixtures(NOW)
  const texts = [
    ...Object.values(COPY),
    ...Object.values(FAIL_TEXT),
    ...Object.values(EXPERIENCE_LABEL),
    ...samples(0).flatMap((s) => [s.title, s.note, ...(s.parking?.h ?? []), s.parking?.m ?? '']),
    ...parkings.flatMap((p) => [...p.hints, p.note ?? '', ...recordTitle(p)]),
    ...(shareFixture(NOW).h ?? []),
    ...lotFixtures(NOW).flatMap((l) => [l.name, ...l.publicInfo, ...l.statChips, pitchFor(l.tags)]),
    ...[0, 1, 2, 3, 4, 5, null].map(difficultyLabel),
    ...monthHeadline({ thisMonthAvgReverse: 2.4, lastMonthAvgReverse: 1.6 }),
    ...monthHeadline({ thisMonthAvgReverse: 1.6, lastMonthAvgReverse: 2.0 }),
    homeTip(null, parkings[0], NOW)?.text ?? '',
    parkedNoticeText('B2 · D-07'),
  ]

  it.each(FORBIDDEN)("운전자를 평가하는 말 '%s' 없음", (word) => {
    for (const t of texts) expect(t).not.toContain(word)
  })

  it('느낌표·이모지 없음 (디자인 메모 ps1)', () => {
    for (const t of texts) {
      expect(t).not.toMatch(/[!！]/)
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })

  it('M-02 필수 문구 · M-33 필수 문구', () => {
    expect(COPY.disclaimer).toBe('차가 지나온 길로 계산한 힌트예요. 실제와 조금 다를 수 있어요')
    expect(COPY.redrawn).toBe('동선을 그림으로 다시 그렸어요')
  })

  it('알림 문구 "B2 · D-07에 주차했어요"', () => {
    expect(parkedNoticeText('B2 · D-07')).toBe('B2 · D-07에 주차했어요')
  })
})
