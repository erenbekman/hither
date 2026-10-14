import type { Settings } from './settings'
import type { Lane, Signal } from './types'

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

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))

export function isQuietTime(start: string, end: string, now: Date): boolean {
  const from = minutesOf(start)
  const to = minutesOf(end)
  const at = now.getHours() * 60 + now.getMinutes()
  return from <= to ? at >= from && at < to : at >= from || at < to
}

export function canNotify(
  settings: Pick<Settings, 'notifications' | 'notificationLanes' | 'quietHours' | 'quietStart' | 'quietEnd'>,
  lane: Lane,
  now: Date,
): boolean {
  if (!settings.notifications || !settings.notificationLanes.includes(lane)) return false
  return !(settings.quietHours && isQuietTime(settings.quietStart, settings.quietEnd, now))
}
