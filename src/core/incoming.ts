import { errorText, toAppError, type AppError } from './errors'
import { buildSections, type Section } from './filtering'
import { notificationsFor, type NotificationSpec } from './notifications'
import { RefreshGate } from './refresh-gate'
import type { SeenState, SeenStore } from './seen-store'
import type { Settings } from './settings'
import type { Signal, Source } from './types'

export interface IncomingState {
  refreshing: boolean
  sections: Section[]
  errors: AppError[]
  notices: string[]
  unseen: Record<string, true>
  badge: number
  account?: string
  lastRefresh?: string
  rateLimitedUntil?: string
}

export interface IncomingDeps {
  source: Source
  seen: SeenStore
  saveSeen: (state: SeenState) => Promise<void>
  notify: (specs: NotificationSpec[]) => void
  setBadge: (count: number) => void
  settings: () => Settings
  order: readonly string[]
  quietKinds: readonly string[]
  describe: (signal: Signal) => string
  now?: () => Date
}

export const initialIncomingState = (): IncomingState => ({
  refreshing: false,
  sections: [],
  errors: [],
  notices: [],
  unseen: {},
  badge: 0,
})

export function createIncoming(state: IncomingState, deps: IncomingDeps) {
  const gate = new RefreshGate()
  const now = deps.now ?? (() => new Date())
  let lastAttempt = 0

  const loud = () => state.sections.filter((section) => !deps.quietKinds.includes(section.kind))

  function updateUnseen() {
    const all = state.sections.flatMap((section) => section.signals)
    state.unseen = Object.fromEntries(deps.seen.unseen(all).map((signal) => [signal.id, true as const]))
    state.badge = loud().flatMap((section) => section.signals).filter((signal) => state.unseen[signal.id]).length
    deps.setBadge(state.badge)
  }

  async function persist(): Promise<AppError | undefined> {
    try {
      await deps.saveSeen(deps.seen.toJSON())
    } catch (error) {
      return { kind: 'unknown', message: `could not save seen.json: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  async function poll() {
    const until = state.rateLimitedUntil
    if (until && Date.parse(until) > now().getTime()) return

    const settings = deps.settings()
    const controller = new AbortController()
    try {
      const result = await deps.source.poll({ signal: controller.signal })
      const at = now()
      if (result.account) deps.seen.switchAccount(result.account)

      const sections = buildSections(result.signals, {
        order: deps.order,
        hiddenKinds: settings.hiddenKinds,
        showBots: settings.showBots,
        showDrafts: settings.showDrafts,
        groupThreshold: settings.repoGroupThreshold,
      })
      const shown = sections.flatMap((section) => section.signals)

      deps.seen.recordReturned(new Set(result.signals.map((signal) => signal.id)), at)
      deps.seen.prune(at)
      deps.seen.promote(new Map(sections.flatMap((section) => section.signals.map((s) => [s.id, section.kind] as const))), deps.order)

      const loudSignals = sections.filter((section) => !deps.quietKinds.includes(section.kind)).flatMap((section) => section.signals)
      const firstRun = deps.seen.markFirstRunDone()
      const fresh = firstRun ? [] : deps.seen.unnotified(loudSignals)
      deps.seen.markNotified(shown.map((signal) => signal.id))
      const saveError = await persist()
      if (settings.notifications && fresh.length > 0) deps.notify(notificationsFor(fresh, deps.describe))

      state.sections = sections
      state.account = result.account ?? state.account
      state.notices = result.retryAt
        ? [...result.notices, errorText({ kind: 'github-rate-limited', resetAt: result.retryAt })]
        : result.notices
      state.rateLimitedUntil = result.retryAt
      state.lastRefresh = at.toISOString()
      state.errors = saveError ? [saveError] : []
    } catch (error) {
      const appError = toAppError(error)
      if (appError.kind === 'github-rate-limited') state.rateLimitedUntil = appError.resetAt
      state.errors = [appError]
    }
    updateUnseen()
  }

  async function refresh(): Promise<void> {
    if (!gate.begin()) return
    lastAttempt = now().getTime()
    state.refreshing = true
    try {
      await poll()
    } finally {
      state.refreshing = false
      if (gate.finish()) await refresh()
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
      const saveError = await persist()
      if (saveError) state.errors = [...state.errors, saveError]
    },
  }
}
