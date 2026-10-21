import type { NotificationSpec } from './notifications'
import { agentName } from './sessions'
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

export function waitingFor(agent: WaitingAgent): string {
  const name = `${agentName(agent.agent)} `
  return agent.message.startsWith(name) ? agent.message.slice(name.length) : agent.message
}

export function reminderNotification(agent: WaitingAgent): NotificationSpec {
  return {
    title: `${agentName(agent.agent)} has been waiting ${Math.floor(agent.waitedMs / 60_000)} min · ${agent.project}`,
    body: waitingFor(agent),
    id: agent.id,
  }
}

export interface Turn {
  key: string
  index: number
}

export function nextTurn(queue: WaitingAgent[], last?: Turn): Turn | undefined {
  if (queue.length === 0) return undefined
  const key = queue.map((agent) => agent.id).join('\n')
  return last?.key === key ? { key, index: (last.index + 1) % queue.length } : { key, index: 0 }
}
