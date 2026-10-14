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

export function spokenAge(at: string | Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - new Date(at).getTime())
  const units: [number, string][] = [
    [365 * DAY, 'year'],
    [30 * DAY, 'month'],
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
  ]
  const [size, unit] = units.find(([size]) => elapsed >= size) ?? [0, '']
  if (!size) return 'just now'
  const count = Math.floor(elapsed / size)
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

export function hueFor(text: string): number {
  let hash = 0
  for (const char of text.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}
