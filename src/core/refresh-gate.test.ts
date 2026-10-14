import { describe, expect, it } from 'vitest'
import { RefreshGate } from './refresh-gate'

describe('RefreshGate', () => {
  it('starts a refresh when idle', () => {
    const gate = new RefreshGate()
    expect(gate.begin()).toBe(true)
    expect(gate.isRunning).toBe(true)
  })

  it('does not start a second refresh while running', () => {
    const gate = new RefreshGate()
    gate.begin()
    expect(gate.begin()).toBe(false)
  })

  it('queues an overlapping request and replays it on finish', () => {
    const gate = new RefreshGate()
    gate.begin()
    gate.begin()
    expect(gate.finish()).toBe(true)
    expect(gate.isRunning).toBe(false)
  })

  it('does not replay on finish without overlap', () => {
    const gate = new RefreshGate()
    gate.begin()
    expect(gate.finish()).toBe(false)
  })

  it('collapses a burst into a single replay', () => {
    const gate = new RefreshGate()
    gate.begin()
    gate.begin()
    gate.begin()
    expect(gate.finish()).toBe(true)

    expect(gate.begin()).toBe(true)
    expect(gate.finish()).toBe(false)
  })

  it('reopens after finishing', () => {
    const gate = new RefreshGate()
    gate.begin()
    gate.finish()
    expect(gate.begin()).toBe(true)
  })
})
