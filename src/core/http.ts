import type { AppError, Service } from './errors'

export function resetDate(headers: Headers, now: Date): string {
  const retryAfter = Number(headers.get('retry-after') ?? NaN)
  if (Number.isFinite(retryAfter)) return new Date(now.getTime() + retryAfter * 1000).toISOString()
  const reset = Number(headers.get('x-ratelimit-reset') ?? NaN)
  if (Number.isFinite(reset)) return new Date(reset * 1000).toISOString()
  return new Date(now.getTime() + 3_600_000).toISOString()
}

export async function getJson(
  service: Service,
  url: string,
  token: string,
  { fetchFn, signal, now = () => new Date() }: { fetchFn: typeof fetch; signal?: AbortSignal; now?: () => Date },
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw { kind: 'network', service, message: error instanceof Error ? error.message : String(error) } satisfies AppError
  }
  if (response.status === 401 || response.status === 403) throw { kind: 'service-unauthorized', service } satisfies AppError
  if (response.status === 429) {
    throw { kind: 'service-rate-limited', service, resetAt: resetDate(response.headers, now()) } satisfies AppError
  }
  if (!response.ok) throw { kind: 'service-status', service, status: response.status } satisfies AppError
  try {
    return await response.json()
  } catch {
    throw { kind: 'service-status', service, status: response.status } satisfies AppError
  }
}
