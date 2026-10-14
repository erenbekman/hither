import type { AppError } from '../../core/errors'
import type { Profile } from '../../core/types'

export const SEARCH_KEYS = ['prs', 'issues', 'review', 'changesRequested', 'myPullRequests', 'mentions', 'assigned'] as const
export const MIXED_SEARCHES: readonly SearchKey[] = ['mentions', 'assigned']
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
  authorAvatar?: string
  headRef?: string
  ci?: string
  reviewDecision?: string
  mergeable?: string
}

export interface Branch {
  repository: string
  branch: string
  url: string
  message: string
  author?: string
  committedDate: string
  ci?: string
}

export interface Snapshot {
  login: string
  profile: Profile
  organizations: string[]
  searches: Record<SearchKey, Item[]>
  truncated: SearchKey[]
  branches: Branch[]
  missingRepos: string[]
  rateLimit: { limit: number; remaining: number; resetAt: string; cost?: number }
  warnings: string[]
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (message: string): never => {
  throw { kind: 'github-parse', message } satisfies AppError
}

export function parseResponse(root: unknown, rateLimitResetAt: string, watched: string[] = []): Snapshot {
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

  const count = (value: unknown) => (isObject(value) && typeof value.totalCount === 'number' ? value.totalCount : 0)
  const repositories = isObject(viewer.repositories) ? viewer.repositories : {}
  const starNodes = Array.isArray(repositories.nodes) ? repositories.nodes : []
  const profile: Profile = {
    ...(typeof viewer.name === 'string' && viewer.name ? { name: viewer.name } : {}),
    ...(typeof viewer.avatarUrl === 'string' ? { avatar: viewer.avatarUrl } : {}),
    followers: count(viewer.followers),
    stars: starNodes.reduce<number>((sum, node) => sum + (isObject(node) && typeof node.stargazerCount === 'number' ? node.stargazerCount : 0), 0),
    starsAreExact: count(repositories) <= starNodes.length,
    organizations,
  }

  const truncated: SearchKey[] = []
  const search = (key: SearchKey): Item[] => {
    const result = data[key]
    if (!isObject(result)) {
      if (warnings.length > 0) return []
      return fail(`missing ${key}`)
    }
    if (typeof result.issueCount === 'number' && result.issueCount > SEARCH_LIMIT) truncated.push(key)
    const nodes = Array.isArray(result.nodes) ? result.nodes : []
    return nodes.filter(isObject).flatMap((node) => {
      const type = key === 'issues' || (MIXED_SEARCHES.includes(key) && node.__typename === 'Issue') ? 'issue' : 'pr'
      const item = toItem(node, type)
      return item ? [item] : []
    })
  }
  const searches = Object.fromEntries(SEARCH_KEYS.map((key) => [key, search(key)])) as Record<SearchKey, Item[]>

  const branches: Branch[] = []
  const missingRepos: string[] = []
  watched.forEach((repo, i) => {
    const branch = toBranch(data[`w${i}`])
    if (branch) branches.push(branch)
    else missingRepos.push(repo)
  })

  const limit = isObject(data.rateLimit) ? data.rateLimit : fail('missing rateLimit')
  if (typeof limit.limit !== 'number' || typeof limit.remaining !== 'number' || typeof limit.resetAt !== 'string') {
    fail('malformed rateLimit')
  }

  return {
    login,
    profile,
    organizations,
    searches,
    truncated,
    branches,
    missingRepos,
    rateLimit: {
      limit: limit.limit as number,
      remaining: limit.remaining as number,
      resetAt: limit.resetAt as string,
      cost: typeof limit.cost === 'number' ? limit.cost : undefined,
    },
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
    authorAvatar: typeof author.avatarUrl === 'string' ? author.avatarUrl : undefined,
    headRef: typeof node.headRefName === 'string' ? node.headRefName : undefined,
    ci: rollupState(lastNode(node.commits)?.commit),
    reviewDecision: typeof node.reviewDecision === 'string' ? node.reviewDecision : undefined,
    mergeable: typeof node.mergeable === 'string' ? node.mergeable : undefined,
  }
}

function lastNode(connection: unknown): Json | undefined {
  if (!isObject(connection) || !Array.isArray(connection.nodes)) return undefined
  const node = connection.nodes.at(-1)
  return isObject(node) ? node : undefined
}

function rollupState(commit: unknown): string | undefined {
  if (!isObject(commit) || !isObject(commit.statusCheckRollup)) return undefined
  const state = commit.statusCheckRollup.state
  return typeof state === 'string' ? state : undefined
}

function toBranch(repository: unknown): Branch | undefined {
  if (!isObject(repository) || typeof repository.nameWithOwner !== 'string') return undefined
  const ref = repository.defaultBranchRef
  if (!isObject(ref) || typeof ref.name !== 'string' || !isObject(ref.target)) return undefined
  const commit = ref.target
  if (typeof commit.url !== 'string' || typeof commit.committedDate !== 'string') return undefined
  const author = isObject(commit.author) ? commit.author : {}
  const login = isObject(author.user) && typeof author.user.login === 'string' ? author.user.login : undefined
  return {
    repository: repository.nameWithOwner,
    branch: ref.name,
    url: commit.url,
    message: typeof commit.messageHeadline === 'string' ? commit.messageHeadline : '',
    author: login ?? (typeof author.name === 'string' ? author.name : undefined),
    committedDate: commit.committedDate,
    ci: rollupState(commit),
  }
}
