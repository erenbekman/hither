import type { AppError } from '../../core/errors'
import type { Settings } from '../../core/settings'
import type { PollResult, Signal, Source } from '../../core/types'
import { fetchSnapshot } from './client'
import type { Branch, Item, SearchKey } from './parse'
import { buildQueries } from './query'

export const KIND_ORDER = ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr'] as const
export type GitHubKind = (typeof KIND_ORDER)[number]

export const QUIET_KINDS: readonly string[] = ['my-pr']

export const CI_KINDS = ['ci-main-failed', 'ci-failed', 'ci-fixed'] as const

export const CI_RECOVERY = {
  passing: 'ci-passed',
  failing: ['ci-main-failed', 'ci-failed'],
  recovered: 'ci-fixed',
  visibleMs: 30 * 60_000,
} as const

const FAILED = new Set(['FAILURE', 'ERROR'])

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

function ciState(state: string | undefined): 'failed' | 'passed' | undefined {
  if (state === undefined) return undefined
  if (FAILED.has(state)) return 'failed'
  return state === 'SUCCESS' ? 'passed' : undefined
}

export function pullRequestCi(item: Item): Signal | undefined {
  const state = ciState(item.ci)
  if (!state) return undefined
  return {
    id: `ci:${item.url}`,
    source: 'github',
    lane: 'outgoing',
    kind: state === 'failed' ? 'ci-failed' : 'ci-passed',
    severity: state === 'failed' ? 'attention' : 'info',
    project: item.repository,
    title: item.title,
    url: `${item.url}/checks`,
    actor: item.authorLogin,
    at: item.createdAt,
    meta: { number: item.number },
  }
}

export function branchCi(branch: Branch): Signal | undefined {
  const state = ciState(branch.ci)
  if (!state) return undefined
  return {
    id: `ci:branch:${branch.repository}`,
    source: 'github',
    lane: 'outgoing',
    kind: state === 'failed' ? 'ci-main-failed' : 'ci-passed',
    severity: state === 'failed' ? 'critical' : 'info',
    project: branch.repository,
    title: branch.message,
    url: branch.url,
    actor: branch.author,
    at: branch.committedDate,
    meta: { branch: branch.branch },
  }
}

export function isAgentPullRequest(item: Item, settings: Pick<Settings, 'agentLogins' | 'agentBranchPrefixes'>): boolean {
  const login = item.authorLogin.toLowerCase().replace(/\[bot\]$/, '')
  if (settings.agentLogins.some((agent) => agent.toLowerCase().replace(/\[bot\]$/, '') === login)) return true
  return item.headRef !== undefined && settings.agentBranchPrefixes.some((prefix) => item.headRef!.startsWith(prefix))
}

export function agentPullRequest(item: Item): Signal {
  const ready = item.ci === 'SUCCESS' && !item.isDraft
  return {
    id: `agent-pr:${item.url}`,
    source: 'github',
    lane: 'agents',
    kind: ready ? 'agent-pr-ready' : 'agent-pr',
    severity: ready ? 'attention' : 'info',
    project: item.repository,
    title: item.title,
    url: item.url,
    actor: item.authorLogin,
    at: item.createdAt,
    meta: { number: item.number, isDraft: item.isDraft, ci: item.ci, branch: item.headRef },
  }
}

export function describeSignal(signal: Signal): string {
  switch (signal.kind) {
    case 'agent-pr-ready':
      return `Agent PR ready #${signal.meta?.number}`
    case 'ci-main-failed':
      return `${signal.meta?.branch ?? 'main'} is red`
    case 'ci-failed':
      return `Checks failed on #${signal.meta?.number}`
    default: {
      const what = signal.meta?.type === 'issue' ? 'issue' : 'pull request'
      return `New ${what} #${signal.meta?.number ?? ''}`.trim()
    }
  }
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
      const settings = deps.settings()
      const watched = settings.watchedRepos
      const snapshot = await fetchSnapshot(token, queries, { fetchFn: deps.fetchFn, signal: ctx.signal, watched })

      const agentPrs = new Map<string, Signal>()
      const signals = (Object.keys(SEARCH_KIND) as SearchKey[]).flatMap((key) =>
        snapshot.searches[key].flatMap((item) => {
          if (item.type === 'pr' && isAgentPullRequest(item, settings)) {
            const known = agentPrs.get(item.url)
            if (!known || (known.meta?.ci === undefined && item.ci !== undefined)) agentPrs.set(item.url, agentPullRequest(item))
            return []
          }
          return [toSignal(item, SEARCH_KIND[key])]
        }),
      )
      signals.push(...agentPrs.values())
      for (const item of snapshot.searches.myPullRequests) {
        const ci = pullRequestCi(item)
        if (ci) signals.push(ci)
      }
      for (const branch of snapshot.branches) {
        const ci = branchCi(branch)
        if (ci) signals.push(ci)
      }
      for (const repo of snapshot.missingRepos) notices.push(`Watched repository ${repo} was not found`)
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
