import { describe, expect, it, vi } from 'vitest'
import { getJson } from './http'

const reply = (status: number, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status, headers }))
const now = () => new Date(1_000_000)

describe('getJson', () => {
  it('sends the token and returns the body', async () => {
    const fetchFn = reply(200)
    await expect(getJson('Forge', 'https://x/api', 'tok', { fetchFn })).resolves.toEqual({ ok: true })
    expect((fetchFn.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('maps 401 and 403 to a rejected token', async () => {
    for (const status of [401, 403]) {
      await expect(getJson('Sentry', 'u', 't', { fetchFn: reply(status) })).rejects.toEqual({ kind: 'service-unauthorized', service: 'Sentry' })
    }
  })

  it('maps 429 to a rate limit with its reset time', async () => {
    await expect(getJson('Forge', 'u', 't', { fetchFn: reply(429, { 'retry-after': '30' }), now })).rejects.toEqual({
      kind: 'service-rate-limited',
      service: 'Forge',
      resetAt: new Date(1_030_000).toISOString(),
    })
  })

  it('keeps other statuses and network failures visible', async () => {
    await expect(getJson('Forge', 'u', 't', { fetchFn: reply(503) })).rejects.toEqual({ kind: 'service-status', service: 'Forge', status: 503 })
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await expect(getJson('Forge', 'u', 't', { fetchFn: offline })).rejects.toEqual({ kind: 'network', service: 'Forge', message: 'offline' })
  })
})
