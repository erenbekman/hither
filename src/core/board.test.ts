import { describe, expect, it, vi } from 'vitest'
import { createBoard, initialBoardState, type BoardDeps } from './board'
import { SeenStore } from './seen-store'
import { DEFAULT_SETTINGS } from './settings'
import type { Lane, PollResult, Signal, Source } from './types'

const ORDER: Record<Lane, readonly string[]> = {
  incoming: ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr'],
  outgoing: ['deploy-failed', 'ci-failed', 'ci-fixed', 'deploy-ok'],
  agents: [],
}

const signal = (n: number, kind = 'pr', source: Signal['source'] = 'github'): Signal => {
  const outgoing = ORDER.outgoing.includes(kind) || kind === 'ci-passed'
  return {
    id: `${source}:${n}`,
    url: `https://github.com/acme/api/pull/${n}`,
    source,
    lane: outgoing ? 'outgoing' : 'incoming',
    kind,
    severity: kind === 'deploy-failed' ? 'critical' : kind === 'ci-failed' ? 'attention' : 'info',
    project: 'acme/api',
    title: `Change ${n}`,
    at: new Date(Date.UTC(2026, 9, 14, 12, n)).toISOString(),
  }
}

type Step = PollResult | object
const ok = (signals: Signal[], extra: Partial<PollResult> = {}): PollResult => ({ signals, notices: [], ...extra })

function fakeSource(id: string, steps: Step[]): Source & { poll: ReturnType<typeof vi.fn> } {
  return {
    id,
    interval: 0,
    poll: vi.fn(async () => {
      const next = steps.shift() ?? ok([])
      if ('kind' in next) throw next
      return next as PollResult
    }),
  }
}

function setup(sources: Source[], overrides: Partial<BoardDeps> = {}) {
  const state = initialBoardState()
  const deps = {
    sources: () => sources,
    sourceLanes: (id: string): Lane[] => (id === 'github' ? ['incoming', 'outgoing'] : ['outgoing']),
    seen: new SeenStore(),
    saveSeen: vi.fn(async () => {}),
    notify: vi.fn(),
    setBadge: vi.fn(),
    settings: () => DEFAULT_SETTINGS,
    order: ORDER,
    isLoud: (s: Signal) => (s.lane === 'incoming' ? s.kind !== 'my-pr' : s.severity !== 'info'),
    describe: (s: Signal) => `New ${s.kind}`,
    recovery: { passing: 'ci-passed', failing: ['ci-failed'], recovered: 'ci-fixed', visibleMs: 30 * 60_000 },
    now: () => new Date('2026-10-14T12:30:00Z'),
    ...overrides,
  } satisfies BoardDeps
  return { state, deps, board: createBoard(state, deps) }
}

const notified = (deps: BoardDeps) => vi.mocked(deps.notify).mock.calls.flatMap(([specs]) => specs)

