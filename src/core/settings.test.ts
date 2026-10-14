import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isRepoWatched, muteRepo, normalizeSettings, setRepoWatched } from './settings'

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

  it('keeps only known lanes and well-formed quiet hours', () => {
    const settings = normalizeSettings({ notificationLanes: ['agents', 'suggestions', 3], quietStart: '7:00', quietEnd: '23:59' })
    expect(settings.notificationLanes).toEqual(DEFAULT_SETTINGS.notificationLanes)
    expect(settings.quietStart).toBe('22:00')
    expect(settings.quietEnd).toBe('23:59')
    expect(normalizeSettings({ notificationLanes: ['agents'] }).notificationLanes).toEqual(['agents'])
  })

  it('keeps only a supported terminal', () => {
    expect(normalizeSettings({ terminal: 'Ghostty' }).terminal).toBe('Ghostty')
    expect(normalizeSettings({ terminal: 'Hyper' }).terminal).toBe('iTerm')
  })
})

describe('muteRepo', () => {
  it('adds the repository to the hidden list and stops watching it', () => {
    const settings = { ...DEFAULT_SETTINGS, repoList: ['acme/old'], watchedRepos: ['acme/api', 'acme/web'] }
    expect(muteRepo(settings, 'acme/api')).toEqual({ repoList: ['acme/old', 'acme/api'], watchedRepos: ['acme/web'] })
  })

  it('does not add a repository twice', () => {
    expect(muteRepo({ ...DEFAULT_SETTINGS, repoList: ['Acme/API'] }, 'acme/api').repoList).toEqual(['Acme/API'])
  })

  it('removes the repository from an allow list, written with or without its owner', () => {
    const settings = { ...DEFAULT_SETTINGS, organizations: ['acme', 'widgets'], repoListIsAllowList: true, repoList: ['acme/api', 'web', 'acme/docs'] }
    expect(muteRepo(settings, 'acme/api').repoList).toEqual(['web', 'acme/docs'])
    expect(muteRepo(settings, 'acme/web').repoList).toEqual(['acme/api', 'acme/docs'])
    expect(muteRepo(settings, 'widgets/web').repoList).toEqual(settings.repoList)
  })
})

describe('repository checklist', () => {
  it('reads a checked box as watched in both list modes', () => {
    const hide = { ...DEFAULT_SETTINGS, organizations: ['acme', 'widgets'], repoList: ['acme/old', 'web'] }
    expect(isRepoWatched(hide, 'acme/api')).toBe(true)
    expect(isRepoWatched(hide, 'acme/old')).toBe(false)
    expect(isRepoWatched(hide, 'acme/web')).toBe(false)
    expect(isRepoWatched(hide, 'widgets/web')).toBe(true)
    expect(isRepoWatched({ ...hide, repoListIsAllowList: true }, 'acme/old')).toBe(true)
  })

  it('checks and unchecks by editing the one list', () => {
    const hide = { ...DEFAULT_SETTINGS, repoList: ['acme/old'] }
    expect(setRepoWatched(hide, 'acme/old', true)).toEqual([])
    expect(setRepoWatched(hide, 'acme/api', false)).toEqual(['acme/old', 'acme/api'])
    const only = { ...hide, repoListIsAllowList: true }
    expect(setRepoWatched(only, 'acme/api', true)).toEqual(['acme/old', 'acme/api'])
    expect(setRepoWatched(only, 'acme/old', false)).toEqual([])
  })
})

