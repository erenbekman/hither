import { describe, expect, it, vi } from 'vitest'
import { buildRequest, ENDPOINT, fetchSnapshot, validate } from './client'
import { response } from './fixture.test-data'
import type { Queries } from './query'

const queries: Queries = {
  prs: 'P',
  issues: 'I',
  review: 'R',
  changesRequested: 'C',
  myPullRequests: 'M',
  mentions: 'X',
  assigned: 'A',
  filtersDropped: false,
  allowListEmpty: false,
}
const now = new Date(1_000_000)

describe('buildRequest', () => {
  it('builds the request in the right shape', () => {
    const request = buildRequest('secret-token', queries)
    expect(request.method).toBe('POST')
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer secret-token')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    const { variables } = JSON.parse(request.body as string)
    expect(variables).toEqual({ prs: 'P', issues: 'I', review: 'R', changesRequested: 'C', myPullRequests: 'M', mentions: 'X', assigned: 'A', first: 100 })
    const { query } = JSON.parse(request.body as string)
    expect(query).toContain('mentions: search(query: $mentions')
    expect(query).toContain('... on Issue {')
    expect(query).toContain('reviewDecision mergeable')
  })
})

describe('watched repositories', () => {
  it('passes owner and name as variables, never inside the query text', () => {
    const request = buildRequest('t', queries, ['acme/api', 'bob/site'])
    const { query, variables } = JSON.parse(request.body as string)
    expect(variables).toMatchObject({ w0o: 'acme', w0n: 'api', w1o: 'bob', w1n: 'site' })
    expect(query).toContain('w1: repository(owner: $w1o, name: $w1n)')
    expect(query).not.toContain('acme')
    expect(query).toContain('author { login __typename avatarUrl(size: 48) }')
  })
})

describe('validate', () => {
  it('turns 401 into an expired sign-in', () => {
    expect(() => validate(401, new Headers(), now)).toThrow(expect.objectContaining({ kind: 'github-unauthorized' }))
  })

  it('treats 403 as a rate limit only when the headers say so', () => {
    expect(() => validate(403, new Headers({ 'retry-after': '60' }), now)).toThrow(
      expect.objectContaining({ kind: 'github-rate-limited', resetAt: new Date(1_060_000).toISOString() }),
    )
    expect(() => validate(403, new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '5000' }), now)).toThrow(
      expect.objectContaining({ kind: 'github-rate-limited', resetAt: new Date(5_000_000).toISOString() }),
    )
    expect(() => validate(403, new Headers(), now)).toThrow(expect.objectContaining({ kind: 'github-forbidden' }))
  })

  it('waits an hour when GitHub gives no reset time', () => {
    expect(() => validate(429, new Headers(), now)).toThrow(
      expect.objectContaining({ resetAt: new Date(1_000_000 + 3_600_000).toISOString() }),
    )
  })

  it('passes 200', () => {
    expect(() => validate(200, new Headers(), now)).not.toThrow()
  })
})

describe('fetchSnapshot', () => {
  it('posts to the GraphQL endpoint and parses the answer', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    const snapshot = await fetchSnapshot('t', queries, { fetchFn })
    expect(fetchFn.mock.calls[0][0]).toBe(ENDPOINT)
    expect(snapshot.login).toBe('bob')
  })

  it('reports a failed request as a network error', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Load failed'))
    await expect(fetchSnapshot('t', queries, { fetchFn })).rejects.toEqual({ kind: 'network', message: 'Load failed' })
  })
})
