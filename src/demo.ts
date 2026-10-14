import { DEFAULT_SETTINGS, type Settings } from './core/settings'
import type { PollResult, Signal, Source } from './core/types'

export const DEMO_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  forgeEnabled: true,
  sentryEnabled: true,
  sentryOrg: 'acme',
  sentryProjectForSite: { 'shop.acme.app': 'shop-api' },
  quotaVisibility: 'always',
}

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

function githubSignals(now: Date): Signal[] {
  const pr = (number: number, kind: string, title: string, actor: string, minutes: number, extra: Partial<Signal> = {}): Signal => ({
    id: `https://github.com/acme/api/pull/${number}`,
    source: 'github',
    lane: 'incoming',
    kind,
    severity: kind === 'review-requested' || kind === 'changes-requested' ? 'attention' : 'info',
    project: 'acme/api',
    title,
    url: `https://github.com/acme/api/pull/${number}`,
    actor,
    at: minutesAgo(now, minutes),
    meta: { number, type: 'pr', isDraft: false, isBot: false, branch: `feature/${number}` },
    ...extra,
  })
  return [
    pr(418, 'review-requested', 'Add rate limit to webhook deliveries', 'carol', 120),
    pr(392, 'review-requested', 'Drop the legacy CSV importer', 'grace', 30 * 60),
    pr(402, 'changes-requested', 'Move invoices to the queue', 'eren', 300),
    pr(411, 'pr', 'Fix timezone in invoice export', 'dave', 26 * 60, { project: 'acme/billing', id: 'https://github.com/acme/billing/pull/411', url: 'https://github.com/acme/billing/pull/411' }),
    pr(395, 'pr', 'Translate onboarding emails', 'erin', 5 * 24 * 60, { project: 'acme/web', id: 'https://github.com/acme/web/pull/395', url: 'https://github.com/acme/web/pull/395' }),
    pr(406, 'issue', 'Export to CSV drops the last row', 'frank', 3 * 60, {
      project: 'acme/billing',
      id: 'https://github.com/acme/billing/issues/406',
      url: 'https://github.com/acme/billing/issues/406',
      meta: { number: 406, type: 'issue', isDraft: false, isBot: false },
    }),
    pr(421, 'conflicting', 'Split the billing worker into two queues', 'eren', 90, { severity: 'attention' }),
    pr(415, 'ready-to-merge', 'Retry failed webhooks with backoff', 'eren', 200),
    {
      ...pr(388, 'activity', 'Store webhook secrets per endpoint', 'eren', 12),
      actor: undefined,
      meta: { number: 388, type: 'pr', reason: 'comment', branch: 'feature/388' },
    },
    pr(409, 'assigned', 'Webhook signatures fail behind the proxy', 'grace', 10 * 60, {
      id: 'https://github.com/acme/api/issues/409',
      url: 'https://github.com/acme/api/issues/409',
      meta: { number: 409, type: 'issue', isDraft: false, isBot: false },
    }),
    pr(420, 'mentioned', 'Pick a queue for invoice exports', 'heidi', 45, { project: 'acme/billing', id: 'https://github.com/acme/billing/pull/420', url: 'https://github.com/acme/billing/pull/420' }),
    pr(399, 'my-pr', 'Cache feature flags per request', 'eren', 7 * 60),
    {
      id: 'ci:https://github.com/acme/api/pull/399',
      source: 'github',
      lane: 'outgoing',
      kind: 'ci-failed',
      severity: 'attention',
      project: 'acme/api',
      title: 'Cache feature flags per request',
      url: 'https://github.com/acme/api/pull/399/checks',
      actor: 'eren',
      at: minutesAgo(now, 14),
      meta: { number: 399 },
    },
    {
      id: 'ci:branch:acme/web',
      source: 'github',
      lane: 'outgoing',
      kind: 'ci-main-failed',
      severity: 'critical',
      project: 'acme/web',
      title: 'Bump vite to 8.3',
      url: 'https://github.com/acme/web/commit/a1f3e9c',
      actor: 'erin',
      at: minutesAgo(now, 6),
      meta: { branch: 'main' },
    },
    {
      id: 'ci:https://github.com/acme/billing/pull/388',
      source: 'github',
      lane: 'outgoing',
      kind: 'ci-fixed',
      severity: 'info',
      project: 'acme/billing',
      title: 'Retry failed card charges once',
      url: 'https://github.com/acme/billing/pull/388/checks',
      actor: 'eren',
      at: minutesAgo(now, 9),
      meta: { number: 388 },
    },
    {
      id: 'agent-pr:https://github.com/acme/api/pull/421',
      source: 'github',
      lane: 'agents',
      kind: 'agent-pr-ready',
      severity: 'attention',
      project: 'acme/api',
      title: 'Add missing indexes to the orders table',
      url: 'https://github.com/acme/api/pull/421',
      actor: 'claude',
      at: minutesAgo(now, 40),
      meta: { number: 421, isDraft: false, ci: 'SUCCESS', branch: 'claude/order-indexes' },
    },
  ]
}

