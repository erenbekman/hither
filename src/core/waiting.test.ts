import { describe, expect, it } from 'vitest'
import type { Signal } from './types'
import { nextTurn, reminderDue, reminderKey, reminderNotification, waitingFor, waitingQueue } from './waiting'

const now = new Date('2026-10-21T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

const session = (id: string, state: string, minutes: number, agent?: string): Signal => ({
  id: `session:${id}`,
  source: 'claude-code',
  lane: 'agents',
  kind: `agent-${state}`,
  severity: state === 'waiting' ? 'attention' : 'info',
  project: id,
  title: `${id} needs your permission to use Bash`,
  at: minutesAgo(minutes),
  meta: { agent, state },
})

describe('waitingQueue', () => {
  it('is empty when no agent waits', () => {
    expect(waitingQueue([], now)).toEqual([])
    expect(waitingQueue([session('api', 'running', 5), session('web', 'done', 1), session('cli', 'failed', 9)], now)).toEqual([])
  })

  it('puts the agent that has waited longest first', () => {
    const queue = waitingQueue([session('api', 'waiting', 1), session('web', 'waiting', 7, 'codex'), session('cli', 'running', 9)], now)
    expect(queue).toEqual([
      { id: 'session:web', agent: 'codex', project: 'web', message: 'web needs your permission to use Bash', since: minutesAgo(7), waitedMs: 7 * 60_000 },
      { id: 'session:api', agent: undefined, project: 'api', message: 'api needs your permission to use Bash', since: minutesAgo(1), waitedMs: 60_000 },
    ])
  })
})

describe('reminderDue', () => {
  const queue = waitingQueue([session('api', 'waiting', 3), session('web', 'waiting', 1)], now)

  it('reminds once about each agent that has waited past the threshold', () => {
    const due = reminderDue(queue, new Set(), 2)
    expect(due.map((agent) => agent.id)).toEqual(['session:api'])
    expect(reminderDue(queue, new Set(due.map(reminderKey)), 2)).toEqual([])
  })

  it('reminds again when the agent starts waiting anew', () => {
    const reminded = new Set(reminderDue(queue, new Set(), 2).map(reminderKey))
    const later = waitingQueue([session('api', 'waiting', 4)], new Date(now.getTime() + 10 * 60_000))
    expect(reminderDue(later, reminded, 2).map((agent) => agent.id)).toEqual(['session:api'])
  })

  it('stays quiet when reminders are off', () => {
    expect(reminderDue(queue, new Set(), 0)).toEqual([])
  })
})

describe('waitingFor', () => {
  it('drops the agent name the message starts with', () => {
    const [agent] = waitingQueue([session('api', 'waiting', 3)], now)
    expect(waitingFor({ ...agent, message: 'Claude needs your permission to use Bash' })).toBe('needs your permission to use Bash')
    expect(waitingFor({ ...agent, agent: 'codex', message: 'Codex needs your permission to use Bash' })).toBe('needs your permission to use Bash')
    expect(waitingFor({ ...agent, message: 'Waiting for you' })).toBe('Waiting for you')
  })
})

describe('reminderNotification', () => {
  it('says who has waited how long, where, and for what', () => {
    const [agent] = waitingQueue([session('billing', 'waiting', 3, 'codex')], now)
    expect(reminderNotification({ ...agent, message: 'Codex needs your permission to use Bash' })).toEqual({
      title: 'Codex has been waiting 3 min · billing',
      body: 'needs your permission to use Bash',
      id: 'session:billing',
    })
  })
})

describe('nextTurn', () => {
  const two = waitingQueue([session('api', 'waiting', 3), session('web', 'waiting', 1)], now)

  it('goes to the longest waiting agent first, then through the rest in turn', () => {
    const first = nextTurn(two)
    const second = nextTurn(two, first)
    expect([first, second, nextTurn(two, second)].map((turn) => two[turn!.index].id)).toEqual(['session:api', 'session:web', 'session:api'])
  })

  it('starts over when the queue changes and has nothing to go to when it is empty', () => {
    const turn = nextTurn(two, nextTurn(two))
    const three = waitingQueue([session('api', 'waiting', 3), session('web', 'waiting', 1), session('cli', 'waiting', 5)], now)
    expect(nextTurn(three, turn)!.index).toBe(0)
    expect(nextTurn([], turn)).toBeUndefined()
  })
})
