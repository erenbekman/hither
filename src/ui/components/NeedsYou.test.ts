import { expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { agentName } from '../../core/sessions'
import type { WaitingAgent } from '../../core/waiting'
import NeedsYou from './NeedsYou.vue'

const now = new Date('2026-10-21T12:00:00Z')
const agent = (id: string, minutes: number, name?: string): WaitingAgent => ({
  id: `session:${id}`,
  agent: name,
  project: id,
  message: `${agentName(name)} needs your permission to use Bash`,
  since: new Date(now.getTime() - minutes * 60_000).toISOString(),
  waitedMs: minutes * 60_000,
})

const render = (queue: WaitingAgent[]) => renderToString(createSSRApp({ render: () => h(NeedsYou, { queue, now }) }))

it('shows nothing while no agent waits', async () => {
  expect(await render([])).toBe('<!---->')
})

it('lists up to three waiting agents with how long they have waited, then a count of the rest', async () => {
  const html = await render([agent('billing', 4), agent('api', 2, 'codex'), agent('web', 1, 'copilot'), agent('cli', 1), agent('docs', 0)])
  expect(html.match(/data-row/g)).toHaveLength(3)
  expect(html).toContain('Claude · billing')
  expect(html).toContain('Codex · api')
  expect(html).toContain('Copilot · web')
  expect(html).toContain('4m')
  expect(html).toContain('>needs your permission to use Bash<')
  expect(html).not.toContain('Claude needs')
  expect(html).toContain('+2 more')
  expect(html).not.toContain('cli')
})
