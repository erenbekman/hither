import { describe, expect, it, vi } from 'vitest'
import { createIncoming, initialIncomingState, type IncomingDeps } from './incoming'
import { SeenStore } from './seen-store'
import { DEFAULT_SETTINGS } from './settings'
import type { PollResult, Signal } from './types'

const ORDER = ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr']

const signal = (n: number, kind = 'pr'): Signal => ({
  id: `https://github.com/acme/api/pull/${n}`,
  url: `https://github.com/acme/api/pull/${n}`,
  source: 'github',
  lane: 'incoming',
  kind,
  severity: 'info',
  project: 'acme/api',
  title: `Change ${n}`,
  at: new Date(Date.UTC(2026, 9, 14, 12, n)).toISOString(),
})

function setup(results: (PollResult | Error | object)[], overrides: Partial<IncomingDeps> = {}) {
  const state = initialIncomingState()
  const poll = vi.fn(async () => {
    const next = results.shift() ?? { signals: [], notices: [] }
    if (next instanceof Error || 'kind' in next) throw next
    return next as PollResult
  })
  const deps = {
    source: { id: 'github', interval: 0, poll },
    seen: new SeenStore(),
    saveSeen: vi.fn(async () => {}),
    notify: vi.fn(),
    setBadge: vi.fn(),
    settings: () => DEFAULT_SETTINGS,
    order: ORDER,
    quietKinds: ['my-pr'],
    describe: (s: Signal) => `New pull request ${s.id}`,
    now: () => new Date('2026-10-14T12:30:00Z'),
    ...overrides,
  } satisfies IncomingDeps
  return { state, deps, poll, incoming: createIncoming(state, deps) }
}

const ok = (signals: Signal[], extra: Partial<PollResult> = {}): PollResult => ({ signals, notices: [], account: 'alice', ...extra })

describe('createIncoming', () => {
  it('stays quiet on the first run but leaves everything unseen', async () => {
    const { state, deps, incoming } = setup([ok([signal(1), signal(2)])])
    await incoming.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.badge).toBe(2)
    expect(deps.setBadge).toHaveBeenLastCalledWith(2)
    expect(Object.keys(state.unseen)).toHaveLength(2)
  })

  it('notifies only items it has not notified before', async () => {
    const { deps, incoming } = setup([ok([signal(1)]), ok([signal(1), signal(2)]), ok([signal(1), signal(2)])])
    await incoming.refresh()
    await incoming.refresh()
    await incoming.refresh()
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.notify).mock.calls[0][0]).toHaveLength(1)
    expect(vi.mocked(deps.notify).mock.calls[0][0][0].url).toBe(signal(2).url)
  })

  it('neither notifies nor counts your own pull requests', async () => {
    const { state, deps, incoming } = setup([ok([]), ok([signal(5, 'my-pr')])])
    await incoming.refresh()
    await incoming.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.badge).toBe(0)
    expect(state.unseen[signal(5).id]).toBe(true)
  })

  it('respects the notification setting', async () => {
    const { deps, incoming } = setup([ok([]), ok([signal(1)])], { settings: () => ({ ...DEFAULT_SETTINGS, notifications: false }) })
    await incoming.refresh()
    await incoming.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('keeps the last list and shows the error when a refresh fails', async () => {
    const { state, incoming } = setup([ok([signal(1)]), { kind: 'network', message: 'offline' }])
    await incoming.refresh()
    await incoming.refresh()
    expect(state.errors).toEqual([{ kind: 'network', message: 'offline' }])
    expect(state.sections[0].signals).toHaveLength(1)
    expect(state.refreshing).toBe(false)
  })

  it('clears the error once a refresh succeeds again', async () => {
    const { state, incoming } = setup([{ kind: 'network', message: 'offline' }, ok([])])
    await incoming.refresh()
    await incoming.refresh()
    expect(state.errors).toEqual([])
  })

  it('does not ask GitHub again while the rate limit is spent', async () => {
    const { state, poll, incoming } = setup([{ kind: 'github-rate-limited', resetAt: '2026-10-14T13:00:00Z' }])
    await incoming.refresh()
    await incoming.refresh()
    expect(poll).toHaveBeenCalledTimes(1)
    expect(state.errors[0].kind).toBe('github-rate-limited')
  })

  it('queues a refresh requested while one runs, and runs it once', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    const { poll, incoming } = setup([])
    poll.mockImplementationOnce(async () => {
      await blocked
      return ok([])
    })
    const first = incoming.refresh()
    void incoming.refresh()
    void incoming.refresh()
    release()
    await first
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('updates the badge and saves when items are marked seen', async () => {
    const { state, deps, incoming } = setup([ok([signal(1), signal(2)])])
    await incoming.refresh()
    await incoming.markSeen([signal(1).id])
    expect(state.badge).toBe(1)
    expect(state.unseen[signal(1).id]).toBeUndefined()
    expect(deps.saveSeen).toHaveBeenCalledTimes(2)
  })

  it('starts over when GitHub reports a different account', async () => {
    const { state, deps, incoming } = setup([ok([signal(1)]), ok([signal(1)], { account: 'bob' })])
    await incoming.refresh()
    await incoming.markSeen([signal(1).id])
    await incoming.refresh()
    expect(state.unseen[signal(1).id]).toBe(true)
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.account).toBe('bob')
  })

  it('shows a failed save of seen.json instead of hiding it', async () => {
    const { state, incoming } = setup([ok([signal(1)])], { saveSeen: vi.fn(async () => Promise.reject(new Error('disk full'))) })
    await incoming.refresh()
    expect(state.errors).toEqual([{ kind: 'unknown', message: 'could not save seen.json: disk full' }])
    expect(state.sections).toHaveLength(1)
  })
})
