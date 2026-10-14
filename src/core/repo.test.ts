import { describe, expect, it } from 'vitest'
import { githubRepo } from './repo'

describe('githubRepo', () => {
  it('reads owner/name from the usual remote forms', () => {
    expect(githubRepo('https://github.com/acme/api.git')).toBe('acme/api')
    expect(githubRepo('https://github.com/acme/api')).toBe('acme/api')
    expect(githubRepo('git@github.com:acme/my.site.git')).toBe('acme/my.site')
    expect(githubRepo('ssh://git@github.com/acme/api.git')).toBe('acme/api')
    expect(githubRepo('acme/api')).toBe('acme/api')
  })

  it('ignores other hosts and junk', () => {
    expect(githubRepo('https://gitlab.com/acme/api.git')).toBeUndefined()
    expect(githubRepo('')).toBeUndefined()
    expect(githubRepo(null)).toBeUndefined()
    expect(githubRepo('acme/api; rm -rf ~')).toBeUndefined()
  })
})
