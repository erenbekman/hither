import { describe, expect, it } from 'vitest'
import type { Signal } from './core/types'
import { isOverdue } from './lanes'

const review = (hoursAgo: number, kind = 'review-requested'): Signal => ({
  id: 'r',
  source: 'github',
  lane: 'incoming',
  kind,
  severity: 'attention',
  project: 'acme/api',
  title: 'Change',
  at: new Date(Date.UTC(2026, 9, 14, 12) - hoursAgo * 3_600_000).toISOString(),
})
const now = new Date(Date.UTC(2026, 9, 14, 12))

describe('isOverdue', () => {
  it('flags review requests older than the limit', () => {
    expect(isOverdue(review(23), now, 24)).toBe(false)
    expect(isOverdue(review(24), now, 24)).toBe(true)
  })

  it('never flags other kinds, or anything when the limit is zero', () => {
    expect(isOverdue(review(48, 'pr'), now, 24)).toBe(false)
    expect(isOverdue(review(48), now, 0)).toBe(false)
  })
})
