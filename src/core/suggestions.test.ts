import { describe, expect, it } from 'vitest'
import { suggest, type RuleInput } from './suggestions'
import type { Signal } from './types'

const now = new Date('2026-10-14T12:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

const base = (overrides: Partial<Signal>): Signal => ({
  id: 'x',
  source: 'github',
  lane: 'incoming',
  kind: 'pr',
  severity: 'info',
  project: 'acme/api',
  title: 'Title',
  at: minutesAgo(5),
  ...overrides,
})

const input = (signals: Signal[], extra: Partial<RuleInput> = {}): RuleInput => ({
  signals,
  now,
  sentryOrg: 'acme',
  sentryProjectForSite: { 'ustad.app': 'ustad-api' },
  ...extra,
})

const deploy = base({
  id: 'forge:deploy:9',
  source: 'forge',
  lane: 'outgoing',
  kind: 'deploy-ok',
  project: 'ustad.app',
  url: 'https://ustad.app',
  at: minutesAgo(25),
  meta: { hash: 'abc1234', sha: 'abc1234def', repo: 'eren/ustad', serverId: '1', siteId: '2', deploymentId: '9' },
})
const error = (id: string, minutes: number, project = 'ustad-api') =>
  base({ id: `sentry:${id}`, source: 'sentry', lane: 'outgoing', kind: 'error-new', project, at: minutesAgo(minutes), url: `https://acme.sentry.io/issues/${id}/`, meta: { shortId: `API-${id}` } })

describe('suggest', () => {
  it('links new errors to the deploy that came right before them', () => {
    const [card] = suggest(input([deploy, error('1', 20), error('2', 10), error('3', 30), error('4', 10, 'other')]))
    expect(card).toMatchObject({ id: 'deploy-errors:forge:deploy:9', severity: 'critical', title: 'Errors started after the ustad.app deploy' })
    expect(card.actions[0]).toEqual({
      kind: 'claude',
      template: 'deploy-errors',
      repo: 'eren/ustad',
      vars: { site: 'ustad.app', sha: 'abc1234def', issues: 'API-1,API-2', org: 'acme' },
    })
  })

  it('does not correlate a site without a linked Sentry project', () => {
    expect(suggest(input([deploy, error('1', 20)], { sentryProjectForSite: {} }))).toEqual([])
  })

  it('asks Claude about a failed deploy with the ids to fetch its log', () => {
    const failed = { ...deploy, kind: 'deploy-failed', severity: 'critical' as const }
    const [card] = suggest(input([failed]))
    expect(card.actions[0]).toEqual({
      kind: 'claude',
      template: 'deploy-failed',
      repo: 'eren/ustad',
      vars: { site: 'ustad.app', sha: 'abc1234def' },
      log: { serverId: '1', siteId: '2', deploymentId: '9' },
    })
  })

  it('offers only to open the site when the deploy has no known repository', () => {
    const failed = { ...deploy, kind: 'deploy-failed', meta: { ...deploy.meta, repo: undefined } }
    expect(suggest(input([failed]))[0].actions.map((a) => a.kind)).toEqual(['open'])
  })

  it('turns failing checks, review comments and ready agent PRs into cards with ids only', () => {
    const cards = suggest(
      input([
        base({ id: 'ci:a', lane: 'outgoing', kind: 'ci-failed', meta: { number: 42 }, url: 'https://github.com/acme/api/pull/42/checks' }),
        base({ id: 'b', kind: 'changes-requested', meta: { number: 43 } }),
        base({ id: 'c', lane: 'agents', kind: 'agent-pr-ready', meta: { number: 44 } }),
      ]),
    )
    expect(cards.map((c) => [c.rule, c.actions[0].kind])).toEqual([
      ['ci-failed', 'claude'],
      ['changes-requested', 'claude'],
      ['agent-pr-ready', 'summarize'],
    ])
    expect(cards[0].actions[0]).toMatchObject({ vars: { repo: 'acme/api', number: '42' } })
  })

  it('reminds about a Claude session only after ten minutes of waiting, once per wait', () => {
    const waiting = (minutes: number) => base({ id: 'session:s', source: 'claude-code', lane: 'agents', kind: 'agent-waiting', project: 'hither', at: minutesAgo(minutes) })
    expect(suggest(input([waiting(9)]))).toEqual([])
    const [card] = suggest(input([waiting(12)]))
    expect(card).toMatchObject({ rule: 'agent-waiting', remind: true, title: 'Claude has waited 12 minutes in hither', actions: [{ kind: 'focus-terminal' }] })
    expect(card.id).toBe(`agent-waiting:session:s:${minutesAgo(12)}`)
  })

  it('lists incoming pull requests waiting three days or more, at most five', () => {
    const prs = Array.from({ length: 7 }, (_, i) => base({ id: `pr${i}`, kind: 'pr', meta: { number: i }, at: minutesAgo((3 * 24 + i) * 60) }))
    const cards = suggest(input([...prs, base({ id: 'fresh', kind: 'pr', at: minutesAgo(60) })]))
    expect(cards).toHaveLength(5)
    expect(cards[0]).toMatchObject({ rule: 'stale-pr', title: '#0 has waited 3 days' })
  })

  it('includes review requests that have waited three days, before other pull requests', () => {
    const cards = suggest(
      input([
        base({ id: 'pr', kind: 'pr', meta: { number: 1 }, at: minutesAgo(4 * 24 * 60) }),
        base({ id: 'review', kind: 'review-requested', meta: { number: 351 }, at: minutesAgo(176 * 24 * 60) }),
        base({ id: 'fresh-review', kind: 'review-requested', meta: { number: 2 }, at: minutesAgo(60) }),
      ]),
    )
    expect(cards.map((c) => c.title)).toEqual(['Your review on #351 has waited 176 days', '#1 has waited 4 days'])
  })

  it('orders cards by how urgent the rule is', () => {
    const cards = suggest(
      input([
        base({ id: 'old', kind: 'pr', meta: { number: 1 }, at: minutesAgo(5 * 24 * 60) }),
        base({ id: 'main', lane: 'outgoing', kind: 'ci-main-failed', meta: { branch: 'main' } }),
        base({ id: 'ci:a', lane: 'outgoing', kind: 'ci-failed', meta: { number: 2 } }),
      ]),
    )
    expect(cards.map((c) => c.rule)).toEqual(['main-failed', 'ci-failed', 'stale-pr'])
  })
})
