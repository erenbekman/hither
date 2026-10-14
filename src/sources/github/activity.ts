import type { AppError } from '../../core/errors'
import type { PollResult, Signal, Source } from '../../core/types'
import { TIMEOUT_MS, validate } from './client'

export const ACTIVITY_SOURCE_ID = 'github-activity'
export const ACTIVITY_ENDPOINT = 'https://api.github.com/notifications'

const WINDOW_MS = 14 * 86_400_000
const REASONS = ['author', 'comment', 'mention', 'team_mention', 'state_change']
const TYPES: Record<string, 'pr' | 'issue'> = { PullRequest: 'pr', Issue: 'issue' }

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export function htmlUrl(apiUrl: string): string | undefined {
  const match = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)\/(pulls|issues)\/(\d+)$/.exec(apiUrl)
  return match ? `https://github.com/${match[1]}/${match[2] === 'pulls' ? 'pull' : 'issues'}/${match[3]}` : undefined
}

function toSignal(thread: unknown): Signal | undefined {
  if (!isObject(thread) || !isObject(thread.subject) || !isObject(thread.repository)) return undefined
  const { reason, updated_at: at } = thread
  const { title, url, type } = thread.subject
  const project = thread.repository.full_name
  if (typeof reason !== 'string' || !REASONS.includes(reason)) return undefined
  if (typeof type !== 'string' || !Object.hasOwn(TYPES, type) || typeof url !== 'string') return undefined
  if (typeof title !== 'string' || typeof at !== 'string' || typeof project !== 'string') return undefined
  const page = htmlUrl(url)
  if (!page) return undefined
  return {
    id: page,
    source: 'github',
    lane: 'incoming',
    kind: 'activity',
    severity: 'info',
    project,
    title,
    url: page,
    at,
    meta: { number: Number(page.split('/').pop()), type: TYPES[type], reason },
  }
}

export function activitySource(deps: { token: () => Promise<string>; fetchFn?: typeof fetch; now?: () => Date }): Source {
  const fetchFn = deps.fetchFn ?? fetch
  const now = deps.now ?? (() => new Date())
  let lastModified: string | undefined
  let previous: Signal[] = []

  return {
    id: ACTIVITY_SOURCE_ID,
    interval: 0,
    async poll(ctx): Promise<PollResult> {
      const token = await deps.token()
      const since = new Date(now().getTime() - WINDOW_MS).toISOString()
      const url = `${ACTIVITY_ENDPOINT}?participating=true&per_page=50&since=${encodeURIComponent(since)}`
      let response: Response
      try {
        response = await fetchFn(url, {
          headers: { Authorization: `Bearer ${token}`, ...(lastModified ? { 'If-Modified-Since': lastModified } : {}) },
          cache: 'no-store',
          signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(TIMEOUT_MS)]),
        })
      } catch (error) {
        throw { kind: 'network', message: error instanceof Error ? error.message : String(error) } satisfies AppError
      }
      if (response.status === 304) return { signals: previous, notices: [] }
      validate(response.status, response.headers, now())

      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw { kind: 'github-parse', message: 'notifications are not JSON' } satisfies AppError
      }
      if (!Array.isArray(body)) throw { kind: 'github-parse', message: 'notifications are not a list' } satisfies AppError
      previous = body.flatMap((thread) => toSignal(thread) ?? [])
      lastModified = response.headers.get('last-modified') ?? undefined
      return { signals: previous, notices: [] }
    },
  }
}
