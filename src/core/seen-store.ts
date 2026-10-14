export interface SeenState {
  version: 1
  account?: string
  bootstrapped: boolean
  seen: Record<string, string>
  notified: string[]
  returned: Record<string, string>
  kinds: Record<string, string>
}

const TWO_WEEKS_MS = 14 * 86_400_000

const emptyState = (): SeenState => ({ version: 1, bootstrapped: false, seen: {}, notified: [], returned: {}, kinds: {} })

const isRecordOfStrings = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === 'string')

function restore(raw: unknown): SeenState {
  if (typeof raw !== 'object' || raw === null) return emptyState()
  const state = raw as Partial<SeenState>
  if (
    state.version !== 1 ||
    typeof state.bootstrapped !== 'boolean' ||
    !isRecordOfStrings(state.seen) ||
    !Array.isArray(state.notified) ||
    !state.notified.every((id) => typeof id === 'string') ||
    !isRecordOfStrings(state.returned) ||
    !isRecordOfStrings(state.kinds)
  ) {
    return emptyState()
  }
  return {
    version: 1,
    account: typeof state.account === 'string' ? state.account : undefined,
    bootstrapped: state.bootstrapped,
    seen: { ...state.seen },
    notified: [...state.notified],
    returned: { ...state.returned },
    kinds: { ...state.kinds },
  }
}

export class SeenStore {
  private state: SeenState
  private notified: Set<string>

  constructor(raw?: unknown) {
    this.state = restore(raw)
    this.notified = new Set(this.state.notified)
  }

  get account(): string | undefined {
    return this.state.account
  }

  get isFirstRun(): boolean {
    return !this.state.bootstrapped
  }

  isSeen(id: string): boolean {
    return id in this.state.seen
  }

  markSeen(ids: string[], now: Date): void {
    for (const id of ids) this.state.seen[id] = now.toISOString()
  }

  unseen<T extends { id: string }>(items: T[]): T[] {
    return items.filter((item) => !this.isSeen(item.id))
  }

  markFirstRunDone(): boolean {
    if (this.state.bootstrapped) return false
    this.state.bootstrapped = true
    return true
  }

  unnotified<T extends { id: string }>(items: T[]): T[] {
    return items.filter((item) => !this.notified.has(item.id))
  }

  markNotified(ids: string[]): void {
    for (const id of ids) this.notified.add(id)
  }

  recordReturned(ids: Iterable<string>, now: Date): void {
    const at = now.toISOString()
    for (const id of ids) this.state.returned[id] = at
  }

  prune(now: Date, maxAgeMs = TWO_WEEKS_MS): void {
    for (const [id, at] of Object.entries(this.state.returned)) {
      if (now.getTime() - Date.parse(at) <= maxAgeMs) continue
      delete this.state.returned[id]
      delete this.state.seen[id]
      delete this.state.kinds[id]
      this.notified.delete(id)
    }
  }

  promote(placement: Map<string, string>, order: readonly string[]): Set<string> {
    const promoted = new Set<string>()
    for (const [id, kind] of placement) {
      const before = order.indexOf(this.state.kinds[id] ?? '')
      const after = order.indexOf(kind)
      if (before >= 0 && after >= 0 && after < before) {
        promoted.add(id)
        delete this.state.seen[id]
        this.notified.delete(id)
      }
      this.state.kinds[id] = kind
    }
    return promoted
  }

  switchAccount(account: string): boolean {
    if (this.state.account === account) return false
    const changed = this.state.account !== undefined
    if (changed) this.reset()
    this.state.account = account
    return changed
  }

  reset(): void {
    this.state = emptyState()
    this.notified = new Set()
  }

  toJSON(): SeenState {
    return { ...this.state, notified: [...this.notified] }
  }
}
