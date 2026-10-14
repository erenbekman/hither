import { resolveRepo, type Settings } from '../../core/settings'

export const MAX_QUERY_LENGTH = 4000
const NEWEST_FIRST = 'sort:created-desc'

type ScopeSettings = Pick<Settings, 'accounts' | 'organizations' | 'repoList' | 'repoListIsAllowList'>

export interface Queries {
  prs: string
  issues: string
  review: string
  changesRequested: string
  myPullRequests: string
  filtersDropped: boolean
  allowListEmpty: boolean
}

export function buildQueries(settings: ScopeSettings): Queries {
  const repos = normalizedRepositories(settings)
  const allowList = settings.repoListIsAllowList
  const orgScope = settings.organizations.map((org) => `org:${org}`)

  const scope = allowList
    ? repos.map((repo) => `repo:${repo}`)
    : orgScope.length > 0
      ? orgScope
      : settings.accounts.map((account) => `user:${account}`)
  const exclusions = allowList ? [] : repos.map((repo) => `-repo:${repo}`)
  const selfFilter = settings.organizations.length === 0 ? ['-author:@me'] : ['assignee:@me']
  const authoredScope = allowList ? repos.map((repo) => `repo:${repo}`) : orgScope

  let filtersDropped = false
  const assemble = (required: string[]) => {
    const { query, dropped } = fit(required, exclusions)
    filtersDropped ||= dropped
    return query
  }

  return {
    prs: assemble(['is:pr', 'is:open', ...scope, ...selfFilter]),
    issues: assemble(['is:issue', 'is:open', ...scope, ...selfFilter]),
    review: assemble(['is:pr', 'is:open', 'review-requested:@me', ...orgScope]),
    changesRequested: assemble(['is:pr', 'is:open', 'author:@me', 'review:changes_requested', ...authoredScope]),
    myPullRequests: assemble(['is:pr', 'is:open', 'author:@me', ...authoredScope]),
    filtersDropped,
    allowListEmpty: allowList && repos.length === 0,
  }
}

function fit(required: string[], exclusions: string[]): { query: string; dropped: boolean } {
  const budget = MAX_QUERY_LENGTH - NEWEST_FIRST.length - 1
  const parts = [...required]
  let length = parts.join(' ').length
  let dropped = false
  for (const exclusion of exclusions) {
    if (length + exclusion.length + 1 > budget) {
      dropped = true
      break
    }
    parts.push(exclusion)
    length += exclusion.length + 1
  }
  return { query: [...parts, NEWEST_FIRST].join(' '), dropped }
}

function normalizedRepositories(settings: ScopeSettings): string[] {
  return settings.repoList.filter((entry) => entry.trim().length > 0).map((entry) => resolveRepo(settings, entry))
}
