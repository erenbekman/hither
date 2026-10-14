import type { Signal } from './types'

export interface ForgeLogIds {
  serverId: string
  siteId: string
  deploymentId: string
}

export type SuggestionAction =
  | { kind: 'claude'; template: string; repo: string; vars: Record<string, string>; log?: ForgeLogIds }
  | { kind: 'summarize'; template: string; repo: string; vars: Record<string, string> }
  | { kind: 'open'; url: string; label: string }
  | { kind: 'focus-terminal' }

export interface Suggestion {
  id: string
  rule: string
  severity: Signal['severity']
  title: string
  detail: string
  at: string
  remind?: boolean
  actions: SuggestionAction[]
}

export interface RuleInput {
  signals: Signal[]
  now: Date
  sentryOrg: string
  sentryProjectForSite: Record<string, string>
}

export const RULE_ORDER = [
  'deploy-errors',
  'main-failed',
  'deploy-failed',
  'ci-failed',
  'changes-requested',
  'agent-waiting',
  'agent-pr-ready',
  'stale-review',
  'stale-pr',
] as const

const MINUTE = 60_000
export const CORRELATION_WINDOW_MS = 30 * MINUTE
export const WAITING_REMINDER_MS = 10 * MINUTE
export const STALE_PR_MS = 3 * 24 * 60 * MINUTE
export const STALE_PR_LIMIT = 5
const STALE_KINDS = ['review-requested', 'pr']

const str = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined)
const num = (signal: Signal) => String(signal.meta?.number ?? '')
const open = (url: string | undefined, label: string): SuggestionAction[] => (url ? [{ kind: 'open', url, label }] : [])

function deployErrors(input: RuleInput): Suggestion[] {
  const errors = input.signals.filter((s) => s.source === 'sentry' && s.kind === 'error-new')
  return input.signals
    .filter((s) => s.source === 'forge' && s.kind === 'deploy-ok')
    .flatMap((deploy) => {
      const project = input.sentryProjectForSite[deploy.project]
      const start = Date.parse(deploy.at)
      const related = errors.filter((e) => {
        const at = Date.parse(e.at)
        return e.project === project && at >= start && at - start <= CORRELATION_WINDOW_MS
      })
      if (!project || related.length === 0) return []
      const repo = str(deploy.meta?.repo)
      const sha = str(deploy.meta?.sha) ?? str(deploy.meta?.hash) ?? 'unknown'
      const issues = related.map((e) => str(e.meta?.shortId) ?? e.id.replace('sentry:', '')).join(',')
      return [
        {
          id: `deploy-errors:${deploy.id}`,
          rule: 'deploy-errors',
          severity: 'critical' as const,
          title: `Errors started after the ${deploy.project} deploy`,
          detail: `${related.length} new Sentry issue${related.length > 1 ? 's' : ''} within 30 minutes of ${str(deploy.meta?.hash) ?? 'the deploy'}`,
          at: related[0].at,
          actions: [
            ...(repo
              ? [{ kind: 'claude' as const, template: 'deploy-errors', repo, vars: { site: deploy.project, sha, issues, org: input.sentryOrg || 'unknown' } }]
              : []),
            ...open(related[0].url, 'Open in Sentry'),
          ],
        },
      ]
    })
}

