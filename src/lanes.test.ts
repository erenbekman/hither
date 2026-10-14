import { describe, expect, it } from 'vitest'
import type { Signal } from './core/types'
import { chipFor, isOverdue, subtitle } from './lanes'

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

describe('chipFor', () => {
  const signal = (kind: string, extra: Partial<Signal> = {}): Signal => ({ ...review(1, kind), ...extra })

  it('names each kind in a word or two, colored by how much it asks of you', () => {
    expect(chipFor(signal('review-requested'))).toEqual({ label: 'Review', tone: 'orange' })
    expect(chipFor(signal('conflicting'))).toEqual({ label: 'Conflicts', tone: 'red' })
    expect(chipFor(signal('ready-to-merge'))).toEqual({ label: 'Ready', tone: 'green' })
    expect(chipFor(signal('pr'))).toBeUndefined()
    expect(chipFor(signal('activity', { meta: { reason: 'comment' } }))).toEqual({ label: 'Comment', tone: 'blue' })
    expect(chipFor(signal('activity', { meta: { reason: 'mention' } }))).toEqual({ label: 'Mention', tone: 'blue' })
    expect(chipFor(signal('ci-main-failed', { lane: 'outgoing', meta: { branch: 'main' } }))).toEqual({ label: 'main is red', tone: 'red' })
    expect(chipFor(signal('deploy-ok', { lane: 'outgoing' }))).toEqual({ label: 'Deployed', tone: 'green' })
    expect(chipFor(signal('agent-waiting', { lane: 'agents' }))).toEqual({ label: 'Waiting', tone: 'orange' })
  })
})

describe('subtitle', () => {
  it('reads like GHBar: repository name, number and author', () => {
    const pr = { ...review(1, 'pr'), project: 'acme/api', actor: 'carol', meta: { number: 418, isDraft: true } }
    expect(subtitle(pr)).toBe('api #418 by carol, draft')
    expect(subtitle({ ...pr, actor: undefined, meta: { number: 7 } })).toBe('api #7')
  })
})

