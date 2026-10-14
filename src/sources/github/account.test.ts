import { describe, expect, it } from 'vitest'
import type { Signal } from '../../core/types'
import { countRepos, showsQuota } from './account'

const quota = (remaining: number) => ({ limit: 5000, remaining, resetAt: '2026-10-14T13:00:00Z' })
const signal = (project: string, source: Signal['source'] = 'github'): Signal => ({
  id: `${project}:${Math.random()}`,
  source,
  lane: 'incoming',
  kind: 'pr',
  severity: 'info',
  project,
  title: 'Change',
  at: '2026-10-14T12:00:00Z',
})

describe('showsQuota', () => {
  it('shows the quota never, only below a quarter, or always', () => {
    expect(showsQuota('never', quota(10))).toBe(false)
    expect(showsQuota('low', quota(1249))).toBe(true)
    expect(showsQuota('low', quota(1250))).toBe(false)
    expect(showsQuota('always', quota(5000))).toBe(true)
    expect(showsQuota('always', undefined)).toBe(false)
  })
})

describe('countRepos', () => {
  it('counts the current GitHub items per repository and keeps repositories seen before at zero', () => {
    const counts = countRepos({ 'acme/old': 3, 'acme/api': 1 }, [signal('acme/api'), signal('acme/api'), signal('acme/web'), signal('site.com', 'forge')])
    expect(counts).toEqual({ 'acme/old': 0, 'acme/api': 2, 'acme/web': 1 })
  })
})
