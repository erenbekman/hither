import type { Lane, Signal } from './core/types'
import { CI_KINDS, describeSignal as describeGitHub, KIND_ORDER, KIND_TITLES, QUIET_KINDS } from './sources/github'
import { describeDeployment } from './sources/forge'
import { describeIssue } from './sources/sentry'

export const LANE_ORDER: Record<Lane, readonly string[]> = {
  incoming: KIND_ORDER,
  outgoing: ['ci-main-failed', 'deploy-failed', 'error-spike', 'error-new', 'ci-failed', 'deploy-running', 'ci-fixed', 'deploy-ok'],
  agents: [],
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
}

export function sourceLanes(source: string): Lane[] {
  return source === 'github' ? ['incoming', 'outgoing'] : ['outgoing']
}

export function isLoud(signal: Signal): boolean {
  if (signal.lane === 'incoming') return !QUIET_KINDS.includes(signal.kind)
  return signal.severity !== 'info'
}

export function describe(signal: Signal): string {
  if (signal.source === 'forge') return describeDeployment(signal)
  if (signal.source === 'sentry') return describeIssue(signal)
  return describeGitHub(signal)
}

export function subtitle(signal: Signal): string {
  const meta = signal.meta ?? {}
  switch (signal.source) {
    case 'forge':
      return [signal.project, meta.hash, meta.branch, signal.actor].filter(Boolean).join(' · ')
    case 'sentry':
      return [signal.project, meta.shortId, `${meta.lastHour ?? 0} in the last hour`].filter(Boolean).join(' · ')
    default:
      if ((CI_KINDS as readonly string[]).includes(signal.kind) && meta.branch) {
        return [signal.project, meta.branch, signal.actor && `@${signal.actor}`].filter(Boolean).join(' · ')
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
