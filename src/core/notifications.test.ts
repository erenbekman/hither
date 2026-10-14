import { describe, expect, it } from 'vitest'
import { notificationsFor } from './notifications'
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
