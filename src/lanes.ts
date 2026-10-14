import type { Lane, Signal } from './core/types'
import { describeSignal as describeGitHub, KIND_ORDER, KIND_TITLES, QUIET_KINDS } from './sources/github'
import { ACTIVITY_SOURCE_ID } from './sources/github/activity'
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
  if (source === ACTIVITY_SOURCE_ID) return ['incoming']
  return ['outgoing']
}

export function isLoud(signal: Signal): boolean {
  if (signal.lane === 'incoming') return !QUIET_KINDS.includes(signal.kind)
  return signal.severity !== 'info'
}

export function isOverdue(signal: Signal, now: Date, hours: number): boolean {
  return signal.kind === 'review-requested' && hours > 0 && now.getTime() - Date.parse(signal.at) >= hours * 3_600_000
}

export function isAmbient(signal: Signal): boolean {
  return signal.source === AGENT_SOURCE_ID && signal.kind === 'agent-done'
}

export function describe(signal: Signal): string {
  if (signal.source === 'forge') return describeDeployment(signal)
  if (signal.source === 'sentry') return describeIssue(signal)
  if (signal.source === 'claude-code') return describeSession(signal.meta?.state, signal.meta?.agent)
  return describeGitHub(signal)
}

export type ChipTone = 'red' | 'orange' | 'blue' | 'green' | 'gray'

const CHIPS: Record<string, [string, ChipTone]> = {
  'changes-requested': ['Changes', 'orange'],
  conflicting: ['Conflicts', 'red'],
  'review-requested': ['Review', 'orange'],
  'ready-to-merge': ['Ready', 'green'],
  assigned: ['Assigned', 'gray'],
  mentioned: ['Mentioned', 'blue'],
  issue: ['Issue', 'gray'],
  'my-pr': ['Yours', 'gray'],
  'deploy-failed': ['Deploy failed', 'red'],
  'error-spike': ['Error spike', 'orange'],
  'error-new': ['New error', 'orange'],
  'ci-failed': ['Checks failed', 'orange'],
  'deploy-running': ['Deploying', 'blue'],
  'ci-fixed': ['Checks fixed', 'green'],
  'deploy-ok': ['Deployed', 'green'],
  'agent-waiting': ['Waiting', 'orange'],
  'agent-failed': ['Error', 'red'],
  'agent-pr-ready': ['PR ready', 'green'],
  'agent-running': ['Working', 'gray'],
  'agent-done': ['Done', 'gray'],
  'agent-pr': ['Agent PR', 'gray'],
}

const ACTIVITY_CHIPS: Record<string, string> = { comment: 'Comment', mention: 'Mention', team_mention: 'Mention', state_change: 'Updated' }

export function chipFor(signal: Signal): { label: string; tone: ChipTone } | undefined {
  if (signal.kind === 'activity') return { label: ACTIVITY_CHIPS[String(signal.meta?.reason)] ?? 'Activity', tone: 'blue' }
  if (signal.kind === 'ci-main-failed') return { label: `${signal.meta?.branch ?? 'main'} is red`, tone: 'red' }
  const chip = Object.hasOwn(CHIPS, signal.kind) ? CHIPS[signal.kind] : undefined
  return chip && { label: chip[0], tone: chip[1] }
}

const repoName = (project: string) => project.split('/').pop() ?? project

export function subtitle(signal: Signal): string {
  const meta = signal.meta ?? {}
  switch (signal.source) {
    case 'forge':
      return [signal.project, meta.hash, meta.branch, signal.actor].filter(Boolean).join(' · ')
    case 'sentry':
      return [signal.project, meta.shortId, `${meta.lastHour ?? 0} in the last hour`].filter(Boolean).join(' · ')
    case 'claude-code':
      return [meta.agent === 'codex' ? 'Codex' : undefined, signal.project, meta.sessionTitle, meta.terminal].filter(Boolean).join(' · ')
    default:
      if (meta.number === undefined) {
        return [repoName(signal.project), meta.branch, signal.actor && `by ${signal.actor}`].filter(Boolean).join(' · ')
      }
      return `${repoName(signal.project)} #${meta.number}${signal.actor ? ` by ${signal.actor}` : ''}${meta.isDraft ? ', draft' : ''}`
  }
}
