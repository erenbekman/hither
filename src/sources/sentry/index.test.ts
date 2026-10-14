import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { isSpike, issueSignals, issuesUrl, sentrySource } from './index'

const now = new Date('2026-10-14T12:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
const hours = (counts: number[]) => ({ '24h': counts.map((count, i) => [1_700_000_000 + i * 3600, count]) })

const issue = (id: string, firstSeenMinutesAgo: number, counts: number[]) => ({
  id,
  shortId: `API-${id}`,
  title: `TypeError ${id}`,
  culprit: 'app/Http/Controller.php',
  permalink: `https://acme.sentry.io/issues/${id}/`,
  firstSeen: minutesAgo(firstSeenMinutesAgo),
  lastSeen: minutesAgo(1),
  count: String(counts.reduce((a, b) => a + b, 0)),
  project: { id: '1', slug: 'api', name: 'API' },
  stats: hours(counts),
})

describe('isSpike', () => {
  it('needs both a minimum and a jump over the hourly average', () => {
    expect(isSpike([1, 1, 1, 12])).toBe(true)
    expect(isSpike([1, 1, 1, 9])).toBe(false)
    expect(isSpike([10, 10, 10, 40])).toBe(false)
    expect(isSpike([12])).toBe(false)
  })
})

describe('issueSignals', () => {
  it('marks issues first seen in the last hour as new', () => {
    const [signal] = issueSignals([issue('1', 20, [0, 0, 3])], now)
    expect(signal).toMatchObject({
      id: 'sentry:1',
      kind: 'error-new',
      severity: 'attention',
      project: 'api',
      url: 'https://acme.sentry.io/issues/1/',
      at: minutesAgo(20),
      meta: { shortId: 'API-1', count: 3, lastHour: 3 },
    })
  })

  it('reports an older issue only when it spikes', () => {
    const signals = issueSignals([issue('2', 600, [1, 2, 1, 30]), issue('3', 600, [5, 5, 5, 6])], now)
    expect(signals.map((s) => [s.id, s.kind])).toEqual([['sentry:2', 'error-spike']])
  })

  it('skips malformed issues', () => {
    expect(issueSignals([{ id: '4' }, null, 'x'], now)).toEqual([])
    expect(issueSignals({ detail: 'nope' }, now)).toEqual([])
  })
})

describe('sentrySource', () => {
  const ctx = { signal: new AbortController().signal }

  it('asks for unresolved issues seen in the last hour, filtered by project', async () => {
    expect(issuesUrl('acme', ['api', 'web'])).toBe(
      'https://sentry.io/api/0/organizations/acme/issues/?query=is%3Aunresolved+lastSeen%3A-1h&statsPeriod=24h&groupStatsPeriod=24h&sort=date&limit=100&project=api&project=web',
    )
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([issue('1', 5, [1])]), { status: 200 }))
    const settings = { ...DEFAULT_SETTINGS, sentryEnabled: true, sentryOrg: 'acme' }
    const result = await sentrySource({ token: async () => 't', settings: () => settings, fetchFn, now: () => now }).poll(ctx)
    expect(result.signals).toHaveLength(1)
  })

  it('says what is missing instead of showing an empty lane', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    await expect(sentrySource({ token: async () => 't', settings: () => DEFAULT_SETTINGS, fetchFn }).poll(ctx)).rejects.toMatchObject({
      kind: 'service-not-configured',
      missing: 'enter the organization slug',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
