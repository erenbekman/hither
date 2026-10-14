import type { Lane, Signal } from './core/types'
import { CI_KINDS, describeSignal as describeGitHub, KIND_ORDER, KIND_TITLES, QUIET_KINDS } from './sources/github'
import { describeDeployment } from './sources/forge'
import { describeIssue } from './sources/sentry'
import { AGENT_SOURCE_ID, describeSession } from './sources/claude-code'

export const LANE_ORDER: Record<Lane, readonly string[]> = {
  incoming: KIND_ORDER,
  outgoing: ['ci-main-failed', 'deploy-failed', 'error-spike', 'error-new', 'ci-failed', 'deploy-running', 'ci-fixed', 'deploy-ok'],
  agents: ['agent-waiting', 'agent-failed', 'agent-pr-ready', 'agent-running', 'agent-done', 'agent-pr'],
}

export const SECTION_TITLES: Record<string, string> = {
  ...KIND_TITLES,
  'ci-main-failed': 'Main Branch Red',
  'deploy-failed': 'Deploy Failed',
  'error-spike': 'Error Spikes',
  'error-new': 'New Errors',
  'ci-failed': 'Checks Failing',
  'deploy-running': 'Deploying',
  'ci-fixed': 'Checks Fixed',
  'deploy-ok': 'Deployed',
  'agent-waiting': 'Waiting for You',
  'agent-failed': 'Stopped with an Error',
  'agent-pr-ready': 'Ready for Review',
  'agent-running': 'Working',
  'agent-done': 'Turn Finished',
  'agent-pr': 'Agent Pull Requests',
}

export function sourceLanes(source: string): Lane[] {
  if (source === 'github') return ['incoming', 'outgoing', 'agents']
  if (source === AGENT_SOURCE_ID) return ['agents']
  return ['outgoing']
}

export function isLoud(signal: Signal): boolean {
  if (signal.lane === 'incoming') return !QUIET_KINDS.includes(signal.kind)
  return signal.severity !== 'info'
}

export function isAmbient(signal: Signal): boolean {
  return signal.source === AGENT_SOURCE_ID && signal.kind === 'agent-done'
}

export function describe(signal: Signal): string {
  if (signal.source === 'forge') return describeDeployment(signal)
  if (signal.source === 'sentry') return describeIssue(signal)
  if (signal.source === 'claude-code') return describeSession(signal.meta?.state)
  return describeGitHub(signal)
}

export function subtitle(signal: Signal): string {
  const meta = signal.meta ?? {}
  switch (signal.source) {
    case 'forge':
      return [signal.project, meta.hash, meta.branch, signal.actor].filter(Boolean).join(' · ')
    case 'sentry':
      return [signal.project, meta.shortId, `${meta.lastHour ?? 0} in the last hour`].filter(Boolean).join(' · ')
    case 'claude-code':
      return [signal.project, meta.sessionTitle].filter(Boolean).join(' · ')
    default:
      if ((CI_KINDS as readonly string[]).includes(signal.kind) && meta.branch) {
        return [signal.project, meta.branch, signal.actor && `@${signal.actor}`].filter(Boolean).join(' · ')
      }
      if (signal.lane === 'agents') {
        const checks = meta.isDraft ? 'draft' : meta.ci === 'SUCCESS' ? 'checks green' : meta.ci ? `checks ${String(meta.ci).toLowerCase()}` : undefined
        return [`${signal.project} #${meta.number}`, signal.actor && `@${signal.actor}`, checks].filter(Boolean).join(' · ')
      }
      return [
        `${signal.project} #${meta.number}`,
        signal.actor && `@${signal.actor}`,
        meta.isDraft ? 'draft' : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
  }
}
