import type { Signal } from './types'

export interface HookEvent {
  session_id: string
  hook_event_name: string
  cwd?: string | null
  notification_type?: string | null
  message?: string | null
  title?: string | null
  error?: string | null
  reason?: string | null
  source?: string | null
  session_title?: string | null
}

export type SessionState = 'running' | 'waiting' | 'done' | 'failed'

export interface Session {
  id: string
  cwd: string
  state: SessionState
  since: string
  updatedAt: string
  title?: string
  message?: string
}

export type Sessions = Record<string, Session>

export const STALE_SESSION_MS = 12 * 3_600_000
export const FINISHED_TURN_MS = 30 * 60_000

const WAITING = new Set(['permission_prompt', 'idle_prompt', 'agent_needs_input', 'elicitation_dialog', 'elicitation_url_dialog'])

function transition(session: Session | undefined, event: HookEvent): Pick<Session, 'state'> & { message?: string } | 'end' | undefined {
  switch (event.hook_event_name) {
    case 'SessionStart':
    case 'UserPromptSubmit':
      return { state: 'running' }
    case 'PostToolUse':
      return session?.state === 'waiting' || !session ? { state: 'running' } : undefined
    case 'Notification':
      if (event.notification_type && WAITING.has(event.notification_type)) {
        return { state: 'waiting', message: event.message ?? undefined }
      }
      return event.notification_type === 'agent_completed' ? { state: 'done' } : undefined
    case 'Stop':
      return { state: 'done' }
    case 'StopFailure':
      return { state: 'failed', message: event.error ?? undefined }
    case 'SessionEnd':
      return 'end'
    default:
      return undefined
  }
}

export function applyHookEvent(sessions: Sessions, event: HookEvent, now: Date): Sessions {
  const at = now.toISOString()
  const current = sessions[event.session_id]
  const next = transition(current, event)
  const result = { ...sessions }
  if (next === 'end') {
    delete result[event.session_id]
    return result
  }
  const base: Session = current ?? { id: event.session_id, cwd: event.cwd ?? '', state: 'running', since: at, updatedAt: at }
  const changed = next !== undefined && (next.state !== base.state || next.message !== base.message)
  result[event.session_id] = {
    ...base,
    cwd: event.cwd ?? base.cwd,
    title: event.session_title ?? base.title,
    updatedAt: at,
    ...(next ? { state: next.state, message: next.message } : {}),
    since: changed || !current ? at : base.since,
  }
  return result
}

export function pruneSessions(sessions: Sessions, now: Date, maxAgeMs = STALE_SESSION_MS): Sessions {
  return Object.fromEntries(Object.entries(sessions).filter(([, s]) => now.getTime() - Date.parse(s.updatedAt) <= maxAgeMs))
}

export function restoreSessions(raw: unknown): Sessions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const states = new Set(['running', 'waiting', 'done', 'failed'])
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, value]) => {
      const s = value as Partial<Session> | null
      return (
        typeof s?.id === 'string' &&
        typeof s.cwd === 'string' &&
        states.has(s.state as string) &&
        typeof s.since === 'string' &&
        typeof s.updatedAt === 'string'
      )
    }),
  ) as Sessions
}

const TITLES: Record<SessionState, string> = {
  running: 'Working',
  waiting: 'Waiting for you',
  done: 'Turn finished',
  failed: 'Stopped with an error',
}

export function sessionSignals(sessions: Sessions, now: Date): Signal[] {
  return Object.values(sessions)
    .filter((session) => session.state !== 'done' || now.getTime() - Date.parse(session.since) <= FINISHED_TURN_MS)
    .map((session) => ({
      id: `session:${session.id}`,
      source: 'claude-code',
      lane: 'agents',
      kind: `agent-${session.state}`,
      severity: session.state === 'failed' ? 'critical' : session.state === 'waiting' ? 'attention' : 'info',
      project: session.cwd.split('/').filter(Boolean).pop() ?? session.cwd,
      title: !session.message ? TITLES[session.state] : session.state === 'failed' ? session.message.replace(/_/g, ' ') : session.message,
      at: session.since,
      meta: { cwd: session.cwd, sessionTitle: session.title, state: session.state },
    }))
}
