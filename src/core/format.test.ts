import { describe, expect, it } from 'vitest'
import { ago, hueFor } from './format'

const now = new Date('2026-10-14T12:00:00Z')
const before = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('ago', () => {
  it('rounds down to the largest unit', () => {
    expect(ago(before(30_000), now)).toBe('now')
    expect(ago(before(5 * 60_000), now)).toBe('5m')
    expect(ago(before(3 * 3_600_000 + 59 * 60_000), now)).toBe('3h')
    expect(ago(before(2 * 86_400_000), now)).toBe('2d')
    expect(ago(before(65 * 86_400_000), now)).toBe('2mo')
    expect(ago(before(800 * 86_400_000), now)).toBe('2y')
  })

  it('treats a date in the future as now', () => {
    expect(ago(before(-60_000), now)).toBe('now')
  })
})

describe('hueFor', () => {
  it('gives the same login the same hue, whatever the case', () => {
    expect(hueFor('Carol')).toBe(hueFor('carol'))
    expect(hueFor('carol')).toBeGreaterThanOrEqual(0)
    expect(hueFor('carol')).toBeLessThan(360)
    expect(hueFor('carol')).not.toBe(hueFor('dave'))
  })
})
