import type { AppError } from '../../core/errors'
import type { Sessions } from '../../core/sessions'
import { sessionSignals } from '../../core/sessions'
import type { Source } from '../../core/types'

export const AGENT_SOURCE_ID = 'claude-code'

export function claudeCodeSource(deps: {
  sessions: () => Sessions
  problem: () => AppError | undefined
  notices: () => string[]
  now?: () => Date
}): Source {
  const now = deps.now ?? (() => new Date())
  return {
    id: AGENT_SOURCE_ID,
    interval: 0,
    async poll() {
      const problem = deps.problem()
      if (problem) throw problem
      return { signals: sessionSignals(deps.sessions(), now()), notices: deps.notices() }
    },
  }
}

export function describeSession(state: unknown): string {
  if (state === 'waiting') return 'Claude is waiting'
  if (state === 'failed') return 'Claude stopped'
  return 'Claude'
}
