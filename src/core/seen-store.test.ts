import { describe, expect, it } from 'vitest'
import { SeenStore } from './seen-store'

const ORDER = ['changes-requested', 'review-requested', 'pr', 'issue', 'my-pr']
const item = (n: number) => ({ id: `https://example.com/${n}` })
const day = 86_400_000
const start = new Date(0)
const after = (days: number) => new Date(days * day)
const reload = (store: SeenStore) => new SeenStore(JSON.parse(JSON.stringify(store.toJSON())))

describe('SeenStore', () => {
  it('marks and reads', () => {
    const store = new SeenStore()
    expect(store.isSeen(item(1).id)).toBe(false)
    store.markSeen([item(1).id], start)
    expect(store.isSeen(item(1).id)).toBe(true)
  })

  it('survives a save and reload', () => {
    const store = new SeenStore()
    store.markSeen([item(1).id], start)
    expect(reload(store).isSeen(item(1).id)).toBe(true)
  })

  it('reports the first run once', () => {
    const store = new SeenStore()
    expect(store.isFirstRun).toBe(true)
    expect(store.markFirstRunDone()).toBe(true)
    expect(store.isFirstRun).toBe(false)
    expect(store.markFirstRunDone()).toBe(false)
  })

  it('does not count items as seen on the first run', () => {
    const store = new SeenStore()
    store.markFirstRunDone()
    expect(store.unseen([item(1), item(2)])).toHaveLength(2)
  })

  it('returns the unseen items', () => {
    const store = new SeenStore()
    store.markSeen([item(1).id], start)
    expect(store.unseen([item(1), item(2), item(3)])).toEqual([item(2), item(3)])
  })

  it('forgets items GitHub stopped returning after two weeks', () => {
    const store = new SeenStore()
    store.markSeen(['a', 'b', 'c'], start)
    store.recordReturned(['a', 'b', 'c'], start)
    store.recordReturned(['a', 'c'], after(10))
    store.prune(after(15))
    expect(store.isSeen('a')).toBe(true)
    expect(store.isSeen('b')).toBe(false)
    expect(store.isSeen('c')).toBe(true)
  })

  it('keeps the marks of an item hidden by a filter for a while', () => {
    const store = new SeenStore()
    store.markSeen(['a'], start)
    store.markNotified(['a'])
    store.recordReturned(['a'], start)
    store.prune(after(3))
    expect(store.isSeen('a')).toBe(true)
    expect(store.unnotified([{ id: 'a' }])).toEqual([])
  })

  it('makes an item new again when it moves to a stronger section', () => {
    const store = new SeenStore()
    expect(store.promote(new Map([['a', 'my-pr']]), ORDER).size).toBe(0)
    store.markSeen(['a'], start)
    store.markNotified(['a'])
    expect(store.promote(new Map([['a', 'changes-requested']]), ORDER)).toEqual(new Set(['a']))
    expect(store.isSeen('a')).toBe(false)
    expect(store.unnotified([{ id: 'a' }])).toHaveLength(1)
    expect(store.promote(new Map([['a', 'my-pr']]), ORDER).size).toBe(0)
  })

  it('starts over from a corrupt file instead of crashing', () => {
    for (const raw of ['this is not json', { version: 1, seen: 3 }, null]) {
      const store = new SeenStore(raw)
      expect(store.isFirstRun).toBe(true)
      expect(store.isSeen('anything')).toBe(false)
    }
  })

  it('resets everything when the account changes', () => {
    const store = new SeenStore()
    expect(store.switchAccount('alice')).toBe(false)
    store.markFirstRunDone()
    store.markSeen(['a'], start)
    store.markNotified(['a'])
    expect(store.switchAccount('alice')).toBe(false)
    expect(store.isSeen('a')).toBe(true)
    expect(store.switchAccount('bob')).toBe(true)
    expect(store.isSeen('a')).toBe(false)
    expect(store.isFirstRun).toBe(true)
    expect(store.account).toBe('bob')
  })
})

describe('SeenStore notifications', () => {
  it('never notifies an item twice', () => {
    const store = new SeenStore()
    const items = [item(1), item(2)]
    expect(store.unnotified(items)).toHaveLength(2)
    store.markNotified(items.map((i) => i.id))
    expect(store.unnotified(items)).toEqual([])
    expect(store.unnotified([...items, item(3)])).toEqual([item(3)])
  })

  it('keeps notified apart from seen', () => {
    const store = new SeenStore()
    store.markNotified([item(1).id])
    expect(store.isSeen(item(1).id)).toBe(false)
  })

  it('survives a save and reload', () => {
    const store = new SeenStore()
    store.markFirstRunDone()
    store.markNotified([item(1).id])
    const reloaded = reload(store)
    expect(reloaded.unnotified([item(1)])).toEqual([])
    expect(reloaded.isFirstRun).toBe(false)
  })

  it('lets prune clear the notified set too', () => {
    const store = new SeenStore()
    store.markNotified([item(1).id, 'b'])
    store.recordReturned([item(1).id, 'b'], start)
    store.prune(after(15))
    expect(store.unnotified([item(1)])).toHaveLength(1)
  })
})
