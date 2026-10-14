import type { AppError } from '../../core/errors'
import { getJson } from '../../core/http'
import type { Settings } from '../../core/settings'
import type { PollResult, Signal, Source } from '../../core/types'

export const SENTRY_API = 'https://sentry.io/api/0'
export const SENTRY_TOKEN_KEY = 'sentry-token'
export const NEW_WINDOW_MS = 60 * 60_000
export const SPIKE_MIN_EVENTS = 10
export const SPIKE_FACTOR = 5

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

export function hourlyCounts(issue: Json): number[] {
  const stats = isObject(issue.stats) ? issue.stats['24h'] : undefined
  if (!Array.isArray(stats)) return []
  return stats.map((bucket) => (Array.isArray(bucket) && typeof bucket[1] === 'number' ? bucket[1] : 0))
}

export function isSpike(counts: number[]): boolean {
  if (counts.length < 2) return false
  const last = counts[counts.length - 1]
  const earlier = counts.slice(0, -1)
  const average = earlier.reduce((sum, count) => sum + count, 0) / earlier.length
  return last >= SPIKE_MIN_EVENTS && last > SPIKE_FACTOR * average
}

export function issueSignals(body: unknown, now: Date): Signal[] {
  const issues = Array.isArray(body) ? body.filter(isObject) : []
  return issues.flatMap((issue): Signal[] => {
    const id = text(issue.id)
    const firstSeen = text(issue.firstSeen)
    const lastSeen = text(issue.lastSeen)
    if (!id || !firstSeen || !lastSeen) return []
    const project = isObject(issue.project) ? (text(issue.project.slug) ?? text(issue.project.name) ?? '') : ''
    const counts = hourlyCounts(issue)
    const isNew = now.getTime() - Date.parse(firstSeen) < NEW_WINDOW_MS
    if (!isNew && !isSpike(counts)) return []
    return [
      {
        id: `sentry:${id}`,
        source: 'sentry',
        lane: 'outgoing',
        kind: isNew ? 'error-new' : 'error-spike',
        severity: 'attention',
        project,
        title: text(issue.title) ?? 'Error',
        url: text(issue.permalink),
        at: isNew ? firstSeen : lastSeen,
        meta: {
          shortId: text(issue.shortId),
          culprit: text(issue.culprit),
          count: Number(issue.count ?? 0),
          lastHour: counts.at(-1) ?? 0,
        },
      },
    ]
  })
}

export function describeIssue(signal: Signal): string {
  return signal.kind === 'error-spike' ? `Error spike ${signal.meta?.shortId ?? ''}`.trim() : `New error ${signal.meta?.shortId ?? ''}`.trim()
}

export function issuesUrl(org: string, projects: string[]): string {
  const params = new URLSearchParams({
    query: 'is:unresolved lastSeen:-1h',
    statsPeriod: '24h',
    groupStatsPeriod: '24h',
    sort: 'date',
    limit: '100',
  })
  for (const project of projects) params.append('project', project)
  return `${SENTRY_API}/organizations/${encodeURIComponent(org)}/issues/?${params}`
}

export function sentrySource(deps: {
  token: () => Promise<string | null>
  settings: () => Settings
  fetchFn: typeof fetch
  now?: () => Date
}): Source {
  const now = deps.now ?? (() => new Date())
  return {
    id: 'sentry',
    interval: 0,
    async poll(ctx): Promise<PollResult> {
      const { sentryOrg, sentryProjects } = deps.settings()
      if (!sentryOrg) throw { kind: 'service-not-configured', service: 'Sentry', missing: 'enter the organization slug' } satisfies AppError
      const token = await deps.token()
      if (!token) throw { kind: 'service-not-configured', service: 'Sentry', missing: 'add an auth token' } satisfies AppError
      const body = await getJson('Sentry', issuesUrl(sentryOrg, sentryProjects), token, { fetchFn: deps.fetchFn, signal: ctx.signal, now })
      return { signals: issueSignals(body, now()), notices: [] }
    },
  }
}
