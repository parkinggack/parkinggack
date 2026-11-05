import { describe, expect, it } from 'vitest'
import {
  base64UrlToText,
  buildLink,
  decodePayload,
  encodePayload,
  fragmentFromLocation,
  idFromPath,
  payloadJson,
  textToBase64Url,
  type Parking,
} from './payload'

/**
 * 차량 앱과 같은 테스트 벡터 — apps/vehicle/app/src/test/java/com/parkinggack/app/share/ShareLinkTest.kt 의
 * VECTOR_URL / VECTOR_JSON 과 글자 하나까지 같아야 한다 (양쪽이 같은 링크를 만들고 읽는다는 증명).
 */
const VECTOR_URL =
  'https://parkinggack.vercel.app/p/3a9c2e#' +
  'eyJ2IjoxLCJsb3QiOiLslYTruIzribTtlITrnpEg7YyQ6rWQIOyjvOywqOyepSIsImYiOiJCMiIsInoiOiJEIiwibiI6IjA3IiwidCI6MTc5MzY4NTEyMDAwMCwibSI6IuyXmOumrOuyoOydtO2EsCAy67KIIOyqvSIsImgiOlsi656o7ZSE66W8IOuLpCDrgrTroKTsmYDshJwg6rOn7J6lIiwi7Jik66W47Kq9IOy5uCDspIQsIOyVvSAxNW0g7KeA7KCQIl0sInIiOlsxLDE3LC0xXX0'
const VECTOR_JSON =
  '{"v":1,"lot":"아브뉴프랑 판교 주차장","f":"B2","z":"D","n":"07","t":1793685120000,' +
  '"m":"엘리베이터 2번 쪽","h":["램프를 다 내려와서 곧장","오른쪽 칸 줄, 약 15m 지점"],"r":[1,17,-1]}'

const VECTOR: Parking = {
  v: 1,
  lot: '아브뉴프랑 판교 주차장',
  f: 'B2',
  z: 'D',
  n: '07',
  t: 1793685120000,
  m: '엘리베이터 2번 쪽',
  h: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'],
  r: [1, 17, -1],
}

describe('차량 앱 테스트 벡터', () => {
  it('읽기: Kotlin ShareLink가 만든 링크를 그대로 읽는다', () => {
    const url = new URL(VECTOR_URL)
    expect(idFromPath(url.pathname)).toBe('3a9c2e')
    expect(base64UrlToText(url.hash.slice(1))).toBe(VECTOR_JSON)
    expect(decodePayload(url.hash)).toEqual({ ok: true, parking: VECTOR })
  })

  it('만들기: 같은 값이면 글자 하나까지 같은 링크 (키 순서·UTF-8·패딩 없음)', () => {
    expect(payloadJson(VECTOR)).toBe(VECTOR_JSON)
    expect(buildLink('https://parkinggack.vercel.app/', '3a9c2e', VECTOR)).toBe(VECTOR_URL)
  })
})

