import type { ApiError, ErrorCode } from '@parkinggack/api-types'

/** 핸들러에서 던지면 onError 가 `{"error":{"code","message"}}` 로 바꾼다 */
export class ApiHttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 410 | 413 | 429 | 500,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export function errorBody(code: ErrorCode, message: string): ApiError {
  return { error: { code, message } }
}

export const badRequest = (message: string) => new ApiHttpError(400, 'bad_request', message)
export const notFound = (message = '찾을 수 없어요') => new ApiHttpError(404, 'not_found', message)
export const lotNotFound = (id: string) => notFound(`주차장을 찾을 수 없어요: ${id}`)
