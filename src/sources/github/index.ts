import type { AppError } from '../../core/errors'
import type { Settings } from '../../core/settings'
import type { PollResult, Signal, Source } from '../../core/types'
import { fetchSnapshot } from './client'
import type { Item, SearchKey } from './parse'
import { buildQueries } from './query'

export const KIND_ORDER = ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr'] as const
export type GitHubKind = (typeof KIND_ORDER)[number]

export const QUIET_KINDS: readonly string[] = ['my-pr']

export const KIND_TITLES: Record<GitHubKind, string> = {
  'changes-requested': 'Changes Requested',
  'review-requested': 'Review Requested',
  pr: 'Pull Requests',
  issue: 'Issues',
  'my-pr': 'My Pull Requests',
}

const SEARCH_KIND: Record<SearchKey, GitHubKind> = {
  changesRequested: 'changes-requested',
  review: 'review-requested',
  prs: 'pr',
  issues: 'issue',
  myPullRequests: 'my-pr',
}

export function toSignal(item: Item, kind: GitHubKind): Signal {
  return {
    id: item.url,
    source: 'github',
    lane: 'incoming',
    kind,
    severity: kind === 'changes-requested' || kind === 'review-requested' ? 'attention' : 'info',
    project: item.repository,
    title: item.title,
    url: item.url,
    actor: item.authorLogin,
    at: item.createdAt,
    meta: { number: item.number, type: item.type, isDraft: item.isDraft, isBot: item.authorIsBot },
  }
}

export function describeSignal(signal: Signal): string {
  const what = signal.meta?.type === 'issue' ? 'issue' : 'pull request'
  return `New ${what} #${signal.meta?.number ?? ''}`.trim()
}

export function githubSource(deps: {
  token: () => Promise<string>
  settings: () => Settings
  fetchFn?: typeof fetch
}): Source {
  return {
    id: 'github',
    interval: 0,
    async poll(ctx): Promise<PollResult> {
      const queries = buildQueries(deps.settings())
      const notices: string[] = []
      if (queries.filtersDropped) notices.push('Too many repository filters — some were dropped')
      if (queries.allowListEmpty) return { signals: [], notices: [...notices, 'No repositories selected'] }

      const token = await deps.token()
      const snapshot = await fetchSnapshot(token, queries, { fetchFn: deps.fetchFn, signal: ctx.signal })

      const signals = (Object.keys(SEARCH_KIND) as SearchKey[]).flatMap((key) =>
        snapshot.searches[key].map((item) => toSignal(item, SEARCH_KIND[key])),
      )
      for (const key of snapshot.truncated) notices.push(`${KIND_TITLES[SEARCH_KIND[key]]}: more than 100 found, showing the newest 100`)
      notices.push(...snapshot.warnings)

      return {
        signals,
        notices,
        account: snapshot.login,
        retryAt: snapshot.rateLimit.remaining === 0 ? snapshot.rateLimit.resetAt : undefined,
      }
    },
  }
}

export async function fetchOrganizations(token: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  let response: Response
  try {
    response = await fetchFn('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { viewer { organizations(first: 100) { nodes { login } } } }' }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw { kind: 'network', message: error instanceof Error ? error.message : String(error) } satisfies AppError
  }
  if (response.status === 401) throw { kind: 'github-unauthorized' } satisfies AppError
  if (!response.ok) throw { kind: 'github-status', status: response.status } satisfies AppError
  const body = (await response.json()) as { data?: { viewer?: { organizations?: { nodes?: { login?: unknown }[] } } } }
  return (body.data?.viewer?.organizations?.nodes ?? [])
    .map((node) => node.login)
    .filter((login): login is string => typeof login === 'string')
}