describe('decodePayload', () => {
  const enc = (o: unknown) => textToBase64Url(JSON.stringify(o))
  const base = { v: 1, lot: '주차장', f: 'B1', z: '', n: '', t: 1_700_000_000_000 }

  it('# 이 없거나 비면 empty', () => {
    expect(decodePayload('')).toEqual({ ok: false, reason: 'empty' })
    expect(decodePayload('#')).toEqual({ ok: false, reason: 'empty' })
    expect(decodePayload(undefined)).toEqual({ ok: false, reason: 'empty' })
  })

  it('잘리거나 깨진 값은 invalid', () => {
    const good = new URL(VECTOR_URL).hash
    expect(decodePayload(good.slice(0, 40)).ok).toBe(false) // 잘린 링크
    expect(decodePayload('#!!!!').ok).toBe(false) // base64url 아님
    expect(decodePayload('#' + textToBase64Url('not json')).ok).toBe(false)
    expect(decodePayload('#' + enc([1, 2])).ok).toBe(false)
    expect(decodePayload('#' + enc({ ...base, v: 0 })).ok).toBe(false)
    expect(decodePayload('#' + enc({ ...base, t: 'yesterday' })).ok).toBe(false)
    expect(decodePayload('#' + enc({ ...base, f: 2 })).ok).toBe(false)
    expect(decodePayload('#' + enc({ ...base, lot: undefined })).ok).toBe(false)
    // UTF-8로 풀리지 않는 바이트
    expect(decodePayload('#' + btoa('\xff\xfe{').replace(/=+$/, '')).ok).toBe(false)
  })

  it("앞의 '#'은 있어도 없어도, 패딩(=)·일반 base64(+/)로 만든 값도 읽는다", () => {
    const json = JSON.stringify({ ...base, lot: '판교?>>주차장~' }) // +, / 가 나오는 바이트
    const url = textToBase64Url(json)
    const std = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    expect(std).toMatch(/[+/=]/)
    const want = decodePayload(url)
    expect(want.ok).toBe(true)
    expect(decodePayload('#' + url)).toEqual(want)
    expect(decodePayload('#' + std)).toEqual(want)
  })

  it('z·n·m·h·r 은 없어도 되고, 모르는 키와 더 높은 버전은 무시하고 보여 준다', () => {
    const r = decodePayload('#' + enc({ v: 2, lot: '주차장', f: 'B1', t: base.t, extra: { a: 1 } }))
    expect(r).toEqual({ ok: true, parking: { v: 2, lot: '주차장', f: 'B1', z: '', n: '', t: base.t } })
  })

  it('힌트는 글자만 최대 4줄, 그림 경로는 정수 배열만', () => {
    const r = decodePayload('#' + enc({ ...base, h: ['1', 2, '', '  3  ', '4', '5', '6'], r: [0, 1.5, 1] }))
    expect(r.ok && r.parking.h).toEqual(['1', '3', '4', '5'])
    expect(r.ok && r.parking.r).toBeUndefined()
  })

  it('제어 문자·줄바꿈은 공백으로, 너무 긴 값은 자른다 (링크는 누구나 만들 수 있음)', () => {
    const r = decodePayload('#' + enc({ ...base, lot: '"따옴표" \\ 주차장\n2관\u0000', m: 'x'.repeat(500) }))
    expect(r.ok && r.parking.lot).toBe('"따옴표" \\ 주차장 2관')
    expect(r.ok && r.parking.m?.length).toBe(80)
  })

  it('빈 주차장 이름은 기본 문구', () => {
    const r = decodePayload('#' + enc({ ...base, lot: '  ' }))
    expect(r.ok && r.parking.lot).toBe('주차 위치')
  })
})

describe('UTF-8 base64url', () => {
  it('한글·이모지 왕복, 패딩 없음, URL 안전 문자만', () => {
    for (const s of ['a', 'ab', 'abc', '주차각', 'B2 · D-07 🚗', '\u{10348}', '?>?>~~']) {
      const e = textToBase64Url(s)
      expect(e).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(base64UrlToText(e)).toBe(s)
    }
    expect(textToBase64Url('')).toBe('')
    expect(base64UrlToText('')).toBeNull()
  })

  it('encodePayload = 차량 앱과 같은 형식', () => {
    expect(encodePayload(VECTOR)).toBe(new URL(VECTOR_URL).hash.slice(1))
  })
})

describe('경로', () => {
  it('/p/{id} 의 id (배포 경로가 앞에 붙어도)', () => {
    expect(idFromPath('/p/3a9c2e')).toBe('3a9c2e')
    expect(idFromPath('/parkinggack/p/3a9c2e/')).toBe('3a9c2e')
    expect(idFromPath('/')).toBe('')
    expect(idFromPath('/p/<script>')).toBe('script')
  })

  it("'#'이 %23 으로 바뀌어 온 링크도 읽는다", () => {
    expect(fragmentFromLocation({ hash: '#abc', pathname: '/p/x' })).toBe('#abc')
    expect(fragmentFromLocation({ hash: '', pathname: '/p/x%23abc' })).toBe('abc')
    expect(fragmentFromLocation({ hash: '', pathname: '/p/x' })).toBe('')
  })
})
