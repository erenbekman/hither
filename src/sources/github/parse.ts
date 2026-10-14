import type { AppError } from '../../core/errors'

export const SEARCH_KEYS = ['prs', 'issues', 'review', 'changesRequested', 'myPullRequests'] as const
export type SearchKey = (typeof SEARCH_KEYS)[number]

export const SEARCH_LIMIT = 100

export interface Item {
  type: 'pr' | 'issue'
  repository: string
  number: number
  title: string
  url: string
  createdAt: string
  isDraft: boolean
  authorLogin: string
  authorIsBot: boolean
}

export interface Snapshot {
  login: string
  organizations: string[]
  searches: Record<SearchKey, Item[]>
  truncated: SearchKey[]
  rateLimit: { limit: number; remaining: number; resetAt: string }
  warnings: string[]
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (message: string): never => {
  throw { kind: 'github-parse', message } satisfies AppError
}

export function parseResponse(root: unknown, rateLimitResetAt: string): Snapshot {
  if (!isObject(root)) fail('root is not an object')
  const body = root as Json

  const errors = Array.isArray(body.errors) ? body.errors.filter(isObject) : []
  if (errors.some((error) => error.type === 'RATE_LIMITED')) {
    throw { kind: 'github-rate-limited', resetAt: rateLimitResetAt } satisfies AppError
  }
  const warnings = errors.map((error) => error.message).filter((message): message is string => typeof message === 'string')

  if (!isObject(body.data)) {
    if (warnings.length > 0) throw { kind: 'github-graphql', message: warnings[0] } satisfies AppError
    fail('missing data')
  }
  const data = body.data as Json

  const viewer = isObject(data.viewer) ? data.viewer : fail('missing viewer')
  const login = typeof viewer.login === 'string' ? viewer.login : fail('missing viewer login')
  const orgNodes = isObject(viewer.organizations) && Array.isArray(viewer.organizations.nodes) ? viewer.organizations.nodes : []
  const organizations = orgNodes
    .map((node) => (isObject(node) ? node.login : undefined))
    .filter((org): org is string => typeof org === 'string')

  const truncated: SearchKey[] = []
  const search = (key: SearchKey): Item[] => {
    const result = data[key]
    if (!isObject(result)) {
      if (warnings.length > 0) return []
      return fail(`missing ${key}`)
    }
    if (typeof result.issueCount === 'number' && result.issueCount > SEARCH_LIMIT) truncated.push(key)
    const nodes = Array.isArray(result.nodes) ? result.nodes : []
    const type = key === 'issues' ? 'issue' : 'pr'
    return nodes.filter(isObject).flatMap((node) => {
      const item = toItem(node, type)
      return item ? [item] : []
    })
  }
  const searches = Object.fromEntries(SEARCH_KEYS.map((key) => [key, search(key)])) as Record<SearchKey, Item[]>

  const limit = isObject(data.rateLimit) ? data.rateLimit : fail('missing rateLimit')
  if (typeof limit.limit !== 'number' || typeof limit.remaining !== 'number' || typeof limit.resetAt !== 'string') {
    fail('malformed rateLimit')
  }

  return {
    login,
    organizations,
    searches,
    truncated,
    rateLimit: { limit: limit.limit as number, remaining: limit.remaining as number, resetAt: limit.resetAt as string },
    warnings,
  }
}

function toItem(node: Json, type: Item['type']): Item | undefined {
  const { number, title, url, createdAt, repository, author } = node
  if (
    typeof number !== 'number' ||
    typeof title !== 'string' ||
    typeof url !== 'string' ||
    typeof createdAt !== 'string' ||
    Number.isNaN(Date.parse(createdAt)) ||
    !isObject(repository) ||
    typeof repository.nameWithOwner !== 'string' ||
    !isObject(author) ||
    typeof author.login !== 'string'
  ) {
    return undefined
  }
  return {
    type,
    repository: repository.nameWithOwner,
    number,
    title,
    url,
    createdAt,
    isDraft: node.isDraft === true,
    authorLogin: author.login,
    authorIsBot: author.__typename === 'Bot' || author.login.endsWith('[bot]'),
  }
}