function forge(now: Date): Signal[] {
  const deploy = (id: string, site: string, kind: string, title: string, minutes: number, hash: string): Signal => ({
    id: `forge:deploy:${id}`,
    source: 'forge',
    lane: 'outgoing',
    kind,
    severity: kind === 'deploy-failed' ? 'critical' : 'info',
    project: site,
    title,
    url: `https://${site}`,
    actor: 'Eren',
    at: minutesAgo(now, minutes),
    meta: { status: kind, hash, sha: `${hash}0000000`, branch: 'main', repo: 'acme/api', serverId: '1', siteId: id, deploymentId: id },
  })
  return [
    deploy('31', 'acme.app', 'deploy-failed', 'Release 2.14: new checkout', 4, 'e5d2a71'),
    deploy('32', 'admin.acme.app', 'deploy-running', 'Admin: export filters', 1, '9c41b0e'),
    deploy('33', 'shop.acme.app', 'deploy-ok', 'Shop: faster product pages', 22, '4f8a6d2'),
  ]
}

function sentry(now: Date): Signal[] {
  const issue = (id: string, kind: string, title: string, minutes: number, lastHour: number): Signal => ({
    id: `sentry:${id}`,
    source: 'sentry',
    lane: 'outgoing',
    kind,
    severity: 'attention',
    project: 'shop-api',
    title,
    url: `https://acme.sentry.io/issues/${id}/`,
    at: minutesAgo(now, minutes),
    meta: { shortId: `SHOP-API-${id}`, count: lastHour, lastHour },
  })
  return [
    issue('81', 'error-new', "TypeError: Cannot read properties of undefined (reading 'price')", 12, 37),
    issue('64', 'error-spike', 'QueryException: Deadlock found when trying to get lock', 3, 58),
  ]
}

function agents(now: Date): Signal[] {
  const session = (id: string, state: string, title: string, folder: string, sessionTitle: string, minutes: number): Signal => ({
    id: `session:${id}`,
    source: 'claude-code',
    lane: 'agents',
    kind: `agent-${state}`,
    severity: state === 'waiting' ? 'attention' : 'info',
    project: folder,
    title,
    at: minutesAgo(now, minutes),
    meta: { cwd: `/Users/you/code/${folder}`, sessionTitle, state },
  })
  return [
    session('a', 'waiting', 'Claude needs your permission to use Bash', 'api', 'Fix flaky checkout test', 12),
    session('b', 'running', 'Working', 'web', 'Migrate to Vite 8', 3),
    session('c', 'done', 'Turn finished', 'billing', 'Invoice export timezone', 8),
  ]
}

const source = (id: string, signals: (now: Date) => Signal[], extra: Partial<PollResult> = {}): Source => ({
  id,
  interval: 0,
  poll: async (): Promise<PollResult> => ({ signals: signals(new Date()), notices: [], ...extra }),
})

export function demoSources(): Source[] {
  const github = source('github', githubSignals, {
    account: 'you',
    profile: { followers: 128, stars: 1240, starsAreExact: true },
    quota: { limit: 5000, remaining: 4870, resetAt: new Date(Date.now() + 40 * 60_000).toISOString() },
  })
  return [github, source('forge', forge), source('sentry', sentry), source('claude-code', agents)]
}
