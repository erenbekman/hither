export interface KeyPress {
  code: string
  metaKey: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

const KEY = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|20)|Space)$/
const SYMBOLS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

export function acceleratorFrom(press: KeyPress): string | undefined {
  if (!KEY.test(press.code) || !(press.metaKey || press.altKey || press.ctrlKey)) return undefined
  const modifiers = [press.ctrlKey && 'Control', press.altKey && 'Alt', press.shiftKey && 'Shift', press.metaKey && 'Command'].filter(Boolean)
  return [...modifiers, press.code].join('+')
}

export function shortcutLabel(accelerator: string): string {
  const parts = accelerator.split('+')
  const key = parts.pop() ?? ''
  return parts.map((part) => SYMBOLS[part] ?? part).join('') + key.replace(/^(Key|Digit)/, '')
}
