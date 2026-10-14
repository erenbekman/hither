import type { SeenStore } from './seen-store'
import type { Signal } from './types'

export interface RecoveryRule {
  passing: string
  failing: readonly string[]
  recovered: string
  visibleMs: number
}

export function deriveRecoveries(signals: Signal[], seen: SeenStore, now: Date, rule: RecoveryRule): Signal[] {
  return signals.flatMap((signal) => {
    if (signal.kind !== rule.passing) return [signal]
    const previous = seen.kindOf(signal.id)
    if (previous !== undefined && rule.failing.includes(previous)) {
      seen.markFixed(signal.id, now)
      return [{ ...signal, kind: rule.recovered, severity: 'info' as const, at: now.toISOString() }]
    }
    const fixedAt = seen.fixedAt(signal.id)
    if (fixedAt && now.getTime() - Date.parse(fixedAt) < rule.visibleMs) {
      return [{ ...signal, kind: rule.recovered, severity: 'info' as const, at: fixedAt }]
    }
    return []
  })
}
