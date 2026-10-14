import type { AppError } from '../../core/errors'
import { resetDate } from '../../core/http'
import { parseResponse, SEARCH_LIMIT, type Snapshot } from './parse'
import type { Queries } from './query'

export const ENDPOINT = 'https://api.github.com/graphql'
export const TIMEOUT_MS = 15_000

const itemFields = 'number title url createdAt author { login __typename avatarUrl(size: 48) } repository { nameWithOwner }'
const rollup = 'statusCheckRollup { state }'
const lastCommit = `commits(last: 1) { nodes { commit { ${rollup} } } }`
const prFields = `${itemFields} isDraft headRefName`
const prSearch = (alias: string, extra = '') =>
  `${alias}: search(query: $${alias}, type: ISSUE, first: $first) { issueCount nodes { ... on PullRequest { ${prFields} ${extra} } } }`
const mixedSearch = (alias: string) =>
  `${alias}: search(query: $${alias}, type: ISSUE, first: $first) { issueCount nodes { __typename ... on PullRequest { ${prFields} } ... on Issue { ${itemFields} } } }`

export function document(watched: number): string {
  const repoVars = Array.from({ length: watched }, (_, i) => `, $w${i}o: String!, $w${i}n: String!`).join('')
  const repos = Array.from(
    { length: watched },
    (_, i) =>
      `w${i}: repository(owner: $w${i}o, name: $w${i}n) { nameWithOwner defaultBranchRef { name target { ... on Commit { oid url messageHeadline committedDate author { user { login } name } ${rollup} } } } }`,
  ).join('\n  ')
  return `query($prs: String!, $issues: String!, $review: String!, $changesRequested: String!, $myPullRequests: String!, $mentions: String!, $assigned: String!, $first: Int!${repoVars}) {
  viewer { login name avatarUrl(size: 64) organizations(first: 50) { nodes { login } } followers { totalCount } repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) { totalCount nodes { stargazerCount } } }
  ${prSearch('prs', lastCommit)}
  issues: search(query: $issues, type: ISSUE, first: $first) { issueCount nodes { ... on Issue { ${itemFields} } } }
  ${prSearch('review')}
  ${prSearch('changesRequested')}
  ${prSearch('myPullRequests', `${lastCommit} reviewDecision mergeable`)}
  ${mixedSearch('mentions')}
  ${mixedSearch('assigned')}
  ${repos}
  rateLimit { limit remaining resetAt cost }
}`
}

export function buildRequest(token: string, queries: Queries, watched: string[] = [], signal?: AbortSignal): RequestInit {
  const repoVariables = Object.fromEntries(
    watched.flatMap((repo, i) => {
      const [owner, name] = repo.split('/')
      return [
        [`w${i}o`, owner],
        [`w${i}n`, name],
      ]
    }),
  )
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: document(watched.length),
      variables: {
        prs: queries.prs,
        issues: queries.issues,
        review: queries.review,
        changesRequested: queries.changesRequested,
        myPullRequests: queries.myPullRequests,
        mentions: queries.mentions,
        assigned: queries.assigned,
        first: SEARCH_LIMIT,
        ...repoVariables,
      },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  }
}

export function validate(status: number, headers: Headers, now: Date): void {
  if (status === 200) return
  if (status === 401) throw { kind: 'github-unauthorized' } satisfies AppError
  if (status === 403 || status === 429) {
    if (status === 429 || headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')) {
      throw { kind: 'github-rate-limited', resetAt: resetDate(headers, now) } satisfies AppError
    }
    throw { kind: 'github-forbidden' } satisfies AppError
  }
  throw { kind: 'github-status', status } satisfies AppError
}

export async function fetchSnapshot(
  token: string,
  queries: Queries,
  {
    fetchFn = fetch,
    signal,
    watched = [],
    now = () => new Date(),
  }: { fetchFn?: typeof fetch; signal?: AbortSignal; watched?: string[]; now?: () => Date } = {},
): Promise<Snapshot> {
  let response: Response
  try {
    response = await fetchFn(ENDPOINT, buildRequest(token, queries, watched, signal))
  } catch (error) {
    throw { kind: 'network', message: error instanceof Error ? error.message : String(error) } satisfies AppError
  }
  validate(response.status, response.headers, now())

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw { kind: 'github-parse', message: 'body is not JSON' } satisfies AppError
  }
  return parseResponse(body, resetDate(response.headers, now()), watched)
}
