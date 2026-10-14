import { describe, expect, it, vi } from 'vitest'
import { fetchViewerLogin } from './viewer'

const respond = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('fetchViewerLogin', () => {
  it('returns the login and sends the token as a bearer header', async () => {
    const fetchFn = respond(200, { login: 'octocat' })
    await expect(fetchViewerLogin('gho_test', fetchFn)).resolves.toBe('octocat')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/user')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer gho_test')
  })

  it('maps 401 to an expired sign-in', async () => {
    await expect(fetchViewerLogin('t', respond(401))).rejects.toEqual({ kind: 'github-unauthorized' })
  })

  it('maps 403 to forbidden', async () => {
    await expect(fetchViewerLogin('t', respond(403))).rejects.toEqual({ kind: 'github-forbidden' })
  })

  it('keeps other HTTP statuses visible', async () => {
    await expect(fetchViewerLogin('t', respond(502))).rejects.toEqual({ kind: 'github-status', status: 502 })
  })

  it('reports a failed request as a network error', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Load failed'))
    await expect(fetchViewerLogin('t', fetchFn)).rejects.toEqual({ kind: 'network', message: 'Load failed' })
  })

  it('rejects a response without a login', async () => {
    await expect(fetchViewerLogin('t', respond(200, {}))).rejects.toMatchObject({ kind: 'unknown' })
  })
})
