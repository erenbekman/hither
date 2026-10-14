import { errorText, toAppError, type AppError } from './errors'
import { buildSections, type Section } from './filtering'
import { notificationsFor, type NotificationSpec } from './notifications'
import { deriveRecoveries, type RecoveryRule } from './recovery'
import { RefreshGate } from './refresh-gate'
import type { SeenState, SeenStore } from './seen-store'
import type { Settings } from './settings'
import type { Lane, Signal, Source } from './types'

export interface Problem {
  source: string
  lanes: Lane[]
  error: AppError
}

export interface Notice {
  source: string
  lanes: Lane[]
  text: string
}

export interface BoardState {
  refreshing: boolean
  lanes: Record<Lane, Section[]>
  problems: Problem[]
  notices: Notice[]
  unseen: Record<string, true>
  badge: number
  laneBadges: Record<Lane, number>
  account?: string
  lastRefresh?: string
}

export interface BoardDeps {
  sources: () => Source[]
  sourceLanes: (source: string) => Lane[]
  seen: SeenStore
  saveSeen: (state: SeenState) => Promise<void>
  notify: (specs: NotificationSpec[]) => void
  setBadge: (count: number) => void
  settings: () => Settings
  order: Record<Lane, readonly string[]>
  isLoud: (signal: Signal) => boolean
  describe: (signal: Signal) => string
  recovery: RecoveryRule
  now?: () => Date
}

const LANES: Lane[] = ['incoming', 'outgoing', 'agents']

export const initialBoardState = (): BoardState => ({
  refreshing: false,
  lanes: { incoming: [], outgoing: [], agents: [] },
  problems: [],
  notices: [],
  unseen: {},
  badge: 0,
  laneBadges: { incoming: 0, outgoing: 0, agents: 0 },
})

const isRateLimit = (error: AppError): error is Extract<AppError, { resetAt: string }> =>
  error.kind === 'github-rate-limited' || error.kind === 'service-rate-limited'

export function createBoard(state: BoardState, deps: BoardDeps) {
  const gate = new RefreshGate()
  const now = deps.now ?? (() => new Date())
  const signals = new Map<string, Signal[]>()
  const problems = new Map<string, AppError>()
  const notices = new Map<string, string[]>()
  const blockedUntil = new Map<string, string>()
  let saveProblem: AppError | undefined
  let lastAttempt = 0
  let queued: Set<string> | 'all' | undefined

  function updateUnseen() {
    const shown = LANES.flatMap((lane) => state.lanes[lane].flatMap((section) => section.signals))
    state.unseen = Object.fromEntries(deps.seen.unseen(shown).map((signal) => [signal.id, true as const]))
    for (const lane of LANES) {
      state.laneBadges[lane] = state.lanes[lane]
        .flatMap((section) => section.signals)
        .filter((signal) => state.unseen[signal.id] && deps.isLoud(signal)).length
    }
    state.badge = LANES.reduce((sum, lane) => sum + state.laneBadges[lane], 0)
    deps.setBadge(state.badge)
  }

  function publishStatus() {
    state.problems = [...problems].map(([source, error]) => ({ source, lanes: deps.sourceLanes(source), error }))
    if (saveProblem) state.problems.push({ source: 'storage', lanes: LANES, error: saveProblem })
    state.notices = [...notices].flatMap(([source, texts]) =>
      texts.map((text) => ({ source, lanes: deps.sourceLanes(source), text })),
    )
  }

  async function persist() {
    try {
      await deps.saveSeen(deps.seen.toJSON())
      saveProblem = undefined
    } catch (error) {
      saveProblem = { kind: 'unknown', message: `could not save seen.json: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  async function pollOne(source: Source): Promise<boolean> {
    const until = blockedUntil.get(source.id)
    if (until && Date.parse(until) > now().getTime()) return false
    blockedUntil.delete(source.id)
    try {
      const result = await source.poll({ signal: new AbortController().signal })
      if (result.account) {
        deps.seen.switchAccount(result.account)
        state.account = result.account
      }
      signals.set(source.id, result.signals)
      problems.delete(source.id)
      const texts = [...result.notices]
      if (result.retryAt) {
        blockedUntil.set(source.id, result.retryAt)
        texts.push(errorText({ kind: 'github-rate-limited', resetAt: result.retryAt }))
      }
      notices.set(source.id, texts)
      return true
    } catch (error) {
      const appError = toAppError(error)
      if (isRateLimit(appError)) blockedUntil.set(source.id, appError.resetAt)
      problems.set(source.id, appError)
      return false
    }
  }

  async function poll(only?: string[]) {
    const sources = deps.sources()
    const active = new Set(sources.map((source) => source.id))
    for (const map of [signals, problems, notices, blockedUntil]) {
      for (const id of map.keys()) if (!active.has(id)) map.delete(id)
    }

    const targets = only ? sources.filter((source) => only.includes(source.id)) : sources
    const outcomes = await Promise.all(targets.map(async (source) => [source.id, await pollOne(source)] as const))
    const at = now()
    const settings = deps.settings()

    const all = deriveRecoveries([...signals.values()].flat(), deps.seen, at, deps.recovery)
    deps.seen.recordReturned(new Set([...signals.values()].flat().map((signal) => signal.id)), at)
    deps.seen.prune(at)

    const options = {
      hiddenKinds: settings.hiddenKinds,
      showBots: settings.showBots,
      showDrafts: settings.showDrafts,
      groupThreshold: settings.repoGroupThreshold,
    }
    const lanes = Object.fromEntries(
      LANES.map((lane) => [lane, buildSections(all.filter((s) => s.lane === lane), { ...options, order: deps.order[lane] })]),
    ) as Record<Lane, Section[]>
    const shown = LANES.flatMap((lane) => lanes[lane].flatMap((section) => section.signals))
    const fullOrder = LANES.flatMap((lane) => deps.order[lane])
    deps.seen.promote(new Map(LANES.flatMap((lane) => lanes[lane].flatMap((section) => section.signals.map((s) => [s.id, section.kind] as const)))), fullOrder)

    const quietSources = new Set(
      outcomes.filter(([id, ok]) => ok && deps.seen.markFirstRunDone(id)).map(([id]) => id),
    )
    const fresh = deps.seen.unnotified(shown.filter((signal) => deps.isLoud(signal) && !quietSources.has(signal.source)))
    deps.seen.markNotified(shown.map((signal) => signal.id))
    await persist()
    if (settings.notifications && fresh.length > 0) deps.notify(notificationsFor(fresh, deps.describe))

    state.lanes = lanes
    if (!only && outcomes.some(([, ok]) => ok)) state.lastRefresh = at.toISOString()
    publishStatus()
    updateUnseen()
  }

  async function refresh(only?: string[]): Promise<void> {
    if (!gate.begin()) {
      if (!only || queued === 'all') queued = 'all'
      else queued = new Set([...(queued ?? []), ...only])
      return
    }
    if (!only) {
      lastAttempt = now().getTime()
      state.refreshing = true
    }
    try {
      await poll(only)
    } finally {
      if (!only) state.refreshing = false
      if (gate.finish()) {
        const next = queued
        queued = undefined
        await refresh(next === 'all' || next === undefined ? undefined : [...next])
      }
    }
  }

  return {
    refresh,
    refreshIfOlderThan(ms: number): Promise<void> | undefined {
      if (now().getTime() - lastAttempt >= ms) return refresh()
    },
    async markSeen(ids: string[]) {
      deps.seen.markSeen(ids, now())
      updateUnseen()
      await persist()
      publishStatus()
    },
  }
}
