import { describe, expect, it, vi } from 'vitest'
import { activitySource, htmlUrl } from './activity'

const ctx = { signal: new AbortController().signal }
const now = () => new Date('2026-10-14T12:00:00Z')

const thread = (id: string, reason: string, type: string, url: string | null, updated = '2026-10-14T11:00:00Z') => ({
  id,
  reason,
  unread: true,
  updated_at: updated,
  subject: { title: `Thread ${id}`, url, type },
  repository: { full_name: 'acme/api' },
})

const reply = (body: unknown, status = 200, headers: Record<string, string> = { 'last-modified': 'Wed, 14 Oct 2026 11:00:00 GMT' }) =>
  new Response(status === 304 ? null : JSON.stringify(body), { status, headers })

describe('htmlUrl', () => {
  it('turns API thread urls into the pages people open', () => {
    expect(htmlUrl('https://api.github.com/repos/acme/api/pulls/12')).toBe('https://github.com/acme/api/pull/12')
    expect(htmlUrl('https://api.github.com/repos/acme/my.site/issues/7')).toBe('https://github.com/acme/my.site/issues/7')
    expect(htmlUrl('https://api.github.com/repos/acme/api/releases/3')).toBeUndefined()
    expect(htmlUrl('https://evil.example/repos/acme/api/pulls/12')).toBeUndefined()
  })
})

describe('activitySource', () => {
  it('keeps replies, mentions and state changes on pull requests and issues', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      reply([
        thread('1', 'comment', 'PullRequest', 'https://api.github.com/repos/acme/api/pulls/12'),
        thread('2', 'state_change', 'Issue', 'https://api.github.com/repos/acme/api/issues/7'),
        thread('3', 'review_requested', 'PullRequest', 'https://api.github.com/repos/acme/api/pulls/13'),
        thread('4', 'comment', 'Release', 'https://api.github.com/repos/acme/api/releases/3'),
        thread('5', 'mention', 'Discussion', null),
      ]),
    )
    const result = await activitySource({ token: async () => 't', fetchFn, now }).poll(ctx)
    expect(result.signals).toEqual([
      {
        id: 'https://github.com/acme/api/pull/12',
        source: 'github',
        lane: 'incoming',
        kind: 'activity',
        severity: 'info',
        project: 'acme/api',
        title: 'Thread 1',
        url: 'https://github.com/acme/api/pull/12',
        at: '2026-10-14T11:00:00Z',
        meta: { number: 12, type: 'pr', reason: 'comment' },
      },
      expect.objectContaining({ id: 'https://github.com/acme/api/issues/7', meta: { number: 7, type: 'issue', reason: 'state_change' } }),
    ])
    const [url, init] = fetchFn.mock.calls[0]
    expect(String(url)).toBe('https://api.github.com/notifications?participating=true&per_page=50&since=2026-09-30T12%3A00%3A00.000Z')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('asks only for changes since the last answer and keeps the list on 304', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply([thread('1', 'comment', 'PullRequest', 'https://api.github.com/repos/acme/api/pulls/12')]))
      .mockResolvedValueOnce(reply(null, 304))
    const source = activitySource({ token: async () => 't', fetchFn, now })
    await source.poll(ctx)
    const second = await source.poll(ctx)
    expect(second.signals.map((s) => s.id)).toEqual(['https://github.com/acme/api/pull/12'])
    expect((fetchFn.mock.calls[1][1]?.headers as Record<string, string>)['If-Modified-Since']).toBe('Wed, 14 Oct 2026 11:00:00 GMT')
  })

  it('reports sign-in and connection problems like the main GitHub source', async () => {
    const unauthorized = activitySource({ token: async () => 't', fetchFn: vi.fn<typeof fetch>().mockResolvedValue(reply({}, 401)), now })
    await expect(unauthorized.poll(ctx)).rejects.toEqual({ kind: 'github-unauthorized' })
    const offline = activitySource({ token: async () => 't', fetchFn: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Load failed')), now })
    await expect(offline.poll(ctx)).rejects.toMatchObject({ kind: 'network' })
  })
})
