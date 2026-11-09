import { describe, expect, it, vi } from 'vitest'
import { BLINK_FRAMES, BLINK_MS, createTrayBlink } from './tray-blink'

function setup() {
  const apply = vi.fn()
  const pending: (() => void)[] = []
  const later = vi.fn((run: () => void) => void pending.push(run))
  const tick = () => pending.shift()?.()
  return { apply, later, tick, pending, tray: createTrayBlink(apply, later) }
}

const icons = (apply: ReturnType<typeof vi.fn>) => apply.mock.calls.map(([, state]) => state)

describe('createTrayBlink', () => {
  it('shows what it is told when nothing blinks', () => {
    const { apply, later, tray } = setup()
    tray.set(3, 'alert')
    expect(apply).toHaveBeenLastCalledWith(3, 'alert')
    expect(later).not.toHaveBeenCalled()
  })

  it('blinks the alert icon three times and settles on it', () => {
    const { apply, later, tick, pending, tray } = setup()
    tray.set(2, 'alert')
    tray.blink()
    while (pending.length > 0) tick()
    expect(icons(apply)).toEqual(['alert', 'normal', 'alert', 'normal', 'alert', 'normal', 'alert'])
    expect(later).toHaveBeenCalledTimes(BLINK_FRAMES)
    expect(later).toHaveBeenCalledWith(expect.any(Function), BLINK_MS)
    expect(apply).toHaveBeenLastCalledWith(2, 'alert')
  })

  it('keeps the count while it blinks and follows a new state at once', () => {
    const { apply, tick, pending, tray } = setup()
    tray.set(1, 'alert')
    tray.blink()
    tick()
    tray.set(4, 'alert')
    expect(apply).toHaveBeenLastCalledWith(4, 'normal')
    while (pending.length > 0) tick()
    expect(apply.mock.calls.every(([count], i) => (i < 2 ? count === 1 : count === 4))).toBe(true)
    expect(apply).toHaveBeenLastCalledWith(4, 'alert')
  })

  it('starts over instead of running twice when new items arrive mid-blink', () => {
    const { later, tick, pending, tray } = setup()
    tray.set(1, 'alert')
    tray.blink()
    tick()
    tick()
    tray.blink()
    expect(pending).toHaveLength(1)
    while (pending.length > 0) tick()
    expect(later).toHaveBeenCalledTimes(2 + BLINK_FRAMES)
  })
})
