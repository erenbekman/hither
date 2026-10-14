import { describe, expect, it } from 'vitest'
import { parseResponse } from './parse'
import { response, withData } from './fixture.test-data'

const RESET = '2026-10-14T13:00:00Z'

describe('parseResponse', () => {
  it('parses a realistic response', () => {
    const snapshot = parseResponse(response, RESET)
    expect(snapshot.login).toBe('bob')
    expect(snapshot.organizations).toEqual(['widgets'])
    expect(snapshot.searches.prs).toHaveLength(3)
    expect(snapshot.searches.issues).toHaveLength(1)
    expect(snapshot.searches.issues[0].type).toBe('issue')
    expect(snapshot.searches.review).toHaveLength(1)
    expect(snapshot.searches.changesRequested).toHaveLength(1)
    expect(snapshot.searches.myPullRequests).toHaveLength(2)
    expect(snapshot.rateLimit.remaining).toBe(4990)
  })

  it('reads the bot flag from __typename', () => {
    const { prs } = parseResponse(response, RESET).searches
    expect(prs.find((item) => item.number === 12)?.authorIsBot).toBe(true)
    expect(prs.find((item) => item.number === 11)?.authorIsBot).toBe(false)
  })

  it('also counts a login ending in [bot] as a bot', () => {
    const json = withData({
      prs: { issueCount: 1, nodes: [{ ...response.data.prs.nodes[0], author: { login: 'renovate[bot]', __typename: 'User' } }] },
    })
    expect(parseResponse(json, RESET).searches.prs[0].authorIsBot).toBe(true)
  })

  it('returns an empty organization list when it is missing', () => {
    expect(parseResponse(withData({}), RESET).organizations).toEqual([])
  })

  it('flags more than 100 results as truncated, but not exactly 100', () => {
    const json = withData({
      prs: { issueCount: 140, nodes: [] },
      issues: { issueCount: 3, nodes: [] },
      changesRequested: { issueCount: 100, nodes: [] },
    })
    expect(parseResponse(json, RESET).truncated).toEqual(['prs'])
  })

  it('keeps data that came with errors about one part and skips null nodes', () => {
    const json = withData(
      { prs: { issueCount: 2, nodes: [null, response.data.prs.nodes[0]] }, issues: null },
      { errors: [{ message: 'Org acme has an IP allow list', type: 'FORBIDDEN' }] },
    )
    const snapshot = parseResponse(json, RESET)
    expect(snapshot.searches.prs.map((item) => item.number)).toEqual([11])
    expect(snapshot.searches.issues).toEqual([])
    expect(snapshot.warnings).toEqual(['Org acme has an IP allow list'])
  })

  it("recognises GraphQL's rate limit error", () => {
    expect(() => parseResponse({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] }, RESET)).toThrow(
      expect.objectContaining({ kind: 'github-rate-limited', resetAt: RESET }),
    )
  })

  it('carries a GraphQL error message', () => {
    expect(() => parseResponse({ errors: [{ message: 'Bad credentials' }] }, RESET)).toThrow(
      expect.objectContaining({ kind: 'github-graphql', message: 'Bad credentials' }),
    )
  })

  it('reports a malformed body instead of crashing', () => {
    expect(() => parseResponse('not json', RESET)).toThrow(expect.objectContaining({ kind: 'github-parse' }))
    expect(() => parseResponse({ data: { viewer: { login: 'a' } } }, RESET)).toThrow(
      expect.objectContaining({ kind: 'github-parse', message: 'missing prs' }),
    )
  })
})
