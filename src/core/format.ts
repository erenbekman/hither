const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function ago(at: string | Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - new Date(at).getTime())
  if (elapsed < MINUTE) return 'now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d`
  if (elapsed < 365 * DAY) return `${Math.floor(elapsed / (30 * DAY))}mo`
  return `${Math.floor(elapsed / (365 * DAY))}y`
}
