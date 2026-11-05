import { describe, expect, it } from 'vitest'
import type { PairedCar } from '@api-types'
import { ApiError } from './api/client'
import { afterConnected, afterShareChoice, finishesOnboarding, redirectFor } from './flow'
import { createMockApi } from './mock/mockApi'
import { claim, cleanCode, failReason, isCompleteCode, parseScan, phoneNameFromUA, reducePairing, type PairEvent, type PairState } from './pairing'

const car: PairedCar = { deviceId: 'car-1', name: '아이오닉 5', pairedAt: '2026-11-03T08:00:00Z' }
const run = (events: PairEvent[], from: PairState = { step: 'idle' }) => events.reduce(reducePairing, from)

describe('코드 입력', () => {
  it('숫자만 6자리까지 ("483 920", "483-920" 붙여 넣기)', () => {
    expect(cleanCode('483 920')).toBe('483920')
    expect(cleanCode('483-9201234')).toBe('483920')
    expect(cleanCode('abc')).toBe('')
    expect(isCompleteCode('48392')).toBe(false)
    expect(isCompleteCode('483920')).toBe(true)
  })
})

describe('QR 읽기', () => {
  it('차 QR `${WEB}/pair/483920` — 배포 주소가 달라도 경로로', () => {
    expect(parseScan('https://parkinggack.vercel.app/pair/483920')).toEqual({ kind: 'pair', code: '483920' })
    expect(parseScan('https://preview-123.vercel.app/pair/483920/')).toEqual({ kind: 'pair', code: '483920' })
    expect(parseScan('http://192.168.0.5:5173/pair/000111')).toEqual({ kind: 'pair', code: '000111' })
    expect(parseScan(' 483920 ')).toEqual({ kind: 'pair', code: '483920' })
  })

  it('C-07 주차 위치 QR은 앱 안 경로로 (연결 없이 M-01)', () => {
    expect(parseScan('https://parkinggack.vercel.app/p/3a9c2e#eyJ2IjoxfQ')).toEqual({ kind: 'share', path: '/p/3a9c2e#eyJ2IjoxfQ' })
    expect(parseScan('https://x.app/s/k7m2qp')).toEqual({ kind: 'share', path: '/s/k7m2qp' })
    expect(parseScan('https://x.app/p/3a9c2e%23eyJ2IjoxfQ')).toEqual({ kind: 'share', path: '/p/3a9c2e#eyJ2IjoxfQ' })
  })

  it('다른 QR·이상한 값은 unknown', () => {
    expect(parseScan('https://example.com/pair/12345')).toEqual({ kind: 'unknown' })
    expect(parseScan('javascript:alert(1)')).toEqual({ kind: 'unknown' })
    expect(parseScan('WIFI:S:home;;')).toEqual({ kind: 'unknown' })
    expect(parseScan('')).toEqual({ kind: 'unknown' })
  })
})

describe('상태 기계', () => {
  it('QR: idle → scanning → claiming → paired', () => {
    let s = run([{ type: 'SCAN' }])
    expect(s).toEqual({ step: 'scanning' })
    s = reducePairing(s, { type: 'SCANNED', text: 'https://a.app/pair/483920' })
    expect(s).toEqual({ step: 'claiming', code: '483920', via: 'scan' })
    s = reducePairing(s, { type: 'CLAIMED', car })
    expect(s).toEqual({ step: 'paired', car, via: 'scan' })
  })

  it('다른 QR은 무시하고 계속 찾음', () => {
    expect(run([{ type: 'SCAN' }, { type: 'SCANNED', text: 'hello' }])).toEqual({ step: 'scanning' })
  })

  it('카메라 거부·없음 → 코드 입력 (이유 함께)', () => {
    expect(run([{ type: 'SCAN' }, { type: 'CAMERA_FAILED', problem: 'denied' }])).toEqual({ step: 'entering', code: '', notice: 'denied' })
    expect(run([{ type: 'CAMERA_FAILED', problem: 'unsupported' }])).toEqual({ step: 'entering', code: '', notice: 'unsupported' })
  })

  it('코드: 6자리가 돼야 제출, 실패 → 다시', () => {
    let s = run([{ type: 'USE_CODE' }, { type: 'TYPE', value: '4839' }, { type: 'SUBMIT' }])
    expect(s).toEqual({ step: 'entering', code: '4839', notice: null })
    s = run([{ type: 'TYPE', value: '483920' }, { type: 'SUBMIT' }], s)
    expect(s).toEqual({ step: 'claiming', code: '483920', via: 'code' })
    s = reducePairing(s, { type: 'FAILED', reason: 'offline' })
    expect(s).toEqual({ step: 'failed', code: '483920', via: 'code', reason: 'offline' })
    expect(reducePairing(s, { type: 'RETRY' })).toEqual({ step: 'claiming', code: '483920', via: 'code' })
    // 실패 뒤 고쳐 쓰기
    expect(reducePairing(s, { type: 'TYPE', value: '11' })).toEqual({ step: 'entering', code: '11', notice: null })
  })

  it('/pair/:code 링크: 바로 claiming, 잘못된 코드는 invalid', () => {
    expect(run([{ type: 'LINK', code: '483920' }])).toEqual({ step: 'claiming', code: '483920', via: 'link' })
    expect(run([{ type: 'LINK', code: '12' }])).toEqual({ step: 'failed', code: '12', via: 'link', reason: 'invalid' })
    expect(reducePairing(run([{ type: 'LINK', code: '12' }]), { type: 'RETRY' }).step).toBe('failed')
  })

  it('claiming 중에는 다른 입력에 흔들리지 않음, RESET은 언제나', () => {
    const c = run([{ type: 'LINK', code: '483920' }])
    expect(reducePairing(c, { type: 'SCAN' })).toBe(c)
    expect(reducePairing(c, { type: 'USE_CODE' })).toBe(c)
    expect(reducePairing(c, { type: 'TYPE', value: '1' })).toBe(c)
    expect(reducePairing(c, { type: 'RESET' })).toEqual({ step: 'idle' })
    // claiming이 아닐 때 온 결과는 버림
    expect(reducePairing({ step: 'idle' }, { type: 'CLAIMED', car })).toEqual({ step: 'idle' })
  })
})

