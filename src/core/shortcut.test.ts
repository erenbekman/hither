import { describe, expect, it } from 'vitest'
import { acceleratorFrom, shortcutLabel } from './shortcut'

const press = (code: string, keys: { meta?: boolean; alt?: boolean; ctrl?: boolean; shift?: boolean } = {}) => ({
  code,
  metaKey: !!keys.meta,
  altKey: !!keys.alt,
  ctrlKey: !!keys.ctrl,
  shiftKey: !!keys.shift,
})

describe('acceleratorFrom', () => {
  it('turns a key with modifiers into the shortcut Tauri registers', () => {
    expect(acceleratorFrom(press('KeyJ', { meta: true, alt: true }))).toBe('Alt+Command+KeyJ')
    expect(acceleratorFrom(press('Digit1', { ctrl: true, shift: true, meta: true }))).toBe('Control+Shift+Command+Digit1')
    expect(acceleratorFrom(press('F5', { alt: true }))).toBe('Alt+F5')
  })

  it('waits for a real key and refuses shortcuts that would swallow typing', () => {
    expect(acceleratorFrom(press('MetaLeft', { meta: true }))).toBeUndefined()
    expect(acceleratorFrom(press('KeyJ'))).toBeUndefined()
    expect(acceleratorFrom(press('KeyJ', { shift: true }))).toBeUndefined()
    expect(acceleratorFrom(press('Enter', { meta: true }))).toBeUndefined()
  })
})

describe('shortcutLabel', () => {
  it('shows the shortcut the way macOS menus do', () => {
    expect(shortcutLabel('Alt+Command+KeyJ')).toBe('⌥⌘J')
    expect(shortcutLabel('Control+Shift+Command+Digit1')).toBe('⌃⇧⌘1')
    expect(shortcutLabel('Alt+F5')).toBe('⌥F5')
    expect(shortcutLabel('Alt+Command+Space')).toBe('⌥⌘Space')
  })
})
