/**
 * 계약(packages/api-types) v1.1 주석에만 있고 인터페이스에는 아직 없는 필드.
 * "ParkingLot 응답에 category: LotCategory, region: string 추가. AdminLotInput에도 선택 필드로."
 * 계약 파일은 고치지 않고 여기서 덧붙여 쓴다 — 계약에 들어가면 이 파일을 지우면 된다.
 */
import type { AdminLot, AdminLotInput, LotCategory } from '@api-types'

export interface LotMetaV11 {
  category?: LotCategory | null
  /** 대시보드 지역 id (예 "pangyo") */
  region?: string | null
}

export type AdminLotV11 = AdminLot & LotMetaV11
export type AdminLotInputV11 = AdminLotInput & { category?: LotCategory; region?: string }
