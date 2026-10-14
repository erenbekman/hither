import type { Lane } from './types'

export const TERMINALS = ['iTerm', 'Terminal', 'Ghostty', 'Warp'] as const
export type Terminal = (typeof TERMINALS)[number]
const TERM_PROGRAMS: Record<string, Terminal> = { 'iTerm.app': 'iTerm', Apple_Terminal: 'Terminal', ghostty: 'Ghostty', WarpTerminal: 'Warp' }
export const terminalFor = (termProgram: string | null | undefined): Terminal | undefined =>
  termProgram && Object.hasOwn(TERM_PROGRAMS, termProgram) ? TERM_PROGRAMS[termProgram] : undefined
export const LANE_IDS = ['incoming', 'outgoing', 'agents', 'suggestions'] as const
export type LaneId = (typeof LANE_IDS)[number]
export const QUOTA_VISIBILITY = ['never', 'low', 'always'] as const
export type QuotaVisibility = (typeof QUOTA_VISIBILITY)[number]

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
  watchedRepos: string[]
  forgeEnabled: boolean
  forgeOrg: string
  forgeServers: string[]
  sentryEnabled: boolean
  sentryOrg: string
  sentryProjects: string[]
  agentLogins: string[]
  agentBranchPrefixes: string[]
  sentryProjectForSite: Record<string, string>
  terminal: Terminal
  notificationLanes: Lane[]
  quietHours: boolean
  quietStart: string
  quietEnd: string
  quotaVisibility: QuotaVisibility
  reviewOverdueHours: number
  onboarded: boolean
  lanes: LaneId[]
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
  watchedRepos: [],
  forgeEnabled: false,
  forgeOrg: '',
  forgeServers: [],
  sentryEnabled: false,
  sentryOrg: '',
  sentryProjects: [],
  agentLogins: ['claude', 'copilot-swe-agent', 'chatgpt-codex-connector', 'devin-ai-integration', 'google-labs-jules', 'cursor'],
  agentBranchPrefixes: ['claude/', 'copilot/', 'codex/'],
  sentryProjectForSite: {},
  terminal: 'iTerm',
  notificationLanes: ['incoming', 'outgoing', 'agents'],
  quietHours: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  quotaVisibility: 'low',
  reviewOverdueHours: 24,
  onboarded: false,
  lanes: [...LANE_IDS],
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === 'string')

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const LANES: Lane[] = ['incoming', 'outgoing', 'agents']
const isLaneList = (value: unknown) => Array.isArray(value) && value.every((entry) => LANES.includes(entry))
const isClockTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

function chosenLanes(value: unknown): LaneId[] {
  const chosen = Array.isArray(value) ? LANE_IDS.filter((lane) => value.includes(lane)) : []
  return chosen.length > 0 ? chosen : [...LANE_IDS]
}

export function normalizeSettings(raw: Record<string, unknown>): Settings {
  const pick = <K extends keyof Settings>(key: K, valid: (value: unknown) => boolean): Settings[K] =>
    (valid(raw[key]) ? raw[key] : DEFAULT_SETTINGS[key]) as Settings[K]
  const isBool = (value: unknown) => typeof value === 'boolean'
  const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0
  const isText = (value: unknown) => typeof value === 'string'

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
    watchedRepos: pick('watchedRepos', isStringList).filter((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo)),
    forgeEnabled: pick('forgeEnabled', isBool),
    forgeOrg: pick('forgeOrg', isText).trim(),
    forgeServers: pick('forgeServers', isStringList),
    sentryEnabled: pick('sentryEnabled', isBool),
    sentryOrg: pick('sentryOrg', isText).trim(),
    sentryProjects: pick('sentryProjects', isStringList),
    agentLogins: pick('agentLogins', isStringList),
    agentBranchPrefixes: pick('agentBranchPrefixes', isStringList).filter((prefix) => prefix.length > 0),
    sentryProjectForSite: pick('sentryProjectForSite', isStringRecord),
    terminal: pick('terminal', (value) => TERMINALS.includes(value as Terminal)),
    notificationLanes: pick('notificationLanes', isLaneList),
    quietHours: pick('quietHours', isBool),
    quietStart: pick('quietStart', isClockTime),
    quietEnd: pick('quietEnd', isClockTime),
    quotaVisibility: pick('quotaVisibility', (value) => QUOTA_VISIBILITY.includes(value as QuotaVisibility)),
    reviewOverdueHours: pick('reviewOverdueHours', isCount),
    onboarded: pick('onboarded', isBool),
    lanes: chosenLanes(raw.lanes),
  }
}

export function resolveRepo(settings: Pick<Settings, 'organizations' | 'accounts'>, entry: string): string {
  const name = entry.trim()
  return name.includes('/') ? name : `${settings.organizations[0] ?? settings.accounts[0] ?? '@me'}/${name}`
}

export const sameRepo = (settings: Settings, entry: string, repo: string) => resolveRepo(settings, entry).toLowerCase() === repo.toLowerCase()

export function isRepoWatched(settings: Settings, repo: string): boolean {
  return settings.repoList.some((entry) => sameRepo(settings, entry, repo)) === settings.repoListIsAllowList
}

export function setRepoWatched(settings: Settings, repo: string, watched: boolean): string[] {
  const listed = settings.repoListIsAllowList ? watched : !watched
  if (!listed) return settings.repoList.filter((entry) => !sameRepo(settings, entry, repo))
  return settings.repoList.some((entry) => sameRepo(settings, entry, repo)) ? settings.repoList : [...settings.repoList, repo]
}

export function muteRepo(settings: Settings, repo: string): Pick<Settings, 'repoList' | 'watchedRepos'> {
  return {
    repoList: setRepoWatched(settings, repo, false),
    watchedRepos: settings.watchedRepos.filter((entry) => entry.toLowerCase() !== repo.toLowerCase()),
  }
}

export function scopeLabel(organizations: string[]): string {
  if (organizations.length === 0) return 'Your repositories'
  return organizations.length === 1 ? `Assigned to you in ${organizations[0]}` : `Assigned to you in ${organizations.length} organizations`
}