describe('createBoard', () => {
  it('stays quiet on the first run but leaves everything unseen', async () => {
    const { state, deps, board } = setup([fakeSource('github', [ok([signal(1), signal(2)], { account: 'alice' })])])
    await board.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.badge).toBe(2)
    expect(deps.setBadge).toHaveBeenLastCalledWith(2)
    expect(state.account).toBe('alice')
  })

  it('notifies only items it has not notified before', async () => {
    const { deps, board } = setup([fakeSource('github', [ok([signal(1)]), ok([signal(1), signal(2)]), ok([signal(1), signal(2)])])])
    await board.refresh()
    await board.refresh()
    await board.refresh()
    expect(notified(deps).map((spec) => spec.url)).toEqual([signal(2).url])
  })

  it('neither notifies nor counts quiet signals', async () => {
    const { state, deps, board } = setup([fakeSource('github', [ok([]), ok([signal(5, 'my-pr'), signal(6, 'deploy-ok')])])])
    await board.refresh()
    await board.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.badge).toBe(0)
    expect(state.unseen[signal(5, 'my-pr').id]).toBe(true)
  })

  it('counts loud outgoing signals in the badge of their lane', async () => {
    const { state, board } = setup([
      fakeSource('github', [ok([signal(1)])]),
      fakeSource('forge', [ok([signal(2, 'deploy-failed', 'forge'), signal(3, 'deploy-ok', 'forge')])]),
    ])
    await board.refresh()
    expect(state.laneBadges).toEqual({ incoming: 1, outgoing: 1, agents: 0 })
    expect(state.badge).toBe(2)
  })

  it('respects the notification setting', async () => {
    const { deps, board } = setup([fakeSource('github', [ok([]), ok([signal(1)])])], {
      settings: () => ({ ...DEFAULT_SETTINGS, notifications: false }),
    })
    await board.refresh()
    await board.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('keeps the last list and shows the error on the lanes the source feeds', async () => {
    const { state, board } = setup([fakeSource('github', [ok([signal(1)]), { kind: 'network', message: 'offline' }])])
    await board.refresh()
    await board.refresh()
    expect(state.problems).toEqual([{ source: 'github', lanes: ['incoming', 'outgoing'], error: { kind: 'network', message: 'offline' } }])
    expect(state.lanes.incoming[0].signals).toHaveLength(1)
    expect(state.refreshing).toBe(false)
  })

  it('lets one source fail without touching the others', async () => {
    const { state, board } = setup([
      fakeSource('github', [ok([signal(1)])]),
      fakeSource('sentry', [{ kind: 'service-unauthorized', service: 'Sentry' }]),
    ])
    await board.refresh()
    expect(state.lanes.incoming[0].signals).toHaveLength(1)
    expect(state.problems).toEqual([{ source: 'sentry', lanes: ['outgoing'], error: { kind: 'service-unauthorized', service: 'Sentry' } }])
  })

  it('clears the error once the source succeeds again', async () => {
    const { state, board } = setup([fakeSource('github', [{ kind: 'network', message: 'offline' }, ok([])])])
    await board.refresh()
    await board.refresh()
    expect(state.problems).toEqual([])
  })

  it('does not ask a rate-limited source again until it resets', async () => {
    const forge = fakeSource('forge', [{ kind: 'service-rate-limited', service: 'Forge', resetAt: '2026-10-14T13:00:00Z' }])
    const github = fakeSource('github', [])
    const { state, board } = setup([github, forge])
    await board.refresh()
    await board.refresh()
    expect(forge.poll).toHaveBeenCalledTimes(1)
    expect(github.poll).toHaveBeenCalledTimes(2)
    expect(state.problems[0].error.kind).toBe('service-rate-limited')
  })

  it('stays quiet on the first run of a source added later', async () => {
    const sources: Source[] = [fakeSource('github', [ok([]), ok([])])]
    const { deps, board } = setup([], { sources: () => sources })
    await board.refresh()
    sources.push(fakeSource('forge', [ok([signal(1, 'deploy-failed', 'forge')]), ok([signal(1, 'deploy-failed', 'forge'), signal(2, 'deploy-failed', 'forge')])]))
    await board.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
    await board.refresh()
    expect(notified(deps)).toHaveLength(1)
  })

  it('does not count a failed first poll as the first run', async () => {
    const { deps, board } = setup([fakeSource('forge', [{ kind: 'network', message: 'x' }, ok([signal(1, 'deploy-failed', 'forge')])])])
    await board.refresh()
    await board.refresh()
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('forgets the signals of a source that was turned off', async () => {
    const sources: Source[] = [fakeSource('forge', [ok([signal(1, 'deploy-failed', 'forge')])])]
    const { state, board } = setup([], { sources: () => sources })
    await board.refresh()
    sources.length = 0
    await board.refresh()
    expect(state.lanes.outgoing).toEqual([])
  })

  it('shows a check that went green as fixed, and does not notify it', async () => {
    const { state, deps, board } = setup([fakeSource('github', [ok([]), ok([signal(1, 'ci-failed')]), ok([signal(1, 'ci-passed')])])])
    await board.refresh()
    await board.refresh()
    await board.refresh()
    expect(state.lanes.outgoing.map((section) => section.kind)).toEqual(['ci-fixed'])
    expect(notified(deps)).toHaveLength(1)
  })

  it('queues a refresh requested while one runs, and runs it once', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    const github = fakeSource('github', [])
    github.poll.mockImplementationOnce(async () => {
      await blocked
      return ok([])
    })
    const { board } = setup([github])
    const first = board.refresh()
    void board.refresh()
    void board.refresh()
    release()
    await first
    expect(github.poll).toHaveBeenCalledTimes(2)
  })

  it('updates the badge and saves when items are marked seen', async () => {
    const { state, deps, board } = setup([fakeSource('github', [ok([signal(1), signal(2)])])])
    await board.refresh()
    await board.markSeen([signal(1).id])
    expect(state.badge).toBe(1)
    expect(state.unseen[signal(1).id]).toBeUndefined()
    expect(deps.saveSeen).toHaveBeenCalledTimes(2)
  })

  it('starts over when GitHub reports a different account', async () => {
    const { state, deps, board } = setup([fakeSource('github', [ok([signal(1)], { account: 'alice' }), ok([signal(1)], { account: 'bob' })])])
    await board.refresh()
    await board.markSeen([signal(1).id])
    await board.refresh()
    expect(state.unseen[signal(1).id]).toBe(true)
    expect(deps.notify).not.toHaveBeenCalled()
    expect(state.account).toBe('bob')
  })

  it('shows a failed save of seen.json instead of hiding it', async () => {
    const { state, board } = setup([fakeSource('github', [ok([signal(1)])])], {
      saveSeen: vi.fn(async () => Promise.reject(new Error('disk full'))),
    })
    await board.refresh()
    expect(state.problems).toEqual([
      { source: 'storage', lanes: ['incoming', 'outgoing', 'agents'], error: { kind: 'unknown', message: 'could not save seen.json: disk full' } },
    ])
    expect(state.lanes.incoming).toHaveLength(1)
  })
})
