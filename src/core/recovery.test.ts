import { describe, expect, it } from 'vitest'
import { deriveRecoveries, type RecoveryRule } from './recovery'
import { SeenStore } from './seen-store'
import type { Signal } from './types'

const rule: RecoveryRule = { passing: 'ci-passed', failing: ['ci-failed'], recovered: 'ci-fixed', visibleMs: 30 * 60_000 }
const ci = (kind: string): Signal => ({
  id: 'ci:pr/1',
  source: 'github',
  lane: 'outgoing',
  kind,
  severity: kind === 'ci-failed' ? 'attention' : 'info',
  project: 'acme/api',
  title: 'Fix',
  at: '2026-10-14T11:00:00.000Z',
})
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 12, minutes))

describe('deriveRecoveries', () => {
  it('drops a passing check that was never red', () => {
    expect(deriveRecoveries([ci('ci-passed')], new SeenStore(), at(0), rule)).toEqual([])
  })

  it('turns a red check that went green into a recovery', () => {
    const seen = new SeenStore()
    seen.promote(new Map([['ci:pr/1', 'ci-failed']]), ['ci-failed', 'ci-fixed'])
    const [signal] = deriveRecoveries([ci('ci-passed')], seen, at(0), rule)
    expect(signal).toMatchObject({ kind: 'ci-fixed', severity: 'info', at: at(0).toISOString() })
  })

  it('keeps the recovery visible for thirty minutes, then drops it', () => {
    const seen = new SeenStore()
    seen.promote(new Map([['ci:pr/1', 'ci-failed']]), ['ci-failed', 'ci-fixed'])
    deriveRecoveries([ci('ci-passed')], seen, at(0), rule)
    seen.promote(new Map([['ci:pr/1', 'ci-fixed']]), ['ci-failed', 'ci-fixed'])
    expect(deriveRecoveries([ci('ci-passed')], seen, at(29), rule)).toHaveLength(1)
    expect(deriveRecoveries([ci('ci-passed')], seen, at(31), rule)).toEqual([])
  })

  it('leaves other signals alone', () => {
    expect(deriveRecoveries([ci('ci-failed')], new SeenStore(), at(0), rule)).toEqual([ci('ci-failed')])
  })
})
