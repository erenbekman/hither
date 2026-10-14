import type { Signal } from './types'

export type Row = { type: 'item'; signal: Signal } | { type: 'group'; project: string; signals: Signal[] }

export interface Section {
  kind: string
  rows: Row[]
  signals: Signal[]
}

export interface FilterOptions {
  order: readonly string[]
  hiddenKinds: string[]
  showBots: boolean
  showDrafts: boolean
  groupThreshold: number
}

export function buildSections(signals: Signal[], options: FilterOptions): Section[] {
  const claimed = new Set<string>()
  const sections: Section[] = []

  for (const kind of options.order) {
    if (options.hiddenKinds.includes(kind)) continue
    const kept = signals
      .filter((signal) => signal.kind === kind && !claimed.has(signal.id))
      .filter((signal) => options.showBots || signal.meta?.isBot !== true)
      .filter((signal) => options.showDrafts || signal.meta?.isDraft !== true)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    for (const signal of kept) claimed.add(signal.id)
    if (kept.length > 0) sections.push({ kind, rows: rows(kept, options.groupThreshold), signals: kept })
  }
  return sections
}

function rows(signals: Signal[], threshold: number): Row[] {
  if (threshold <= 0) return signals.map((signal) => ({ type: 'item', signal }))

  const counts = new Map<string, number>()
  for (const signal of signals) counts.set(signal.project, (counts.get(signal.project) ?? 0) + 1)

  const result: Row[] = []
  const emitted = new Set<string>()
  for (const signal of signals) {
    if ((counts.get(signal.project) ?? 0) <= threshold) {
      result.push({ type: 'item', signal })
    } else if (!emitted.has(signal.project)) {
      emitted.add(signal.project)
      result.push({ type: 'group', project: signal.project, signals: signals.filter((s) => s.project === signal.project) })
    }
  }
  return result
}
