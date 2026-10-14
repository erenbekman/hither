import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
  it('fills a fresh install with defaults', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values and replaces invalid ones', () => {
    const settings = normalizeSettings({ refreshMinutes: 10, showBots: 'yes', organizations: ['acme', 3] })
    expect(settings.refreshMinutes).toBe(10)
    expect(settings.showBots).toBe(false)
    expect(settings.organizations).toEqual([])
  })

  it('never refreshes more often than once a minute', () => {
    expect(normalizeSettings({ refreshMinutes: 0 }).refreshMinutes).toBe(1)
  })

  it('falls back to @me when the account list is empty', () => {
    expect(normalizeSettings({ accounts: [] }).accounts).toEqual(['@me'])
  })

  it('keeps only owner/name entries in the watched repositories', () => {
    expect(normalizeSettings({ watchedRepos: ['acme/api', 'nope', 'a/b/c', 'me/site.app'] }).watchedRepos).toEqual([
      'acme/api',
      'me/site.app',
    ])
  })
})
