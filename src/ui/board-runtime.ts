import { reactive, shallowRef, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { Menu } from '@tauri-apps/api/menu'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { load, type Store } from '@tauri-apps/plugin-store'
import { createBoard, initialBoardState } from '../core/board'
import { errorText, toAppError, type AppError } from '../core/errors'
import type { NotificationSpec } from '../core/notifications'
import { isOpenable } from '../core/openable'
import { SeenStore } from '../core/seen-store'
import { applyHookEvent, pruneSessions, restoreSessions, type HookEvent, type Sessions } from '../core/sessions'
import { DEFAULT_SETTINGS, isRepoWatched, muteRepo, type Settings } from '../core/settings'
import type { Signal, Source } from '../core/types'
import { describe, isAmbient, isLoud, LANE_ORDER, sourceLanes } from '../lanes'
import { checkoutPullRequest, copyText, focusTerminal, ghToken, openUrl, revealPanel, secretGet, setBadge, startHookListener } from '../native'
import { AGENT_SOURCE_ID, claudeCodeSource } from '../sources/claude-code'
import { CI_RECOVERY, githubSource } from '../sources/github'
import { countRepos } from '../sources/github/account'
import { FORGE_TOKEN_KEY, forgeSource } from '../sources/forge'
import { SENTRY_TOKEN_KEY, sentrySource } from '../sources/sentry'
import type { HookStatus } from '../core/claude-settings'
import { hookToken, installHooks, readHookStatus } from './hooks'
import { announceSettingsChanged, onSettingsChanged, openSettingsStore, readSettings, REPOS_FILE, writeSettings } from './settings-store'

const HEARTBEAT_MS = 30_000
const SNOOZE_MS = 86_400_000

export async function notify(specs: NotificationSpec[]) {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return
  for (const spec of specs) {
    sendNotification({ title: spec.title, body: spec.body, extra: spec.id ? { id: spec.id, url: spec.url } : { summary: true } })
  }
}

export function startBoard() {
  const state = reactive(initialBoardState())
  const current = shallowRef<Settings>(DEFAULT_SETTINGS)
  let settingsStore: Store | undefined
  let board: ReturnType<typeof createBoard> | undefined

  const github = githubSource({ token: ghToken, settings: () => current.value })
  const forge = forgeSource({ token: () => secretGet(FORGE_TOKEN_KEY), settings: () => current.value, fetchFn: httpFetch })
  const sentry = sentrySource({ token: () => secretGet(SENTRY_TOKEN_KEY), settings: () => current.value, fetchFn: httpFetch })
  let sessions: Sessions = {}
  let listenerProblem: AppError | undefined
  let hookNotices: string[] = []
  const hooks = reactive<{ status?: HookStatus; busy: boolean }>({ busy: false })
  let storageNotice: string | undefined
  const agents = claudeCodeSource({ sessions: () => sessions, problem: () => listenerProblem, notices: () => (storageNotice ? [...hookNotices, storageNotice] : hookNotices) })
  const sources = (): Source[] => [
    github,
    agents,
    ...(current.value.forgeEnabled ? [forge] : []),
    ...(current.value.sentryEnabled ? [sentry] : []),
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

  function report(source: string, error: unknown) {
    state.problems = [...state.problems, { source, lanes: ['incoming', 'outgoing', 'agents'], error: toAppError(error) }]
  }

  async function open(id: string, url: string | undefined) {
    try {
      const signal = Object.values(state.lanes)
        .flat()
        .flatMap((section) => section.signals)
        .find((s) => s.id === id)
      if (signal?.source === AGENT_SOURCE_ID) await focusTerminal(typeof signal.meta?.terminal === 'string' ? signal.meta.terminal : current.value.terminal)
      else if (url && isOpenable(url, siteHosts())) await openUrl(url)
      await board?.markSeen([id])
    } catch (error) {
      report('open', error)
    }
  }

  async function mute(repo: string) {
    const patch = muteRepo(current.value, repo)
    current.value = { ...current.value, ...patch }
    if (settingsStore) await writeSettings(settingsStore, patch)
    else await board?.refresh()
  }

  async function showMenu(targets: Signal[], folders: Record<string, string>) {
    const [first] = targets
    if (!first) return
    const single = targets.length === 1 ? first : undefined
    const branch = typeof single?.meta?.branch === 'string' ? single.meta.branch : undefined
    const number = single?.source === 'github' && single.meta?.type !== 'issue' && typeof single.meta?.number === 'number' ? single.meta.number : undefined
    const folder = number !== undefined ? folders[first.project] : undefined
    const terminal = current.value.terminal
    const repo =
      targets.every((s) => s.source === 'github' && s.project === first.project) && isRepoWatched(current.value, first.project) ? first.project : undefined
    const run = (task: () => Promise<unknown> | undefined) => () => void Promise.resolve(task()).catch((error) => report('menu', error))
    const separator = { item: 'Separator' as const }
    const copies = [
      ...(single?.url ? [{ text: 'Copy Link', action: run(() => copyText(single.url!)) }] : []),
      ...(branch ? [{ text: 'Copy Branch', action: run(() => copyText(branch)) }] : []),
    ]
    const checkout =
      number === undefined
        ? []
        : folder
          ? [{ text: `Checkout in ${terminal}`, action: run(() => checkoutPullRequest(folder, number, terminal)) }]
          : [{ text: `Checkout in ${terminal} (folder of ${first.project} unknown)`, enabled: false }]
    const menu = await Menu.new({
      items: [
        ...copies,
        ...(copies.length > 0 ? [separator] : []),
        ...checkout,
        ...(checkout.length > 0 ? [separator] : []),
        {
          text: single ? 'Snooze for a Day' : `Snooze ${targets.length} Items for a Day`,
          action: run(() => board?.snooze(targets.map((s) => s.id), new Date(Date.now() + SNOOZE_MS))),
        },
        ...(repo ? [{ text: `Mute ${repo}`, action: run(() => mute(repo)) }] : []),
      ],
    })
    await menu.popup()
  }

  async function boot() {
    if (import.meta.env.DEV && import.meta.env.VITE_HITHER_DEMO === '1') {
      const demo = await import('../demo')
      current.value = demo.DEMO_SETTINGS
      hooks.status = 'installed'
      board = createBoard(state, {
        sources: demo.demoSources,
        sourceLanes,
        seen: new SeenStore(),
        saveSeen: async () => {},
        notify: () => {},
        setBadge: (count) => void setBadge(count),
        settings: () => current.value,
        order: LANE_ORDER,
        isLoud,
        ambient: isAmbient,
        describe,
        recovery: CI_RECOVERY,
      })
      await board.refresh()
      return
    }
    const [store, seenStore, agentStore, reposStore] = await Promise.all([
      openSettingsStore(),
      load('seen.json', { defaults: {}, autoSave: false }),
      load('agents.json', { defaults: {}, autoSave: false }),
      load(REPOS_FILE, { defaults: {}, autoSave: false }),
    ])
    settingsStore = store
    current.value = await readSettings(store)
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
      settings: () => current.value,
      order: LANE_ORDER,
      isLoud,
      ambient: isAmbient,
      describe,
      recovery: CI_RECOVERY,
    })

    let known = { account: await reposStore.get<string>('account'), counts: (await reposStore.get<Record<string, number>>('counts')) ?? {} }
    watch(
      () => state.lanes,
      (lanes) => {
        if (!state.account) return
        const signals = Object.values(lanes).flat().flatMap((section) => section.signals)
        const counts = countRepos(known.account === state.account ? known.counts : {}, signals)
        if (known.account === state.account && JSON.stringify(counts) === JSON.stringify(known.counts)) return
        known = { account: state.account, counts }
        void (async () => {
          await reposStore.set('account', known.account)
          await reposStore.set('counts', known.counts)
          await reposStore.save()
        })().catch((error) => report('storage', error))
      },
    )

    await onSettingsChanged(async () => {
      current.value = await readSettings(store)
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
      void board?.refreshIfOlderThan(current.value.refreshMinutes * 60_000)
    }, HEARTBEAT_MS)

    await board.refresh()
  }

  boot().catch((error) => {
    state.problems = [{ source: 'startup', lanes: ['incoming', 'outgoing'], error: toAppError(error) }]
  })

  return {
    state,
    settings: () => current.value,
    siteHosts,
    hooks,
    installAgentHooks,
    open,
    showMenu: (targets: Signal[], folders: Record<string, string>) => void showMenu(targets, folders).catch((error) => report('menu', error)),
    refresh: () => board?.refresh(),
    markSeen: (ids: string[]) => board?.markSeen(ids),
  }
}
