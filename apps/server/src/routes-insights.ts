/** v1.1 PC 대시보드 통계 (공개, 집계만) */
import { notFound } from './errors.js'
import { parse, type App, type Ctx } from './http.js'
import { insightsCompareQuery, insightsLotQuery, insightsOverviewQuery } from './schemas.js'

const CACHE = 'public, max-age=60'

export function insightsRoutes(app: App, ctx: Ctx) {
  const { insights } = ctx

  app.get('/v1/insights/overview', async (c) => {
    const { region, days } = parse(insightsOverviewQuery, c.req.query())
    const res = await insights.overview(region, days)
    if (!res) throw notFound(`지역을 찾을 수 없어요: ${region}`)
    c.header('Cache-Control', CACHE)
    return c.json(res)
  })

  app.get('/v1/insights/lots/:id', async (c) => {
    const { days, floor, maxPaths } = parse(insightsLotQuery, c.req.query())
    const res = await insights.lot(c.req.param('id'), days, floor?.toUpperCase(), maxPaths)
    if (!res) throw notFound(`주차장을 찾을 수 없어요: ${c.req.param('id')}`)
    c.header('Cache-Control', CACHE)
    return c.json(res)
  })

  app.get('/v1/insights/compare', async (c) => {
    const { region, days, category } = parse(insightsCompareQuery, c.req.query())
    const res = await insights.compare(region, days, category)
    if (!res) throw notFound(`지역을 찾을 수 없어요: ${region}`)
    c.header('Cache-Control', CACHE)
    return c.json(res)
  })
}
