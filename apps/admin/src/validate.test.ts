import { describe, expect, it } from 'vitest'
import { createMockDb } from './mock/fixtures'
import {
  coordWarning, emptyForm, formFromLot, move, nextAboveGround, nextBasement, toLotInput, toLotPatch, validateLotForm,
} from './validate'

describe('주차장 폼 검증', () => {
  const valid = () => ({ ...emptyForm(), id: 'new-lot', name: '새 주차장', lat: '37.39', lng: '127.11' })

  it('정상 입력은 오류 없음', () => {
    expect(validateLotForm(valid(), true)).toEqual({})
  })

  it('새 주차장 id 형식', () => {
    expect(validateLotForm({ ...valid(), id: '' }, true).id).toBeTruthy()
    expect(validateLotForm({ ...valid(), id: 'Hyundai' }, true).id).toBeTruthy()
    expect(validateLotForm({ ...valid(), id: '-a' }, true).id).toBeTruthy()
    expect(validateLotForm({ ...valid(), id: 'a-' }, true).id).toBeTruthy()
    expect(validateLotForm({ ...valid(), id: '현대' }, true).id).toBeTruthy()
    expect(validateLotForm({ ...valid(), id: 'h-square2' }, true).id).toBeUndefined()
    // 수정 때는 id를 검사하지 않음 (바꿀 수 없음)
    expect(validateLotForm({ ...valid(), id: '' }, false).id).toBeUndefined()
  })

  it('이름·좌표', () => {
    expect(validateLotForm({ ...valid(), name: '  ' }, true).name).toBeTruthy()
    expect(validateLotForm({ ...valid(), lat: 'abc' }, true).lat).toBeTruthy()
    expect(validateLotForm({ ...valid(), lat: '' }, true).lat).toBeTruthy()
    expect(validateLotForm({ ...valid(), lng: '200' }, true).lng).toBeTruthy()
    expect(validateLotForm({ ...valid(), lat: '37,39' }, true).lat).toBeUndefined()
  })

  it('층: 하나 이상, 빈 칸·중복(대소문자 무시)·긴 값 안 됨', () => {
    expect(validateLotForm({ ...valid(), floors: [] }, true).floors).toMatch(/하나 이상/)
    expect(validateLotForm({ ...valid(), floors: ['1F', ' '] }, true).floors).toMatch(/빈/)
    expect(validateLotForm({ ...valid(), floors: ['B1', 'b1'] }, true).floors).toMatch(/두 번/)
    expect(validateLotForm({ ...valid(), floors: ['B123456789'] }, true).floors).toMatch(/너무 길/)
    expect(validateLotForm({ ...valid(), zones: [] }, true).zones).toBeUndefined()
  })

  it('공공정보 빈 줄', () => {
    expect(validateLotForm({ ...valid(), publicInfo: ['기계식 아님', ''] }, true).publicInfo).toBeTruthy()
  })

  it('국내 범위 밖 좌표는 경고(저장은 막지 않음)', () => {
    expect(coordWarning(valid())).toBeNull()
    expect(coordWarning({ ...valid(), lat: '127.11', lng: '37.39' })).toMatch(/바꿔/)
  })
})

describe('폼 ↔ AdminLotInput', () => {
  it('공백 정리, 빈 값은 null, 공공정보 빈 줄 제거', () => {
    const input = toLotInput({
      ...emptyForm(), id: ' x ', name: ' 이름 ', lat: '37.5', lng: '127.0', address: ' ', feeText: '',
      zoneDescription: '', publicInfo: ['  a ', ''], manualTags: ['FLAT'],
    })
    expect(input).toMatchObject({
      id: 'x', name: '이름', location: { lat: 37.5, lng: 127 }, address: null, feeText: null,
      zoneScheme: { description: null }, publicInfo: ['a'], manualTags: ['FLAT'],
    })
  })

  it('PUT 본문에는 id가 없다', () => {
    const patch = toLotPatch({ ...emptyForm(), id: 'x', name: 'n', lat: '1', lng: '2' })
    expect('id' in patch).toBe(false)
    expect(patch.name).toBe('n')
  })

  it('시드 주차장을 폼으로 열고 그대로 저장하면 같은 값', () => {
    const lot = createMockDb(Date.parse('2026-11-03T08:02:00Z')).lots.find((l) => l.id === 'hyundai-pangyo')!
    const input = toLotInput(formFromLot(lot))
    expect(input).toEqual({
      id: lot.id, name: lot.name, location: lot.location, address: lot.address, floors: lot.floors,
      zoneScheme: { ...lot.zoneScheme, description: lot.zoneScheme.description ?? null },
      manualTags: lot.manualTags, publicInfo: lot.publicInfo, feeText: lot.feeText,
      category: 'DEPARTMENT', region: 'pangyo',
    })
  })

  it('v1.1 유형·지역: 고른 것만 보내고, 지역 id 형식 검사', () => {
    const base = { ...emptyForm(), id: 'new-lot', name: '새 주차장', lat: '37.39', lng: '127.11' }
    expect(toLotInput(base)).not.toHaveProperty('category')
    expect(toLotInput(base)).not.toHaveProperty('region')
    expect(toLotInput({ ...base, category: 'OFFICE', region: ' pangyo ' })).toMatchObject({ category: 'OFFICE', region: 'pangyo' })
    expect(validateLotForm({ ...base, region: 'Pangyo 1' }, true).region).toBeTruthy()
    expect(validateLotForm({ ...base, region: 'seoul-gangnam' }, true).region).toBeUndefined()
  })
})

describe('층 도우미', () => {
  it('다음 지하층 · 지상층', () => {
    expect(nextBasement(['1F', 'B1', 'B2'])).toBe('B3')
    expect(nextBasement(['1F'])).toBe('B1')
    expect(nextAboveGround(['1F', 'B1'])).toBe('2F')
    expect(nextAboveGround(['B1'])).toBe('1F')
  })
  it('순서 옮기기', () => {
    expect(move(['1F', 'B1', 'B2'], 2, -1)).toEqual(['1F', 'B2', 'B1'])
    expect(move(['1F', 'B1', 'B2'], 0, 1)).toEqual(['B1', '1F', 'B2'])
    expect(move(['1F', 'B1'], 0, -1)).toEqual(['1F', 'B1'])
  })
})
