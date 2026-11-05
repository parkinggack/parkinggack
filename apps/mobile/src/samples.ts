import type { Parking } from './payload'

/** 차 없이 M-01·M-02를 열어 보는 예시 (/dev/ 페이지, 스크린숏) */
export interface Sample {
  id: string
  title: string
  note: string
  /** 정상 링크 */
  parking?: Parking
  /** 일부러 깨뜨린 # 뒤 값 */
  rawFragment?: string
}

const MIN = 60_000

/** 차량 앱 시연 시나리오(판교 백화점, B2 나선 램프 2바퀴 → 후진 직각주차)가 실제로 만드는 힌트 — ShareLinkTest 벡터와 같음 */
export const MAIN_DEMO_HINTS = ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점']
export const MAIN_DEMO_ROUTE = [1, 17, -1]

export function samples(now: number): Sample[] {
  return [
    {
      id: 'design',
      title: '시안 그대로',
      note: 'M-01·M-02 시안과 같은 값 (B2 · D-07, 2시간 10분 전, 힌트 3줄)',
      parking: {
        v: 1,
        lot: '아브뉴프랑 판교 주차장',
        f: 'B2',
        z: 'D',
        n: '07',
        t: now - 130 * MIN,
        m: '엘리베이터 2번 쪽',
        h: ['주차장 입구에서 곧장', '첫 번째 통로에서 오른쪽', '왼쪽 칸 줄, 약 60m 지점'],
        r: [0, 12, -1, 55, 1],
      },
    },
    {
      id: 'demo',
      title: '시연 시나리오 (차가 만든 그대로)',
      note: '나선 램프 2바퀴로 B2 → 지나쳐 멈춤 → 후진으로 오른쪽 칸. 램프 안쪽은 힌트에서 뺌',
      parking: { v: 1, lot: '아브뉴프랑 판교 주차장', f: 'B2', z: 'D', n: '07', t: now - 35 * MIN, m: '엘리베이터 2번 쪽', h: MAIN_DEMO_HINTS, r: MAIN_DEMO_ROUTE },
    },
    {
      id: 'flat',
      title: '평면 주차장 · 어제',
      note: '입구에서 오른쪽으로 꺾어 왼쪽 칸 (메모 없음)',
      parking: {
        v: 1,
        lot: '이마트 판교점 평면 주차장',
        f: '1F',
        z: 'A',
        n: '12',
        t: now - (24 + 3) * 60 * MIN,
        h: ['주차장 입구에서 곧장', '약 10m 가서 오른쪽', '왼쪽 칸 줄, 약 30m 지점'],
        r: [0, 10, -1, 32, 1],
      },
    },
    {
      id: 'floor',
      title: '층만 (구역 안 고름)',
      note: '구역·기둥을 고르지 않고 자동 저장. 길 힌트 없음',
      parking: { v: 1, lot: '현대백화점 판교점', f: 'B4', z: '', n: '', t: now - 5 * MIN },
    },
    {
      id: 'long',
      title: '긴 이름 · 꺾음 2번',
      note: '긴 주차장 이름과 긴 구역 번호, 힌트 4줄',
      parking: {
        v: 1,
        lot: '판교 테크노밸리 공영주차장 제2관 (지하 연결 통로 쪽)',
        f: 'B3',
        z: 'AB',
        n: '1234',
        t: now - 50 * MIN,
        m: '기둥 색 파랑, 출구 계단 바로 옆',
        h: ['주차장 입구에서 곧장', '약 15m 가서 왼쪽', '약 25m 가서 오른쪽', '오른쪽 칸 줄, 약 15m 지점'],
        r: [0, 16, 1, 26, -1, 14, -1],
      },
    },
    {
      id: 'broken',
      title: '잘린 링크',
      note: '메신저로 옮기다 끝이 잘린 경우 — 친절한 안내가 떠야 함',
      rawFragment: 'eyJ2IjoxLCJsb3QiOiLslYTr',
    },
  ]
}