function fromSignals(input: RuleInput): Suggestion[] {
  return input.signals.flatMap((s): Suggestion[] => {
    if (s.source === 'github' && s.kind === 'ci-main-failed') {
      const branch = str(s.meta?.branch) ?? 'main'
      return [
        {
          id: `main-failed:${s.id}`,
          rule: 'main-failed',
          severity: 'critical',
          title: `${branch} is red in ${s.project}`,
          detail: s.title,
          at: s.at,
          actions: [{ kind: 'claude', template: 'main-failed', repo: s.project, vars: { repo: s.project, branch } }, ...open(s.url, 'Open commit')],
        },
      ]
    }
    if (s.source === 'forge' && s.kind === 'deploy-failed') {
      const repo = str(s.meta?.repo)
      const ids = { serverId: str(s.meta?.serverId), siteId: str(s.meta?.siteId), deploymentId: str(s.meta?.deploymentId) }
      const log = ids.serverId && ids.siteId && ids.deploymentId ? (ids as ForgeLogIds) : undefined
      return [
        {
          id: `deploy-failed:${s.id}`,
          rule: 'deploy-failed',
          severity: 'critical',
          title: `${s.project} deploy failed`,
          detail: s.title,
          at: s.at,
          actions: [
            ...(repo
              ? [{ kind: 'claude' as const, template: 'deploy-failed', repo, vars: { site: s.project, sha: str(s.meta?.sha) ?? 'unknown' }, log }]
              : []),
            ...open(s.url, 'Open site'),
          ],
        },
      ]
    }
    if (s.source === 'github' && s.kind === 'ci-failed') {
      return [
        {
          id: `ci-failed:${s.id}`,
          rule: 'ci-failed',
          severity: 'attention',
          title: `#${num(s)} checks failing`,
          detail: `${s.project} · ${s.title}`,
          at: s.at,
          actions: [{ kind: 'claude', template: 'ci-failed', repo: s.project, vars: { repo: s.project, number: num(s) } }, ...open(s.url, 'Open checks')],
        },
      ]
    }
    if (s.source === 'github' && s.kind === 'changes-requested') {
      return [
        {
          id: `changes-requested:${s.id}`,
          rule: 'changes-requested',
          severity: 'attention',
          title: `Review comments on #${num(s)}`,
          detail: `${s.project} · ${s.title}`,
          at: s.at,
          actions: [
            { kind: 'claude', template: 'changes-requested', repo: s.project, vars: { repo: s.project, number: num(s) } },
            ...open(s.url, 'Open on GitHub'),
          ],
        },
      ]
    }
    if (s.source === 'github' && s.kind === 'agent-pr-ready') {
      return [
        {
          id: `agent-pr-ready:${s.id}`,
          rule: 'agent-pr-ready',
          severity: 'attention',
          title: `Agent PR ready: #${num(s)}`,
          detail: `${s.project} · ${s.title}`,
          at: s.at,
          actions: [
            { kind: 'summarize', template: 'agent-pr-summary', repo: s.project, vars: { repo: s.project, number: num(s) } },
            ...open(s.url, 'Open on GitHub'),
          ],
        },
      ]
    }
    if (s.source === 'claude-code' && s.kind === 'agent-waiting') {
      const waited = input.now.getTime() - Date.parse(s.at)
      if (waited < WAITING_REMINDER_MS) return []
      return [
        {
          id: `agent-waiting:${s.id}:${s.at}`,
          rule: 'agent-waiting',
          severity: 'attention',
          title: `Claude has waited ${Math.floor(waited / MINUTE)} minutes in ${s.project}`,
          detail: s.title,
          at: s.at,
          remind: true,
          actions: [{ kind: 'focus-terminal' }],
        },
      ]
    }
    return []
  })
}

function stalePullRequests(input: RuleInput): Suggestion[] {
  return input.signals
    .filter((s) => s.source === 'github' && STALE_KINDS.includes(s.kind) && input.now.getTime() - Date.parse(s.at) >= STALE_PR_MS)
    .sort((a, b) => STALE_KINDS.indexOf(a.kind) - STALE_KINDS.indexOf(b.kind) || Date.parse(b.at) - Date.parse(a.at))
    .slice(0, STALE_PR_LIMIT)
    .map((s) => ({
      id: `stale-pr:${s.id}`,
      rule: s.kind === 'review-requested' ? 'stale-review' : 'stale-pr',
      severity: 'info' as const,
      title: `${s.kind === 'review-requested' ? 'Your review on' : ''} #${num(s)} has waited ${Math.floor((input.now.getTime() - Date.parse(s.at)) / (24 * 60 * MINUTE))} days`.trim(),
      detail: `${s.project} · ${s.title}${s.actor ? ` · @${s.actor}` : ''}`,
      at: s.at,
      actions: open(s.url, 'Open on GitHub'),
    }))
}

export function suggest(input: RuleInput): Suggestion[] {
  const rank = (rule: string) => RULE_ORDER.indexOf(rule as (typeof RULE_ORDER)[number])
  return [...deployErrors(input), ...fromSignals(input), ...stalePullRequests(input)].sort(
    (a, b) => rank(a.rule) - rank(b.rule) || Date.parse(b.at) - Date.parse(a.at),
  )
}
