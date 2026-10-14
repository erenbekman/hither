import type { Signal } from './types'

export interface NotificationSpec {
  title: string
  body: string
  id?: string
  url?: string
}

export const SUMMARY_THRESHOLD = 5

export function notificationsFor(signals: Signal[], describe: (signal: Signal) => string): NotificationSpec[] {
  if (signals.length > SUMMARY_THRESHOLD) {
    return [{ title: `${signals.length} new items`, body: `${signals.length} new items need your attention.` }]
  }
  return signals.map((signal) => ({
    title: `${describe(signal)} · ${signal.project.split('/').pop()}`,
    body: signal.actor ? `${signal.title}\n@${signal.actor}` : signal.title,
    id: signal.id,
    url: signal.url,
  }))
}
