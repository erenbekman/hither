import type { QuotaVisibility } from '../../core/settings'
import type { Quota, Signal } from '../../core/types'

export const LOW_QUOTA = 0.25

export const isQuotaLow = (quota: Quota) => quota.limit > 0 && quota.remaining / quota.limit < LOW_QUOTA

export const showsQuota = (visibility: QuotaVisibility, quota: Quota | undefined): quota is Quota =>
  quota !== undefined && (visibility === 'always' || (visibility === 'low' && isQuotaLow(quota)))

export function countRepos(previous: Record<string, number>, signals: Signal[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(Object.keys(previous).map((repo) => [repo, 0]))
  for (const signal of signals) if (signal.source === 'github') counts[signal.project] = (counts[signal.project] ?? 0) + 1
  return counts
}
