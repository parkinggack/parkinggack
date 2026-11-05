/**
 * v1.2 주차왕 (C-13 · M-50~M-53). 차·폰 모두 '차' 단위 — 폰 토큰은 연결된 차, 연결 전 폰은 409.
 * 순위판에는 닉네임·점수·등수·나인지만 (다른 사람의 주차장·시각은 내보내지 않는다).
 */
import type { KingBoardResponse, KingMeResponse, KingNicknameResponse, KingResultResponse } from '@parkinggack/api-types'
import { bodyMax, deviceAuth, parse, readJson, requireCar, type App, type Ctx } from './http.js'
import { kingJoinSchema, kingNicknameQuery } from './schemas.js'

export function kingRoutes(app: App, ctx: Ctx) {
  const { king, me } = ctx
  const either = deviceAuth(me)('car', 'phone')
  const small = bodyMax(16 * 1024)

  /** M-52 "다시 뽑기" — 인증 없음, 저장 안 함. 그 지역에서 지금 참여 중인 닉네임과 겹치지 않게 */
  app.get('/v1/king/nickname', async (c) => {
    const { region } = parse(kingNicknameQuery, c.req.query())
    c.header('Cache-Control', 'no-store')
    const res: KingNicknameResponse = { nickname: await king.newNickname(region) }
    return c.json(res)
  })

  /** M-52 "참여할게요" — 다시 보내면 닉네임·리그를 바꾼다 */
  app.post('/v1/me/king/join', small, either, async (c) => {
    const req = parse(kingJoinSchema, await readJson(c))
    const carId = requireCar(c.get('device'))
    await king.join(carId, req)
    const res: { me: KingMeResponse } = { me: await king.meResponse(carId) }
    return c.json(res)
  })

  /** 그만두기 (참여 중이 아니어도 204) */
  app.delete('/v1/me/king', either, async (c) => {
    await king.leave(requireCar(c.get('device')))
    return c.body(null, 204)
  })

  app.get('/v1/me/king', either, async (c) => {
    const res: KingMeResponse = await king.meResponse(requireCar(c.get('device')))
    return c.json(res)
  })

  app.get('/v1/me/king/board', either, async (c) => {
    const res: KingBoardResponse = await king.boardResponse(requireCar(c.get('device')))
    return c.json(res)
  })

  app.get('/v1/me/king/results/last', either, async (c) => {
    const res: KingResultResponse = await king.lastResult(requireCar(c.get('device')))
    return c.json(res)
  })
}
