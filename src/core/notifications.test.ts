import { describe, expect, it } from 'vitest'
import { canNotify, isQuietTime, notificationsFor } from './notifications'
import { DEFAULT_SETTINGS } from './settings'
import type { Signal } from './types'

const signal = (n: number): Signal => ({
  id: `https://github.com/acme/api/pull/${n}`,
  url: `https://github.com/acme/api/pull/${n}`,
  source: 'github',
  lane: 'incoming',
  kind: 'pr',
  severity: 'info',
  project: 'acme/api',
  title: `Fix ${n}`,
  actor: 'carol',
  at: '2026-10-14T12:00:00Z',
})
const describeSignal = (s: Signal) => `New pull request #${s.id.split('/').pop()}`

describe('notificationsFor', () => {
  it('sends one notification per item up to five', () => {
    const specs = notificationsFor([1, 2, 3, 4, 5].map(signal), describeSignal)
    expect(specs).toHaveLength(5)
    expect(specs[0]).toEqual({
      title: 'New pull request #1 · api',
      body: 'Fix 1\n@carol',
      id: 'https://github.com/acme/api/pull/1',
      url: 'https://github.com/acme/api/pull/1',
    })
  })

  it('collapses more than five items into one summary', () => {
    const specs = notificationsFor([1, 2, 3, 4, 5, 6].map(signal), describeSignal)
    expect(specs).toEqual([{ title: '6 new items', body: '6 new items need your attention.' }])
  })

  it('sends nothing when nothing is new', () => {
    expect(notificationsFor([], describeSignal)).toEqual([])
  })
})

describe('isQuietTime', () => {
  const at = (hours: number, minutes = 0) => new Date(2026, 9, 14, hours, minutes)

  it('covers a window that crosses midnight', () => {
    expect(isQuietTime('22:00', '08:00', at(23))).toBe(true)
    expect(isQuietTime('22:00', '08:00', at(7, 59))).toBe(true)
    expect(isQuietTime('22:00', '08:00', at(8))).toBe(false)
    expect(isQuietTime('22:00', '08:00', at(21, 59))).toBe(false)
  })

  it('covers a window within one day', () => {
    expect(isQuietTime('12:00', '13:30', at(13, 15))).toBe(true)
    expect(isQuietTime('12:00', '13:30', at(13, 30))).toBe(false)
  })

  it('is never quiet when start and end are the same', () => {
    expect(isQuietTime('09:00', '09:00', at(9))).toBe(false)
  })
})

describe('canNotify', () => {
  const night = new Date(2026, 9, 14, 23, 0)
  const noon = new Date(2026, 9, 14, 12, 0)

  it('follows the main switch and the lane switches', () => {
    expect(canNotify(DEFAULT_SETTINGS, 'incoming', noon)).toBe(true)
    expect(canNotify({ ...DEFAULT_SETTINGS, notifications: false }, 'incoming', noon)).toBe(false)
    expect(canNotify({ ...DEFAULT_SETTINGS, notificationLanes: ['outgoing'] }, 'incoming', noon)).toBe(false)
    expect(canNotify({ ...DEFAULT_SETTINGS, notificationLanes: ['outgoing'] }, 'outgoing', noon)).toBe(true)
  })

  it('stays silent during quiet hours only when they are on', () => {
    const quiet = { ...DEFAULT_SETTINGS, quietHours: true, quietStart: '22:00', quietEnd: '08:00' }
    expect(canNotify(quiet, 'outgoing', night)).toBe(false)
    expect(canNotify(quiet, 'outgoing', noon)).toBe(true)
    expect(canNotify({ ...quiet, quietHours: false }, 'outgoing', night)).toBe(true)
  })
})