describe('claim', () => {
  it('서버 오류 → 이유', () => {
    expect(failReason(new ApiError(404, 'not_found', ''))).toBe('not_found')
    expect(failReason(new ApiError(410, 'gone', ''))).toBe('expired')
    expect(failReason(new ApiError(0, 'offline', ''))).toBe('offline')
    expect(failReason(new ApiError(400, 'bad_request', ''))).toBe('invalid')
    expect(failReason(new Error('x'))).toBe('unknown')
  })

  it('시연 Api로 끝까지: 성공·없음·만료', async () => {
    const api = createMockApi({ latencyMs: 0, persist: false })
    const ok = await claim(api, '483920', 'iPhone')
    expect(ok.event.type).toBe('CLAIMED')
    expect(ok.res?.token).toBeTruthy()
    expect((await claim(api, '000000', 'iPhone')).event).toEqual({ type: 'FAILED', reason: 'not_found' })
    expect((await claim(api, '111111', 'iPhone')).event).toEqual({ type: 'FAILED', reason: 'expired' })
  })

  it('폰 이름에는 식별값을 넣지 않음', () => {
    expect(phoneNameFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(phoneNameFromUA('Mozilla/5.0 (Linux; Android 15; SM-S928N)')).toBe('Android 폰')
    expect(phoneNameFromUA('Mozilla/5.0 (X11; Linux x86_64)')).toBe('웹 브라우저')
  })
})

describe('첫 실행 흐름', () => {
  it('M-12 다음: 연결 전이면 M-13, 이미 연결했으면 홈', () => {
    expect(afterShareChoice({ paired: false, shareChosen: true })).toEqual({ name: 'connect' })
    expect(afterShareChoice({ paired: true, shareChosen: true })).toEqual({ name: 'home' })
  })

  it('M-14 다음: 익명 기록을 안 골랐으면(차 QR로 바로 온 사람) M-12, 아니면 홈', () => {
    expect(afterConnected({ paired: true, shareChosen: false })).toEqual({ name: 'start-share' })
    expect(afterConnected({ paired: true, shareChosen: true })).toEqual({ name: 'home' })
  })

  it('탭 화면에 닿으면 첫 실행 끝', () => {
    expect(finishesOnboarding({ name: 'home' })).toBe(true)
    expect(finishesOnboarding({ name: 'connect' })).toBe(false)
  })

  it('들어갈 수 없는 화면은 바꿔 놓기', () => {
    const fresh = { onboarded: false, paired: false }
    expect(redirectFor({ name: 'home' }, fresh)).toEqual({ name: 'start' })
    expect(redirectFor({ name: 'lots' }, fresh)).toEqual({ name: 'start' })
    // 링크·페어링은 첫 실행 없이도
    expect(redirectFor({ name: 'link', id: 'x', way: false }, fresh)).toBeNull()
    expect(redirectFor({ name: 'short', code: 'k7m2qp', way: true }, fresh)).toBeNull()
    expect(redirectFor({ name: 'pair', code: '483920' }, fresh)).toBeNull()
    const unpaired = { onboarded: true, paired: false }
    expect(redirectFor({ name: 'parking', way: false }, unpaired)).toEqual({ name: 'home' })
    expect(redirectFor({ name: 'connected' }, unpaired)).toEqual({ name: 'home' })
    expect(redirectFor({ name: 'records' }, unpaired)).toBeNull() // 연결 안내를 보여 줌
    expect(redirectFor({ name: 'notfound' }, { onboarded: true, paired: true })).toEqual({ name: 'home' })
  })
})
