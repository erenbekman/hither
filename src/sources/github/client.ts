import type { AppError } from '../../core/errors'
import { parseResponse, SEARCH_LIMIT, type Snapshot } from './parse'
import type { Queries } from './query'

export const ENDPOINT = 'https://api.github.com/graphql'
export const TIMEOUT_MS = 15_000

const itemFields = 'number title url createdAt author { login __typename } repository { nameWithOwner }'
const prSearch = (alias: string) =>
  `${alias}: search(query: $${alias}, type: ISSUE, first: $first) { issueCount nodes { ... on PullRequest { ${itemFields} isDraft } } }`

export const DOCUMENT = `query($prs: String!, $issues: String!, $review: String!, $changesRequested: String!, $myPullRequests: String!, $first: Int!) {
  viewer { login organizations(first: 50) { nodes { login } } }
  ${prSearch('prs')}
  issues: search(query: $issues, type: ISSUE, first: $first) { issueCount nodes { ... on Issue { ${itemFields} } } }
  ${prSearch('review')}
  ${prSearch('changesRequested')}
  ${prSearch('myPullRequests')}
  rateLimit { limit remaining resetAt cost }
}`

export function buildRequest(token: string, queries: Queries, signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: DOCUMENT,
      variables: {
        prs: queries.prs,
        issues: queries.issues,
        review: queries.review,
        changesRequested: queries.changesRequested,
        myPullRequests: queries.myPullRequests,
        first: SEARCH_LIMIT,
      },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  }
}

export function resetDate(headers: Headers, now: Date): string {
  const retryAfter = Number(headers.get('retry-after') ?? NaN)
  if (Number.isFinite(retryAfter)) return new Date(now.getTime() + retryAfter * 1000).toISOString()
  const reset = Number(headers.get('x-ratelimit-reset') ?? NaN)
  if (Number.isFinite(reset)) return new Date(reset * 1000).toISOString()
  return new Date(now.getTime() + 3_600_000).toISOString()
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
  { fetchFn = fetch, signal, now = () => new Date() }: { fetchFn?: typeof fetch; signal?: AbortSignal; now?: () => Date } = {},
): Promise<Snapshot> {
  let response: Response
  try {
    response = await fetchFn(ENDPOINT, buildRequest(token, queries, signal))
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
  return parseResponse(body, resetDate(response.headers, now()))
}
