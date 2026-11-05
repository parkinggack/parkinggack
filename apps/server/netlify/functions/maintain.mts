/**
 * Netlify 예약 함수(Scheduled Functions) — 하루 한 번 전체 정리 (Vercel Cron 의 GET /v1/cron/maintain 과 같은 일).
 * 시연 기록 시각을 지금에 맞춰 옮기고, 만료된 짧은 링크·페어링 코드를 지우고, 주차장 집계를 다시 한다.
 * 예약 함수는 배포된(프로덕션) 사이트에서만 돈다. 지금 한 번 돌리려면: Netlify UI → Functions → maintain → Run now
 */
import { maintain } from '../../src/netlify.ts'

export default maintain

/** 매일 18:17 UTC = 한국 시각 03:17 (정각을 피해서) */
export const config = { schedule: '17 18 * * *' }
