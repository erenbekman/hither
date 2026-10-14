import { reactive } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { load } from '@tauri-apps/plugin-store'
import { createBoard, initialBoardState } from '../core/board'
import { toAppError } from '../core/errors'
import type { NotificationSpec } from '../core/notifications'
import { isOpenable } from '../core/openable'
import { SeenStore } from '../core/seen-store'
import { DEFAULT_SETTINGS, type Settings } from '../core/settings'
import type { Source } from '../core/types'
import { describe, isLoud, LANE_ORDER, sourceLanes } from '../lanes'
import { ghToken, openUrl, revealPanel, secretGet, setBadge } from '../native'
import { CI_RECOVERY, githubSource } from '../sources/github'
import { FORGE_TOKEN_KEY, forgeSource } from '../sources/forge'
import { SENTRY_TOKEN_KEY, sentrySource } from '../sources/sentry'
import { onSettingsChanged, openSettingsStore, readSettings } from './settings-store'

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
  const sources = (): Source[] => [github, ...(settings.forgeEnabled ? [forge] : []), ...(settings.sentryEnabled ? [sentry] : [])]

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
    const [settingsStore, seenStore] = await Promise.all([openSettingsStore(), load('seen.json', { defaults: {}, autoSave: false })])
    settings = await readSettings(settingsStore)
    const seen = new SeenStore(await seenStore.get('state'))

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
      void board?.refresh()
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
    setInterval(() => void board?.refreshIfOlderThan(settings.refreshMinutes * 60_000), HEARTBEAT_MS)

    await board.refresh()
  }

  boot().catch((error) => {
    state.problems = [{ source: 'startup', lanes: ['incoming', 'outgoing'], error: toAppError(error) }]
  })

  return {
    state,
    open,
    refresh: () => board?.refresh(),
    markSeen: (ids: string[]) => board?.markSeen(ids),
  }
}
