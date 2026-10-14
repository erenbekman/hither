import { describe, expect, it } from 'vitest'
import { suggest } from './core/suggestions'
import { DEMO_SETTINGS, demoSources } from './demo'
import { LANE_ORDER } from './lanes'

describe('demo data', () => {
  it('covers every Incoming, Outgoing and Agents section and triggers every action rule', async () => {
    const signals = (await Promise.all(demoSources().map((source) => source.poll({ signal: new AbortController().signal })))).flatMap(
      (result) => result.signals,
    )
    const kinds = new Set(signals.map((s) => s.kind))
    for (const kind of LANE_ORDER.incoming) expect(kinds).toContain(kind)
    for (const kind of LANE_ORDER.outgoing) expect(kinds).toContain(kind)
    for (const kind of LANE_ORDER.agents) if (kind !== 'agent-failed' && kind !== 'agent-pr') expect(kinds).toContain(kind)

    const rules = new Set(
      suggest({ signals, now: new Date(), sentryOrg: DEMO_SETTINGS.sentryOrg, sentryProjectForSite: DEMO_SETTINGS.sentryProjectForSite }).map(
        (card) => card.rule,
      ),
    )
    expect([...rules].sort()).toEqual(
      ['agent-pr-ready', 'agent-waiting', 'changes-requested', 'ci-failed', 'deploy-errors', 'deploy-failed', 'main-failed', 'stale-pr'].sort(),
    )
  })
})
