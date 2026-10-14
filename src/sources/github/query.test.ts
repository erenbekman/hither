import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../core/settings'
import { MAX_QUERY_LENGTH, buildQueries } from './query'

const build = (overrides: Partial<Settings> = {}) => buildQueries({ ...DEFAULT_SETTINGS, ...overrides })

describe('buildQueries', () => {
  it('uses @me by default and needs no login', () => {
    const q = build()
    expect(q.prs).toBe('is:pr is:open user:@me -author:@me sort:created-desc')
    expect(q.issues).toBe('is:issue is:open user:@me -author:@me sort:created-desc')
    expect(q.review).toBe('is:pr is:open review-requested:@me sort:created-desc')
    expect(q.changesRequested).toBe('is:pr is:open author:@me review:changes_requested sort:created-desc')
    expect(q.myPullRequests).toBe('is:pr is:open author:@me sort:created-desc')
    expect(q.filtersDropped).toBe(false)
    expect(q.allowListEmpty).toBe(false)
  })

  it('uses org: instead of user: when an organization is selected', () => {
    const q = build({ accounts: ['alice'], organizations: ['acme'] })
    expect(q.prs).toBe('is:pr is:open org:acme assignee:@me sort:created-desc')
    expect(q.issues).toBe('is:issue is:open org:acme assignee:@me sort:created-desc')
    expect(q.prs).not.toContain('user:')
    expect(q.prs).not.toContain('-author:')
    expect(q.review).toBe('is:pr is:open review-requested:@me org:acme sort:created-desc')
    expect(q.changesRequested).toBe('is:pr is:open author:@me review:changes_requested org:acme sort:created-desc')
    expect(q.myPullRequests).toBe('is:pr is:open author:@me org:acme sort:created-desc')
  })

  it('does not narrow your own pull requests to the account scope', () => {
    const q = build({ accounts: ['alice'] })
    expect(q.myPullRequests).toBe('is:pr is:open author:@me sort:created-desc')
  })

  it('ORs several organizations in one qualifier list', () => {
    const q = build({ organizations: ['acme', 'widgets'] })
    expect(q.prs).toBe('is:pr is:open org:acme org:widgets assignee:@me sort:created-desc')
    expect(q.review).toBe('is:pr is:open review-requested:@me org:acme org:widgets sort:created-desc')
  })

  it('adds -repo: exclusions under an organization scope too', () => {
    const q = build({ organizations: ['acme'], repoList: ['acme/noisy'] })
    expect(q.prs).toBe('is:pr is:open org:acme assignee:@me -repo:acme/noisy sort:created-desc')
    expect(q.review).toBe('is:pr is:open review-requested:@me org:acme -repo:acme/noisy sort:created-desc')
    expect(q.changesRequested).toBe(
      'is:pr is:open author:@me review:changes_requested org:acme -repo:acme/noisy sort:created-desc',
    )
    expect(q.myPullRequests).toBe('is:pr is:open author:@me org:acme -repo:acme/noisy sort:created-desc')
  })

  it('joins a bare repository name with the first organization', () => {
    expect(build({ accounts: ['alice'], organizations: ['acme'], repoList: ['noisy'] }).prs).toContain(
      '-repo:acme/noisy',
    )
  })

  it('lets the allow list replace user and org scope', () => {
    const q = build({ accounts: ['alice'], organizations: ['acme'], repoList: ['acme/one'], repoListIsAllowList: true })
    expect(q.prs).toBe('is:pr is:open repo:acme/one assignee:@me sort:created-desc')
    expect(q.prs).not.toContain('org:')
    expect(q.prs).not.toContain('user:')
    expect(q.review).toBe('is:pr is:open review-requested:@me org:acme sort:created-desc')
    expect(q.changesRequested).toBe('is:pr is:open author:@me review:changes_requested repo:acme/one sort:created-desc')
    expect(q.myPullRequests).toBe('is:pr is:open author:@me repo:acme/one sort:created-desc')
  })

  it('gives one user: part per account', () => {
    expect(build({ accounts: ['alice', 'acme'] }).prs).toBe(
      'is:pr is:open user:alice user:acme -author:@me sort:created-desc',
    )
  })

  it('adds -repo: parts for the deny list', () => {
    const q = build({ accounts: ['alice'], repoList: ['alice/noisy'] })
    expect(q.prs).toBe('is:pr is:open user:alice -author:@me -repo:alice/noisy sort:created-desc')
    expect(q.review).toBe('is:pr is:open review-requested:@me -repo:alice/noisy sort:created-desc')
  })

  it('joins a bare repository name with the first account', () => {
    expect(build({ accounts: ['alice'], repoList: ['noisy'] }).prs).toContain('-repo:alice/noisy')
  })

  it('uses repo: for the allow list and drops user: parts', () => {
    const q = build({ accounts: ['alice'], repoList: ['alice/one', 'alice/two'], repoListIsAllowList: true })
    expect(q.prs).toBe('is:pr is:open repo:alice/one repo:alice/two -author:@me sort:created-desc')
  })

  it('flags an empty allow list', () => {
    expect(build({ repoList: [], repoListIsAllowList: true }).allowListEmpty).toBe(true)
  })

  it('trims exclusions past the length cap and says so', () => {
    const repoList = Array.from({ length: 300 }, (_, i) => `alice/repository-with-a-long-name-${i}`)
    const q = build({ accounts: ['alice'], repoList })
    expect(q.prs.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH)
    expect(q.prs.endsWith(' sort:created-desc')).toBe(true)
    expect(q.filtersDropped).toBe(true)
  })
})
