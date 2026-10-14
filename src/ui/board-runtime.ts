import { reactive, shallowRef, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { Menu } from '@tauri-apps/api/menu'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { isPermissionGranted, onAction, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { load, type Store } from '@tauri-apps/plugin-store'
import { createBoard, initialBoardState, parseSnapshot, type TrayState } from '../core/board'
import { errorText, toAppError, type AppError } from '../core/errors'
import type { NotificationSpec } from '../core/notifications'
import { isOpenable } from '../core/openable'
import { SeenStore } from '../core/seen-store'
import { applyHookEvent, pruneSessions, restoreSessions, type HookEvent, type Sessions } from '../core/sessions'
import { DEFAULT_SETTINGS, isRepoWatched, muteRepo, type LaneId, type Settings } from '../core/settings'
import type { Signal, Source } from '../core/types'
import { describe, isAmbient, isLoud, LANE_ORDER, sourceLanes } from '../lanes'
import { checkoutPullRequest, copyText, focusTerminal, openSettings, openUrl, openWelcome, revealPanel, secretGet, setTray, startHookListener } from '../native'
import { AGENT_SOURCE_ID, claudeCodeSource } from '../sources/claude-code'
import { CI_RECOVERY, githubSource } from '../sources/github'
import { countRepos } from '../sources/github/account'
import { activitySource } from '../sources/github/activity'
import { FORGE_TOKEN_KEY, forgeSource } from '../sources/forge'
import { SENTRY_TOKEN_KEY, sentrySource } from '../sources/sentry'
import type { HookStatus } from '../core/claude-settings'
import { githubToken } from './github-auth'
import { hookToken, installHooks, readHookStatus } from './hooks'
import { announceSettingsChanged, onSettingsChanged, openSettingsStore, readSettings, REPOS_FILE, writeSettings } from './settings-store'

const HEARTBEAT_MS = 30_000
const OPEN_REFRESH_MS = 30_000
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

  const github = githubSource({ token: githubToken, settings: () => current.value })
  const forge = forgeSource({ token: () => secretGet(FORGE_TOKEN_KEY), settings: () => current.value, fetchFn: httpFetch })
  const sentry = sentrySource({ token: () => secretGet(SENTRY_TOKEN_KEY), settings: () => current.value, fetchFn: httpFetch })
  let sessions: Sessions = {}
  let listenerProblem: AppError | undefined
  let hookNotices: string[] = []
  const hooks = reactive<{ status?: HookStatus; busy: boolean }>({ busy: false })
  let storageNotice: string | undefined
  const agents = claudeCodeSource({ sessions: () => sessions, problem: () => listenerProblem, notices: () => (storageNotice ? [...hookNotices, storageNotice] : hookNotices) })
  const activity = activitySource({ token: githubToken })
  const sources = (): Source[] => {
    const settings = current.value
    const on = (lane: LaneId) => settings.lanes.includes(lane)
    return [
      ...(on('incoming') || on('outgoing') || on('agents') ? [github] : []),
      ...(on('incoming') && !settings.hiddenKinds.includes('activity') ? [activity] : []),
      ...(on('agents') ? [agents] : []),
      ...(on('outgoing') && settings.forgeEnabled ? [forge] : []),
      ...(on('outgoing') && settings.sentryEnabled ? [sentry] : []),
    ]
  }

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

  let shownTray = ''
  function showTray(count: number, tray: TrayState) {
    const key = `${count}:${tray}`
    if (key === shownTray) return
    shownTray = key
    void setTray(count, tray).catch((error) => report('menu bar', error))
  }

  function report(source: string, error: unknown) {
    state.problems = [...state.problems, { source, lanes: ['incoming', 'outgoing', 'agents'], error: toAppError(error) }]
  }

  async function open(id: string, url: string | undefined) {
    try {
      const signal = Object.values(state.lanes)
        .flat()
        .flatMap((section) => section.signals)
        .find((s) => s.id === id)
      if (signal?.source === AGENT_SOURCE_ID) {
        const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
        await focusTerminal(text(signal.meta?.terminal) ?? current.value.terminal, text(signal.meta?.terminalSession), text(signal.meta?.cwd))
      } else if (url && isOpenable(url, siteHosts())) await openUrl(url)
      await board?.markSeen([id])
    } catch (error) {
      report('open', error)
    }
  }

  async function saveSettings(patch: Partial<Settings>) {
    current.value = { ...current.value, ...patch }
    if (settingsStore) await writeSettings(settingsStore, patch)
    else await board?.refresh()
  }

  const mute = (repo: string) => saveSettings(muteRepo(current.value, repo))

  async function showScopeMenu() {
    const selected = current.value.organizations
    const known = [...new Set([...(state.profile?.organizations ?? []), ...selected])].sort()
    const choose = (organizations: string[]) => () => void saveSettings({ organizations }).catch((error) => report('menu', error))
    const menu = await Menu.new({
      items: [
        { text: 'Your repositories', checked: selected.length === 0, action: choose([]) },
        { item: 'Separator' as const },
        { text: 'Assigned to you in', enabled: false },
        ...known.map((org) => ({
          text: org,
          checked: selected.includes(org),
          action: choose(selected.includes(org) ? selected.filter((entry) => entry !== org) : [...selected, org]),
        })),
      ],
    })
    await popup(menu)
  }

  let openMenu: Menu | undefined
  const run = (task: () => Promise<unknown> | undefined) => () => void Promise.resolve(task()).catch((error) => report('menu', error))

  async function popup(menu: Menu) {
    void openMenu?.close()
    openMenu = menu
    await menu.popup()
  }

  async function showMoreMenu() {
    const account = state.account
    await popup(
      await Menu.new({
        items: [
          { text: 'Open GitHub', accelerator: 'CmdOrCtrl+O', enabled: !!account, action: run(() => openUrl(`https://github.com/${account}`)) },
          { text: 'Settings…', accelerator: 'CmdOrCtrl+,', action: run(() => openSettings()) },
          { item: 'Separator' as const },
          { text: 'Mark All as Seen', accelerator: 'Shift+CmdOrCtrl+A', action: run(() => board?.markAllSeen()) },
          { item: 'Separator' as const },
          { item: 'Quit' as const, text: 'Quit Hither' },
        ],
      }),
    )
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
    await popup(menu)
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
        setTray: showTray,
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
    const [store, seenStore, agentStore, reposStore, boardStore] = await Promise.all([
      openSettingsStore(),
      load('seen.json', { defaults: {}, autoSave: false }),
      load('agents.json', { defaults: {}, autoSave: false }),
      load(REPOS_FILE, { defaults: {}, autoSave: false }),
      load('board.json', { defaults: {}, autoSave: false }),
    ])
    settingsStore = store
    current.value = await readSettings(store)
    if (!current.value.onboarded) void openWelcome().catch((error) => report('welcome', error))
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
      setTray: showTray,
      settings: () => current.value,
      order: LANE_ORDER,
      isLoud,
      ambient: isAmbient,
      describe,
      recovery: CI_RECOVERY,
    })

    const saved = parseSnapshot(await boardStore.get('snapshot'))
    if (saved) board.restore(saved)
    watch(
      () => state.lastRefresh,
      () =>
        void (async () => {
          await boardStore.set('snapshot', board!.snapshot())
          await boardStore.save()
        })().catch((error) => report('storage', error)),
    )

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
      if (focused) void board?.refreshIfOlderThan(OPEN_REFRESH_MS)
    })
    await listen('mark-all-seen', () => void board?.markAllSeen())
    window.addEventListener('online', () => void board?.refresh())
    let lastBeat = Date.now()
    setInterval(() => {
      const woke = Date.now() - lastBeat > 2 * HEARTBEAT_MS
      lastBeat = Date.now()
      sessions = pruneSessions(sessions, new Date())
      void (woke ? board?.refresh() : board?.refreshIfOlderThan(current.value.refreshMinutes * 60_000))
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
    showScopeMenu: () => void showScopeMenu().catch((error) => report('menu', error)),
    showMoreMenu: () => void showMoreMenu().catch((error) => report('menu', error)),
    refresh: () => board?.refresh(),
    markSeen: (ids: string[]) => board?.markSeen(ids),
    markAllSeen: () => board?.markAllSeen(),
  }
}
