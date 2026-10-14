import { describe, expect, it } from 'vitest'
import { isOpenable } from './openable'

describe('isOpenable', () => {
  it('opens GitHub, Sentry and Forge links', () => {
    expect(isOpenable('https://github.com/acme/api/pull/1')).toBe(true)
    expect(isOpenable('https://acme.sentry.io/issues/1/')).toBe(true)
    expect(isOpenable('https://forge.laravel.com/')).toBe(true)
  })

  it('opens a site only when it is one of the watched Forge sites', () => {
    expect(isOpenable('https://acme.app/', ['acme.app'])).toBe(true)
    expect(isOpenable('https://evil.example/', ['acme.app'])).toBe(false)
    expect(isOpenable('http://dev.test/', ['dev.test'])).toBe(true)
  })

  it('refuses other schemes and look-alike hosts', () => {
    expect(isOpenable('file:///etc/passwd')).toBe(false)
    expect(isOpenable('http://github.com/acme')).toBe(false)
    expect(isOpenable('https://github.com.evil.example/')).toBe(false)
    expect(isOpenable('https://evilsentry.io/')).toBe(false)
    expect(isOpenable('not a url')).toBe(false)
  })
})
