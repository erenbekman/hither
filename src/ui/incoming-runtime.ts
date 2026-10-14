import { reactive } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { load } from '@tauri-apps/plugin-store'
import { toAppError } from '../core/errors'
import { createIncoming, initialIncomingState } from '../core/incoming'
import type { NotificationSpec } from '../core/notifications'
import { SeenStore } from '../core/seen-store'
import { DEFAULT_SETTINGS, type Settings } from '../core/settings'
import { describeSignal, githubSource, KIND_ORDER, QUIET_KINDS } from '../sources/github'
import { ghToken, openUrl, revealPanel, setBadge } from '../native'
import { onSettingsChanged, openSettingsStore, readSettings } from './settings-store'

const HEARTBEAT_MS = 30_000
const PANEL_OPEN_MIN_AGE_MS = 30_000

async function notify(specs: NotificationSpec[]) {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return
  for (const spec of specs) {
    sendNotification({ title: spec.title, body: spec.body, extra: spec.url ? { url: spec.url } : { summary: true } })
  }
}

export function startIncoming() {
  const state = reactive(initialIncomingState())
  let settings: Settings = DEFAULT_SETTINGS
  let incoming: ReturnType<typeof createIncoming> | undefined

  const open = async (url: string) => {
    try {
      await openUrl(url)
      await incoming?.markSeen([url])
    } catch (error) {
      state.errors = [...state.errors, toAppError(error)]
    }
  }

  async function boot() {
    const [settingsStore, seenStore] = await Promise.all([
      openSettingsStore(),
      load('seen.json', { defaults: {}, autoSave: false }),
    ])
    settings = await readSettings(settingsStore)
    const seen = new SeenStore(await seenStore.get('state'))

    incoming = createIncoming(state, {
      source: githubSource({ token: ghToken, settings: () => settings }),
      seen,
      saveSeen: async (snapshot) => {
        await seenStore.set('state', snapshot)
        await seenStore.save()
      },
      notify: (specs) => void notify(specs).catch((error) => (state.errors = [...state.errors, toAppError(error)])),
      setBadge: (count) => void setBadge(count),
      settings: () => settings,
      order: KIND_ORDER,
      quietKinds: QUIET_KINDS,
      describe: describeSignal,
    })

    await onSettingsChanged(async () => {
      await settingsStore.reload()
      settings = await readSettings(settingsStore)
      void incoming?.refresh()
    })
    await onAction((event) => {
      const extra = event.notification?.extra ?? {}
      if (typeof extra.url === 'string') void open(extra.url)
      else void revealPanel()
    })
    await getCurrentWebviewWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) void incoming?.refreshIfOlderThan(PANEL_OPEN_MIN_AGE_MS)
    })
    window.addEventListener('online', () => void incoming?.refresh())
    setInterval(() => void incoming?.refreshIfOlderThan(settings.refreshMinutes * 60_000), HEARTBEAT_MS)

    await incoming.refresh()
  }

  boot().catch((error) => (state.errors = [toAppError(error)]))

  return {
    state,
    open,
    refresh: () => incoming?.refresh(),
    markSeen: (ids: string[]) => incoming?.markSeen(ids),
  }
}
