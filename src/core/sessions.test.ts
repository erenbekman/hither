import { describe, expect, it } from 'vitest'
import { applyHookEvent, pruneSessions, restoreSessions, sessionSignals, type HookEvent, type Sessions } from './sessions'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 14, 12, minute))
const event = (hook_event_name: string, extra: Partial<HookEvent> = {}): HookEvent => ({
  session_id: 's1',
  hook_event_name,
  cwd: '/Users/eren/projects/hither',
  ...extra,
})

function play(...steps: [number, HookEvent][]): Sessions {
  return steps.reduce<Sessions>((sessions, [minute, e]) => applyHookEvent(sessions, e, at(minute)), {})
}

describe('applyHookEvent', () => {
  it('starts a session as running', () => {
    expect(play([0, event('SessionStart')]).s1).toMatchObject({ state: 'running', since: at(0).toISOString(), cwd: '/Users/eren/projects/hither' })
  })

  it('waits for you on a permission prompt and keeps the message', () => {
    const s = play([0, event('SessionStart')], [3, event('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' })]).s1
    expect(s).toMatchObject({ state: 'waiting', since: at(3).toISOString(), message: 'Claude needs your permission to use Bash' })
  })

  it('goes back to running once a tool runs after the prompt', () => {
    const s = play(
      [0, event('SessionStart')],
      [3, event('Notification', { notification_type: 'permission_prompt' })],
      [5, event('PostToolUse')],
    ).s1
    expect(s.state).toBe('running')
    expect(s.since).toBe(at(5).toISOString())
  })

  it('keeps the start time while a running session keeps using tools', () => {
    expect(play([0, event('SessionStart')], [4, event('PostToolUse')]).s1).toMatchObject({ since: at(0).toISOString(), updatedAt: at(4).toISOString() })
  })

  it('finishes a turn on Stop and waits again on the idle prompt', () => {
    const steps: [number, HookEvent][] = [[0, event('UserPromptSubmit')], [2, event('Stop')]]
    expect(play(...steps).s1.state).toBe('done')
    expect(play(...steps, [3, event('Notification', { notification_type: 'idle_prompt' })]).s1.state).toBe('waiting')
  })

  it('marks a failed turn with the error', () => {
    expect(play([0, event('StopFailure', { error: 'rate_limit' })]).s1).toMatchObject({ state: 'failed', message: 'rate_limit' })
  })

  it('drops the session when it ends', () => {
    expect(play([0, event('SessionStart')], [1, event('SessionEnd', { reason: 'prompt_input_exit' })])).toEqual({})
  })

  it('ignores notifications that do not change the state', () => {
    expect(play([0, event('SessionStart')], [1, event('Notification', { notification_type: 'auth_success' })]).s1.state).toBe('running')
  })
})

describe('pruneSessions', () => {
  it('forgets sessions silent for twelve hours', () => {
    const sessions = play([0, event('SessionStart')])
    expect(pruneSessions(sessions, new Date(at(0).getTime() + 11 * 3_600_000))).toHaveProperty('s1')
    expect(pruneSessions(sessions, new Date(at(0).getTime() + 13 * 3_600_000))).toEqual({})
  })
})

describe('restoreSessions', () => {
  it('keeps valid sessions and drops broken ones', () => {
    const valid = play([0, event('SessionStart')])
    expect(restoreSessions({ ...valid, bad: { id: 'bad', state: 'nope' } })).toEqual(valid)
    expect(restoreSessions('junk')).toEqual({})
  })
})

describe('sessionSignals', () => {
  it('turns sessions into agent signals named after the folder', () => {
    const sessions = play([0, event('Notification', { notification_type: 'permission_prompt', message: 'Allow Bash?', session_title: 'Fix tray' })])
    expect(sessionSignals(sessions)).toEqual([
      {
        id: 'session:s1',
        source: 'claude-code',
        lane: 'agents',
        kind: 'agent-waiting',
        severity: 'attention',
        project: 'hither',
        title: 'Waiting for you: Allow Bash?',
        at: at(0).toISOString(),
        meta: { cwd: '/Users/eren/projects/hither', sessionTitle: 'Fix tray', state: 'waiting' },
      },
    ])
  })
})
