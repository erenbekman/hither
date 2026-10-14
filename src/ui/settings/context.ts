import { inject, provide, reactive, type InjectionKey } from 'vue'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { load as loadStore, type Store } from '@tauri-apps/plugin-store'
import type { HookStatus } from '../../core/claude-settings'
import { toAppError, type AppError } from '../../core/errors'
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../../core/settings'
import { launchAtLogin, openTemplates, secretDelete, secretGet, secretSet, setLaunchAtLogin } from '../../native'
import { FORGE_TOKEN_KEY, listForgeOrganizations, listForgeServers } from '../../sources/forge'
import { fetchOrganizations } from '../../sources/github'
import { SENTRY_TOKEN_KEY } from '../../sources/sentry'
import { githubToken } from '../github-auth'
import { changeCodexHooks, installHooks, readCodexHookStatus, readHookStatus, uninstallHooks } from '../hooks'
import { announceSettingsChanged, onAccountChanged, onSettingsChanged, openSettingsStore, readSettings, REPOS_FILE, writeSettings } from '../settings-store'
import { startUpdates } from '../update-runtime'

export interface SettingsState {
  settings: Settings
  organizations: string[]
  knownRepos: Record<string, number>
  forgeOrgs: { slug: string; name: string }[]
  forgeServers: { id: string; name: string }[]
  tokens: Record<string, boolean>
  hooks?: HookStatus
  codexHooks?: HookStatus | 'unavailable'
  hooksBlocked: boolean
  backup?: string
  launchAtLogin?: boolean
  loaded: boolean
  errors: AppError[]
}

const SIGN_IN_ERRORS: AppError['kind'][] = ['gh-not-found', 'gh-not-authenticated', 'github-unauthorized']

const asError = (error: unknown): AppError => (typeof error === 'string' ? { kind: 'unknown', message: error } : toAppError(error))

export function createSettingsContext() {
  const state = reactive<SettingsState>({
    settings: { ...DEFAULT_SETTINGS },
    organizations: [],
    knownRepos: {},
    forgeOrgs: [],
    forgeServers: [],
    tokens: {},
    hooksBlocked: false,
    loaded: false,
    errors: [],
  })
  const updates = startUpdates({ periodic: false })
  let store: Store | undefined

  async function attempt(task: () => Promise<unknown>) {
    try {
      await task()
    } catch (error) {
      state.errors.push(asError(error))
    }
  }

  async function save(patch: Partial<Settings>) {
    state.settings = normalizeSettings({ ...state.settings, ...patch })
    if (!store) return
    const values = Object.fromEntries(Object.keys(patch).map((key) => [key, state.settings[key as keyof Settings]]))
    await attempt(() => writeSettings(store!, values))
  }

  async function loadForge() {
    const token = await secretGet(FORGE_TOKEN_KEY)
    if (!token) return
    await attempt(async () => {
      state.forgeOrgs = await listForgeOrganizations(token, httpFetch)
      if (!state.settings.forgeOrg && state.forgeOrgs.length === 1) await save({ forgeOrg: state.forgeOrgs[0].slug })
    })
    if (state.settings.forgeOrg) {
      await attempt(async () => {
        state.forgeServers = await listForgeServers(token, state.settings.forgeOrg, httpFetch)
      })
    }
  }

  async function saveToken(key: string, value: string) {
    if (!value.trim()) return
    await attempt(async () => {
      await secretSet(key, value.trim())
      state.tokens[key] = true
      await announceSettingsChanged()
      if (key === FORGE_TOKEN_KEY) await loadForge()
    })
  }

  async function forgetToken(key: string) {
    await attempt(async () => {
      await secretDelete(key)
      state.tokens[key] = false
      await announceSettingsChanged()
    })
  }

  async function chooseForgeOrg(slug: string) {
    state.forgeServers = []
    await save({ forgeOrg: slug, forgeServers: [] })
    await loadForge()
  }

  async function refreshHookStatus() {
    await attempt(async () => {
      const { status, blocked } = await readHookStatus()
      state.hooks = status
      state.hooksBlocked = blocked
    })
  }

  async function refreshCodexHooks() {
    await attempt(async () => {
      state.codexHooks = await readCodexHookStatus()
    })
  }

  async function updateCodexHooks(install: boolean) {
    await attempt(async () => {
      state.backup = (await changeCodexHooks(install)) ?? undefined
    })
    await refreshCodexHooks()
  }

  async function changeHooks(install: boolean) {
    await attempt(async () => {
      state.backup = (await (install ? installHooks() : uninstallHooks())) ?? undefined
      await announceSettingsChanged()
    })
    await refreshHookStatus()
  }

  async function changeLaunchAtLogin(enabled: boolean) {
    await attempt(async () => {
      await setLaunchAtLogin(enabled)
      state.launchAtLogin = await launchAtLogin()
    })
  }

  async function loadOrganizations() {
    state.errors = state.errors.filter((error) => !SIGN_IN_ERRORS.includes(error.kind))
    await attempt(async () => {
      state.organizations = await fetchOrganizations(await githubToken())
    })
  }

  async function load(options = { organizations: true }) {
    await attempt(async () => {
      store = await openSettingsStore()
      state.settings = await readSettings(store)
      state.loaded = true
      await onSettingsChanged(async () => {
        state.settings = await readSettings(store!)
      })
    })
    await attempt(async () => {
      for (const key of [FORGE_TOKEN_KEY, SENTRY_TOKEN_KEY]) state.tokens[key] = (await secretGet(key)) !== null
    })
    if (options.organizations) {
      await loadOrganizations()
      await onAccountChanged(() => void loadOrganizations())
    }
    await attempt(async () => {
      state.launchAtLogin = await launchAtLogin()
    })
    await attempt(async () => {
      const counts = await (await loadStore(REPOS_FILE, { defaults: {}, autoSave: false })).get<Record<string, unknown>>('counts')
      state.knownRepos = Object.fromEntries(Object.entries(counts ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
    })
    await refreshHookStatus()
    await refreshCodexHooks()
    await loadForge()
  }

  return {
    state,
    updates,
    attempt,
    save,
    saveToken,
    forgetToken,
    chooseForgeOrg,
    changeHooks,
    updateCodexHooks,
    changeLaunchAtLogin,
    openTemplates: () => attempt(openTemplates),
    dismissError: (index: number) => state.errors.splice(index, 1),
    load,
  }
}

export type SettingsContext = ReturnType<typeof createSettingsContext>

const KEY: InjectionKey<SettingsContext> = Symbol('settings')

export const provideSettings = (context: SettingsContext) => provide(KEY, context)

export function useSettings(): SettingsContext {
  const context = inject(KEY)
  if (!context) throw new Error('useSettings() needs provideSettings() in a parent component')
  return context
}

export const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

export const toggleIn = (list: string[], value: string, on: boolean): string[] =>
  on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value)
