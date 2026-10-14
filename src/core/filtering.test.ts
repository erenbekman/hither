import { describe, expect, it } from 'vitest'
import { buildSections, filterSections, flattenLane, type FilterOptions } from './filtering'
import type { Signal } from './types'

const ORDER = ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr'] as const
type Kind = (typeof ORDER)[number]

const base = Date.parse('2026-10-14T12:00:00Z')

function signal(
  number: number,
  kind: Kind,
  { repo = 'alice/webapp', bot = false, draft = false, minutesAgo = 0 } = {},
): Signal {
  return {
    id: `https://github.com/${repo}/pull/${number}`,
    source: 'github',
    lane: 'incoming',
    kind,
    severity: 'info',
    project: repo,
    title: `Title ${number}`,
    actor: bot ? 'dependabot' : 'bob',
    at: new Date(base - minutesAgo * 60_000).toISOString(),
    meta: { number, isBot: bot, isDraft: draft },
  }
}

const options = (overrides: Partial<FilterOptions> = {}): FilterOptions => ({
  order: ORDER,
  hiddenKinds: [],
  showBots: false,
  showDrafts: true,
  groupThreshold: 3,
  ...overrides,
})

const numbers = (sections: ReturnType<typeof buildSections>, kind: Kind) =>
  sections.find((section) => section.kind === kind)?.signals.map((s) => s.meta?.number)

const both = (number: number, kinds: Kind[], opts?: Parameters<typeof signal>[2]) => kinds.map((kind) => signal(number, kind, opts))

describe('buildSections', () => {
  it('does not let a hidden section take items from the others', () => {
    const sections = buildSections(both(1, ['pr', 'review-requested']), options({ hiddenKinds: ['review-requested'] }))
    expect(numbers(sections, 'pr')).toEqual([1])
    expect(sections.some((section) => section.kind === 'review-requested')).toBe(false)
  })

  it('drops bots by default', () => {
    const sections = buildSections([signal(1, 'pr'), signal(2, 'pr', { bot: true })], options())
    expect(numbers(sections, 'pr')).toEqual([1])
  })

  it('keeps bots when showBots is on', () => {
    const sections = buildSections([signal(1, 'pr'), signal(2, 'pr', { bot: true })], options({ showBots: true }))
    expect(numbers(sections, 'pr')).toHaveLength(2)
  })

  it('drops drafts when showDrafts is off', () => {
    const sections = buildSections([signal(1, 'pr'), signal(2, 'pr', { draft: true })], options({ showDrafts: false }))
    expect(numbers(sections, 'pr')).toEqual([1])
  })

  it('shows a pull request found in both searches only under Review Requested', () => {
    const shared = both(204, ['pr', 'review-requested'], { repo: 'acme/backend' })
    const sections = buildSections([signal(1, 'pr'), ...shared], options())
    expect(numbers(sections, 'pr')).toEqual([1])
    expect(numbers(sections, 'review-requested')).toEqual([204])
  })

  it('lets Changes Requested remove copies from the other sections', () => {
    const shared = both(204, ['pr', 'review-requested', 'changes-requested'], { repo: 'acme/backend' })
    const sections = buildSections([signal(1, 'pr'), ...shared], options())
    expect(numbers(sections, 'pr')).toEqual([1])
    expect(numbers(sections, 'review-requested')).toBeUndefined()
    expect(numbers(sections, 'changes-requested')).toEqual([204])
  })

  it('puts your own pull requests in their own section', () => {
    const sections = buildSections([signal(1, 'pr'), signal(91, 'my-pr', { repo: 'other/project' })], options())
    expect(sections.map((section) => section.kind)).toEqual(['pr', 'my-pr'])
    expect(numbers(sections, 'my-pr')).toEqual([91])
  })

  it('does not repeat a pull request with requested changes under My Pull Requests', () => {
    const sections = buildSections([...both(88, ['changes-requested', 'my-pr']), signal(91, 'my-pr')], options())
    expect(numbers(sections, 'changes-requested')).toEqual([88])
    expect(numbers(sections, 'my-pr')).toEqual([91])
  })

  it('shows a pull request assigned to you only under Pull Requests', () => {
    expect(buildSections(both(42, ['pr', 'my-pr']), options()).map((section) => section.kind)).toEqual(['pr'])
  })

  it('sorts newest first', () => {
    const sections = buildSections(
      [signal(1, 'pr', { minutesAgo: 500 }), signal(2, 'pr', { minutesAgo: 10 }), signal(3, 'pr', { minutesAgo: 100 })],
      options(),
    )
    expect(numbers(sections, 'pr')).toEqual([2, 3, 1])
  })

  it('folds a repository above the threshold into one row', () => {
    const noisy = [1, 2, 3, 4, 5].map((n) => signal(n, 'issue', { repo: 'alice/noisy' }))
    const [section] = buildSections([...noisy, signal(90, 'issue')], options({ groupThreshold: 3 }))
    expect(section.rows.flatMap((row) => (row.type === 'group' ? [row.project] : []))).toEqual(['alice/noisy'])
    expect(section.rows.flatMap((row) => (row.type === 'item' ? [row.signal.meta?.number] : []))).toEqual([90])
  })

  it('places a folded group where its newest item would be', () => {
    const rows = buildSections(
      [
        signal(90, 'issue', { minutesAgo: 5 }),
        ...[1, 2, 3, 4].map((n) => signal(n, 'issue', { repo: 'alice/noisy', minutesAgo: n * 10 })),
        signal(91, 'issue', { minutesAgo: 100 }),
      ],
      options({ groupThreshold: 3 }),
    )[0].rows
    expect(rows.map((row) => (row.type === 'group' ? row.project : row.signal.meta?.number))).toEqual([90, 'alice/noisy', 91])
  })

  it('does not fold a repository at or below the threshold', () => {
    const [section] = buildSections([1, 2, 3].map((n) => signal(n, 'issue')), options({ groupThreshold: 3 }))
    expect(section.rows).toHaveLength(3)
    expect(section.rows.every((row) => row.type === 'item')).toBe(true)
  })

  it('leaves out empty sections', () => {
    expect(buildSections([signal(1, 'pr')], options()).map((section) => section.kind)).toEqual(['pr'])
  })

  it('does not process sections hidden by the user', () => {
    const sections = buildSections([signal(1, 'pr'), signal(2, 'issue'), signal(3, 'review-requested')], options({ hiddenKinds: ['pr', 'issue'] }))
    expect(sections.map((section) => section.kind)).toEqual(['review-requested'])
    expect(sections.flatMap((section) => section.signals.map((s) => s.meta?.number))).toEqual([3])
  })

  it('returns sections in order of urgency', () => {
    const sections = buildSections(
      [signal(1, 'pr'), signal(2, 'issue'), signal(3, 'review-requested'), signal(4, 'changes-requested'), signal(5, 'my-pr')],
      options(),
    )
    expect(sections.map((section) => section.kind)).toEqual([...ORDER])
  })
})

