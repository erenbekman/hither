import { describe, expect, it } from 'vitest'
import { applyHookEvent } from '../../core/sessions'
import { claudeCodeSource } from './index'

const ctx = { signal: new AbortController().signal }

describe('claudeCodeSource', () => {
  it('reports the current sessions and the hook notices', async () => {
    const sessions = applyHookEvent({}, { session_id: 's', hook_event_name: 'SessionStart', cwd: '/x/api' }, new Date(0))
    const source = claudeCodeSource({ sessions: () => sessions, problem: () => undefined, notices: () => ['Hooks are not installed'] })
    const result = await source.poll(ctx)
    expect(result.signals.map((s) => s.kind)).toEqual(['agent-running'])
    expect(result.notices).toEqual(['Hooks are not installed'])
  })

  it('surfaces a listener that could not start', async () => {
    const problem = { kind: 'unknown' as const, message: 'port 47811 is busy' }
    await expect(claudeCodeSource({ sessions: () => ({}), problem: () => problem, notices: () => [] }).poll(ctx)).rejects.toEqual(problem)
  })
})
