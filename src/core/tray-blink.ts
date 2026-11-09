import type { TrayState } from './board'

export const BLINK_FRAMES = 6
export const BLINK_MS = 400

export function createTrayBlink(apply: (count: number, state: TrayState) => void, later: (run: () => void, ms: number) => void) {
  let count = 0
  let state: TrayState = 'normal'
  let frames = 0
  const render = () => apply(count, frames % 2 === 1 ? 'normal' : state)
  const step = () => {
    frames -= 1
    render()
    if (frames > 0) later(step, BLINK_MS)
  }
  return {
    set(next: number, tray: TrayState) {
      count = next
      state = tray
      render()
    },
    blink() {
      if (frames === 0) later(step, BLINK_MS)
      frames = BLINK_FRAMES
    },
  }
}
