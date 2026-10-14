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
    expect(result.profile).toMatchObject({ name: 'Bob Builder', followers: 42 })
    expect(result.quota).toEqual({ limit: 5000, remaining: 4990, resetAt: '2026-10-14T13:00:00Z' })
    const counts = Object.fromEntries(
      ['pr', 'issue', 'review-requested', 'changes-requested', 'my-pr'].map((kind) => [kind, result.signals.filter((s) => s.kind === kind).length]),
    )
    expect(counts).toEqual({ pr: 3, issue: 1, 'review-requested': 1, 'changes-requested': 1, 'my-pr': 2 })
    const review = result.signals.find((s) => s.kind === 'review-requested')
    expect(review).toMatchObject({ lane: 'incoming', severity: 'attention', project: 'bob/tools', actor: 'frank' })
    expect(result.signals.find((s) => s.kind === 'pr')?.meta).toHaveProperty('avatar')
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

  it('adds check signals for your pull requests and the watched branches', async () => {
    const settings = { ...DEFAULT_SETTINGS, watchedRepos: ['bob/site', 'bob/gone'] }
    const result = await githubSource({ token: async () => 't', settings: () => settings, fetchFn: answer(response) }).poll(ctx)
    const outgoing = result.signals.filter((s) => s.lane === 'outgoing')
    expect(outgoing.map((s) => [s.kind, s.severity, s.id])).toEqual([
      ['ci-failed', 'attention', 'ci:https://github.com/bob/tools/pull/41'],
      ['ci-passed', 'info', 'ci:https://github.com/bob/tools/pull/42'],
      ['ci-main-failed', 'critical', 'ci:branch:bob/site'],
    ])
    expect(result.notices).toContain('Watched repository bob/gone was not found')
  })

  it('moves agent pull requests to the Agents lane, once each, and marks green ones ready', async () => {
    const agentPr = (number: number, login: string, typename: string, headRefName: string, state: string, isDraft = false) => ({
      number,
      title: `Agent ${number}`,
      url: `https://github.com/bob/tools/pull/${number}`,
      createdAt: '2026-10-14T09:00:00Z',
      isDraft,
      headRefName,
      author: { login, __typename: typename },
      repository: { nameWithOwner: 'bob/tools' },
      commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
    })
    const body = withData({
      prs: { issueCount: 2, nodes: [agentPr(70, 'claude', 'Bot', 'fix/x', 'SUCCESS'), agentPr(71, 'copilot-swe-agent', 'Bot', 'copilot/y', 'PENDING')] },
      review: { issueCount: 1, nodes: [{ ...agentPr(70, 'claude', 'Bot', 'fix/x', 'SUCCESS'), commits: undefined }] },
      myPullRequests: { issueCount: 1, nodes: [agentPr(72, 'bob', 'User', 'claude/tray-fix', 'SUCCESS', true)] },
    })
    const result = await githubSource({ token: async () => 't', settings: () => DEFAULT_SETTINGS, fetchFn: answer(body) }).poll(ctx)
    const agents = result.signals.filter((s) => s.lane === 'agents')
    expect(agents.map((s) => [s.meta?.number, s.kind, s.severity])).toEqual([
      [70, 'agent-pr-ready', 'attention'],
      [71, 'agent-pr', 'info'],
      [72, 'agent-pr', 'info'],
    ])
    expect(result.signals.filter((s) => s.lane === 'incoming')).toEqual([])
  })
})
