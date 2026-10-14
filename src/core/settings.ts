export interface Settings {
  refreshMinutes: number
  notifications: boolean
  accounts: string[]
  organizations: string[]
  repoList: string[]
  repoListIsAllowList: boolean
  showBots: boolean
  showDrafts: boolean
  hiddenKinds: string[]
  repoGroupThreshold: number
}

export const DEFAULT_SETTINGS: Settings = {
  refreshMinutes: 5,
  notifications: true,
  accounts: ['@me'],
  organizations: [],
  repoList: [],
  repoListIsAllowList: false,
  showBots: false,
  showDrafts: true,
  hiddenKinds: [],
  repoGroupThreshold: 3,
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

export function normalizeSettings(raw: Record<string, unknown>): Settings {
  const pick = <K extends keyof Settings>(key: K, valid: (value: unknown) => boolean): Settings[K] =>
    (valid(raw[key]) ? raw[key] : DEFAULT_SETTINGS[key]) as Settings[K]
  const isBool = (value: unknown) => typeof value === 'boolean'
  const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

  const accounts = pick('accounts', isStringList)
  return {
    refreshMinutes: Math.max(1, pick('refreshMinutes', isCount)),
    notifications: pick('notifications', isBool),
    accounts: accounts.length > 0 ? accounts : DEFAULT_SETTINGS.accounts,
    organizations: pick('organizations', isStringList),
    repoList: pick('repoList', isStringList),
    repoListIsAllowList: pick('repoListIsAllowList', isBool),
    showBots: pick('showBots', isBool),
    showDrafts: pick('showDrafts', isBool),
    hiddenKinds: pick('hiddenKinds', isStringList),
    repoGroupThreshold: pick('repoGroupThreshold', isCount),
  }
}
