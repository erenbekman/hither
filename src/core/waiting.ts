import type { Signal } from './types'

export interface WaitingAgent {
  id: string
  agent?: string
  project: string
  message: string
  since: string
  waitedMs: number
}

export function waitingQueue(signals: Signal[], now: Date): WaitingAgent[] {
  return signals
    .filter((signal) => signal.kind === 'agent-waiting')
    .map((signal) => ({
      id: signal.id,
      agent: typeof signal.meta?.agent === 'string' ? signal.meta.agent : undefined,
      project: signal.project,
      message: signal.title,
      since: signal.at,
      waitedMs: Math.max(0, now.getTime() - Date.parse(signal.at)),
    }))
    .sort((a, b) => b.waitedMs - a.waitedMs)
}

export const reminderKey = (agent: WaitingAgent) => `${agent.id}@${agent.since}`

export function reminderDue(queue: WaitingAgent[], reminded: ReadonlySet<string>, minutes: number): WaitingAgent[] {
  if (minutes <= 0) return []
  return queue.filter((agent) => agent.waitedMs >= minutes * 60_000 && !reminded.has(reminderKey(agent)))
}
