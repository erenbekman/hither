import { describe, expect, it } from 'vitest'
import { errorHint, errorText, toAppError } from './errors'

describe('toAppError', () => {
  it('keeps known errors from the Rust shell', () => {
    expect(toAppError({ kind: 'gh-not-authenticated' })).toEqual({ kind: 'gh-not-authenticated' })
  })

  it('wraps unknown kinds instead of passing them through', () => {
    expect(toAppError({ kind: 'nope' })).toEqual({ kind: 'unknown', message: '[object Object]' })
  })

  it('keeps an unknown error that already carries its message', () => {
    expect(toAppError({ kind: 'unknown', message: 'port busy' })).toEqual({ kind: 'unknown', message: 'port busy' })
  })

  it('wraps strings and Error instances', () => {
    expect(toAppError('keychain locked')).toEqual({ kind: 'unknown', message: 'keychain locked' })
    expect(toAppError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' })
  })
})

describe('errorText', () => {
  it('suggests gh auth login when not signed in', () => {
    const error = toAppError({ kind: 'gh-not-authenticated' })
    expect(errorText(error)).toBe('Not signed in to GitHub CLI')
    expect(errorHint(error)).toEqual({ command: 'gh auth login' })
  })
})
