import { reactive } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { load } from '@tauri-apps/plugin-store'
import { createBoard, initialBoardState } from '../core/board'
import { errorText, toAppError, type AppError } from '../core/errors'
import type { NotificationSpec } from '../core/notifications'
import { isOpenable } from '../core/openable'
import { SeenStore } from '../core/seen-store'
import { applyHookEvent, pruneSessions, restoreSessions, type HookEvent, type Sessions } from '../core/sessions'
import { DEFAULT_SETTINGS, type Settings } from '../core/settings'
import type { Source } from '../core/types'
import { describe, isLoud, LANE_ORDER, sourceLanes } from '../lanes'
import { ghToken, openUrl, revealPanel, secretGet, setBadge, startHookListener } from '../native'
import { AGENT_SOURCE_ID, claudeCodeSource } from '../sources/claude-code'
import { CI_RECOVERY, githubSource } from '../sources/github'
import { FORGE_TOKEN_KEY, forgeSource } from '../sources/forge'
import { SENTRY_TOKEN_KEY, sentrySource } from '../sources/sentry'
import type { HookStatus } from '../core/claude-settings'
import { hookToken, installHooks, readHookStatus } from './hooks'
import { announceSettingsChanged, onSettingsChanged, openSettingsStore, readSettings } from './settings-store'

const HEARTBEAT_MS = 30_000

async function notify(specs: NotificationSpec[]) {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return
  for (const spec of specs) {
    sendNotification({ title: spec.title, body: spec.body, extra: spec.id ? { id: spec.id, url: spec.url } : { summary: true } })
  }
}

export function startBoard() {
  const state = reactive(initialBoardState())
  let settings: Settings = DEFAULT_SETTINGS
  let board: ReturnType<typeof createBoard> | undefined

  const github = githubSource({ token: ghToken, settings: () => settings })
  const forge = forgeSource({ token: () => secretGet(FORGE_TOKEN_KEY), settings: () => settings, fetchFn: httpFetch })
  const sentry = sentrySource({ token: () => secretGet(SENTRY_TOKEN_KEY), settings: () => settings, fetchFn: httpFetch })
  let sessions: Sessions = {}
  let listenerProblem: AppError | undefined
  let hookNotices: string[] = []
  const hooks = reactive<{ status?: HookStatus; busy: boolean }>({ busy: false })
  let storageNotice: string | undefined
  const agents = claudeCodeSource({ sessions: () => sessions, problem: () => listenerProblem, notices: () => (storageNotice ? [...hookNotices, storageNotice] : hookNotices) })
  const sources = (): Source[] => [
    github,
    agents,
    ...(settings.forgeEnabled ? [forge] : []),
    ...(settings.sentryEnabled ? [sentry] : []),
  ]

  async function checkHooks() {
    try {
      const { status, blocked } = await readHookStatus()
      hooks.status = status
      hookNotices = blocked ? ['allowedHttpHookUrls in ~/.claude/settings.json does not allow Hither'] : []
    } catch (error) {
      hooks.status = undefined
      hookNotices = [errorText(toAppError(error))]
    }
  }

  async function installAgentHooks() {
    hooks.busy = true
    try {
      await installHooks()
      await announceSettingsChanged()
    } catch (error) {
      hookNotices = [errorText(toAppError(error))]
    } finally {
      hooks.busy = false
    }
    await checkHooks()
    await board?.refresh([AGENT_SOURCE_ID])
  }

  const siteHosts = () =>
    Object.values(state.lanes)
      .flat()
      .flatMap((section) => section.signals)
      .filter((signal) => signal.source === 'forge' && signal.url)
      .map((signal) => new URL(signal.url!).hostname)

  async function open(id: string, url: string | undefined) {
    try {
      if (url && isOpenable(url, siteHosts())) await openUrl(url)
      await board?.markSeen([id])
    } catch (error) {
      state.problems = [...state.problems, { source: 'open', lanes: ['incoming', 'outgoing'], error: toAppError(error) }]
    }
  }

  async function boot() {
    const [settingsStore, seenStore, agentStore] = await Promise.all([
      openSettingsStore(),
      load('seen.json', { defaults: {}, autoSave: false }),
      load('agents.json', { defaults: {}, autoSave: false }),
    ])
    settings = await readSettings(settingsStore)
    const seen = new SeenStore(await seenStore.get('state'))
    sessions = pruneSessions(restoreSessions(await agentStore.get('sessions')), new Date())

    try {
      await startHookListener(await hookToken())
    } catch (error) {
      listenerProblem = { kind: 'unknown', message: `Hook listener could not start: ${error instanceof Error ? error.message : String(error)}` }
    }
    await checkHooks()

    board = createBoard(state, {
      sources,
      sourceLanes,
      seen,
      saveSeen: async (snapshot) => {
        await seenStore.set('state', snapshot)
        await seenStore.save()
      },
      notify: (specs) =>
        void notify(specs).catch((error) => {
          state.problems = [...state.problems, { source: 'notifications', lanes: ['incoming', 'outgoing'], error: toAppError(error) }]
        }),
      setBadge: (count) => void setBadge(count),
      settings: () => settings,
      order: LANE_ORDER,
      isLoud,
      describe,
      recovery: CI_RECOVERY,
    })

    await onSettingsChanged(async () => {
      await settingsStore.reload()
      settings = await readSettings(settingsStore)
      await checkHooks()
      void board?.refresh()
    })
    await listen<HookEvent>('agent-event', async ({ payload }) => {
      sessions = applyHookEvent(sessions, payload, new Date())
      void board?.refresh([AGENT_SOURCE_ID])
      try {
        await agentStore.set('sessions', sessions)
        await agentStore.save()
        storageNotice = undefined
      } catch (error) {
        storageNotice = `Could not save agents.json: ${error instanceof Error ? error.message : String(error)}`
      }
    })
    await onAction((event) => {
      const extra = event.notification?.extra ?? {}
      if (typeof extra.id === 'string') void open(extra.id, typeof extra.url === 'string' ? extra.url : undefined)
      else void revealPanel()
    })
    await getCurrentWebviewWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) void board?.refresh()
    })
    window.addEventListener('online', () => void board?.refresh())
    setInterval(() => {
      sessions = pruneSessions(sessions, new Date())
      void board?.refreshIfOlderThan(settings.refreshMinutes * 60_000)
    }, HEARTBEAT_MS)

    await board.refresh()
  }

  boot().catch((error) => {
    state.problems = [{ source: 'startup', lanes: ['incoming', 'outgoing'], error: toAppError(error) }]
  })

  return {
    state,
    hooks,
    installAgentHooks,
    open,
    refresh: () => board?.refresh(),
    markSeen: (ids: string[]) => board?.markSeen(ids),
  }
}
