import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { response, withData } from './fixture.test-data'
import { githubSource } from './index'

const ctx = { signal: new AbortController().signal }
const answer = (body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))

describe('githubSource', () => {
  it('turns every search result into an incoming signal of its kind', async () => {
    const source = githubSource({ token: async () => 't', settings: () => DEFAULT_SETTINGS, fetchFn: answer(response) })
    const result = await source.poll(ctx)
    expect(result.account).toBe('bob')
    expect(result.retryAt).toBeUndefined()
    const counts = Object.fromEntries(['pr', 'issue', 'review-requested', 'changes-requested', 'my-pr'].map((kind) => [kind, result.signals.filter((s) => s.kind === kind).length]))
    expect(counts).toEqual({ pr: 3, issue: 1, 'review-requested': 1, 'changes-requested': 1, 'my-pr': 2 })
    const review = result.signals.find((s) => s.kind === 'review-requested')
    expect(review).toMatchObject({ lane: 'incoming', severity: 'attention', project: 'bob/tools', actor: 'frank' })
  })

  it('reports truncation and partial errors as notices', async () => {
    const body = withData({ prs: { issueCount: 140, nodes: [] } }, { errors: [{ message: 'Org acme has an IP allow list' }] })
    const result = await githubSource({ token: async () => 't', settings: () => DEFAULT_SETTINGS, fetchFn: answer(body) }).poll(ctx)
    expect(result.notices).toEqual(['Pull Requests: more than 100 found, showing the newest 100', 'Org acme has an IP allow list'])
  })

  it('asks GitHub nothing when the allow list is empty, and says why', async () => {
    const fetchFn = answer(response)
    const token = vi.fn(async () => 't')
    const settings = { ...DEFAULT_SETTINGS, repoListIsAllowList: true }
    const result = await githubSource({ token, settings: () => settings, fetchFn }).poll(ctx)
    expect(result).toEqual({ signals: [], notices: ['No repositories selected'] })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(token).not.toHaveBeenCalled()
  })

  it('passes on when to retry once the rate limit is spent', async () => {
    const body = withData({ rateLimit: { limit: 5000, remaining: 0, resetAt: '2026-10-14T13:00:00Z' } })
    const result = await githubSource({ token: async () => 't', settings: () => DEFAULT_SETTINGS, fetchFn: answer(body) }).poll(ctx)
    expect(result.retryAt).toBe('2026-10-14T13:00:00Z')
  })
})