describe('filterSections', () => {
  const sections = () =>
    buildSections(
      [
        signal(1, 'pr', { repo: 'acme/api' }),
        signal(2, 'pr', { repo: 'acme/api' }),
        signal(3, 'pr', { repo: 'acme/api' }),
        signal(4, 'pr', { repo: 'acme/api' }),
        signal(5, 'issue', { repo: 'acme/web' }),
      ],
      { order: ORDER, hiddenKinds: [], showBots: true, showDrafts: true, groupThreshold: 3 },
    )

  it('keeps everything for an empty query', () => {
    expect(filterSections(sections(), '  ')).toEqual(sections())
  })

  it('matches title, repository, #number and @person, every word, ignoring case', () => {
    const ids = (query: string) => filterSections(sections(), query).flatMap((section) => section.signals.map((s) => s.meta?.number))
    expect(ids('title 2')).toEqual([2])
    expect(ids('ACME/WEB')).toEqual([5])
    expect(ids('#4')).toEqual([4])
    expect(ids('@bob web')).toEqual([5])
    expect(ids('nothing')).toEqual([])
  })

  it('unfolds repository groups so every match is its own row', () => {
    const [prs] = filterSections(sections(), 'acme/api')
    expect(prs.rows.map((row) => row.type)).toEqual(['item', 'item', 'item', 'item'])
  })
})

describe('flattenLane', () => {
  const loud = (n: number, repo: string, minutesAgo: number) => ({ ...signal(n, 'review-requested', { repo, minutesAgo }), severity: 'attention' as const })

  it('keeps the section order, newest first inside, with no headers', () => {
    const sections = buildSections([signal(1, 'pr', { minutesAgo: 5 }), loud(2, 'alice/webapp', 50), signal(3, 'pr', { minutesAgo: 1 })], options({ groupThreshold: 0 }))
    expect(flattenLane(sections, 0).map((row) => (row.type === 'item' ? row.signal.meta?.number : row.project))).toEqual([2, 3, 1])
  })

  it('folds only quiet items of a busy repository, at the place of its first item', () => {
    const sections = buildSections(
      [loud(1, 'acme/api', 1), loud(2, 'acme/api', 2), signal(3, 'pr', { repo: 'acme/api', minutesAgo: 3 }), signal(4, 'pr', { repo: 'acme/web', minutesAgo: 4 }), signal(5, 'pr', { repo: 'acme/api', minutesAgo: 5 }), signal(6, 'issue', { repo: 'acme/api', minutesAgo: 6 }), signal(7, 'pr', { repo: 'acme/api', minutesAgo: 7 })],
      options({ groupThreshold: 0 }),
    )
    const rows = flattenLane(sections, 3)
    expect(rows.map((row) => (row.type === 'item' ? row.signal.meta?.number : `${row.project}:${row.signals.length}`))).toEqual([1, 2, 'acme/api:4', 4])
  })
})

