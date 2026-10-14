import { reactive, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { load } from '@tauri-apps/plugin-store'
import type { BoardState } from '../core/board'
import { toAppError, type AppError } from '../core/errors'
import { isOpenable } from '../core/openable'
import { githubRepo } from '../core/repo'
import type { HookEvent } from '../core/sessions'
import type { Settings } from '../core/settings'
import { suggest, type Suggestion, type SuggestionAction } from '../core/suggestions'
import { DEFAULT_TEMPLATES, renderTemplate } from '../core/templates'
import { claudePrint, focusTerminal, gitRepo, launchClaude, openUrl, secretGet, syncTemplates } from '../native'
import { FORGE_TOKEN_KEY, fetchDeploymentLog } from '../sources/forge'
import { notify } from './board-runtime'

const WEEK_MS = 7 * 86_400_000

interface Stored {
  clicks: { rule: string; at: string }[]
  dismissed: string[]
  reminded: string[]
  summaries: Record<string, { text: string; at: string }>
  folders: Record<string, string>
}

export interface SuggestionsState {
  cards: Suggestion[]
  folders: Record<string, string>
  summaries: Record<string, { text: string; at: string }>
  busy: Record<string, boolean>
  needsFolder: Record<string, string>
  errors: Record<string, AppError>
  clicksThisWeek: number
}

const restore = (raw: unknown): Stored => {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Stored>
  return {
    clicks: Array.isArray(value.clicks) ? value.clicks : [],
    dismissed: Array.isArray(value.dismissed) ? value.dismissed : [],
    reminded: Array.isArray(value.reminded) ? value.reminded : [],
    summaries: typeof value.summaries === 'object' && value.summaries ? value.summaries : {},
    folders: typeof value.folders === 'object' && value.folders ? value.folders : {},
  }
}

export function startSuggestions(deps: { board: BoardState; settings: () => Settings; siteHosts: () => string[]; ephemeral?: boolean }) {
  const state = reactive<SuggestionsState>({
    cards: [],
    folders: {},
    summaries: {},
    busy: {},
    needsFolder: {},
    errors: {},
    clicksThisWeek: 0,
  })
  let stored: Stored = restore(undefined)
  let persist: () => Promise<void> = async () => {}
  const triedFolders = new Set<string>()

  const countClicks = () => {
    const since = Date.now() - WEEK_MS
    stored.clicks = stored.clicks.filter((click) => Date.parse(click.at) >= since)
    state.clicksThisWeek = stored.clicks.length
  }

  function recompute() {
    const settings = deps.settings()
    const signals = Object.values(deps.board.lanes).flat().flatMap((section) => section.signals)
    const cards = suggest({ signals, now: new Date(), sentryOrg: settings.sentryOrg, sentryProjectForSite: settings.sentryProjectForSite })
    const ids = new Set(cards.map((card) => card.id))
    stored.dismissed = stored.dismissed.filter((id) => ids.has(id))
    state.cards = cards.filter((card) => !stored.dismissed.includes(card.id))

    const reminders = state.cards.filter((card) => card.remind && !stored.reminded.includes(card.id))
    if (reminders.length > 0 && settings.notifications) {
      void notify(reminders.map((card) => ({ title: card.title, body: card.detail || 'Claude is waiting for you' })))
    }
    stored.reminded = [...stored.reminded.filter((id) => ids.has(id)), ...reminders.map((card) => card.id)]
    void persist()
  }

  async function learnFolder(cwd: string | null | undefined) {
    if (!cwd || triedFolders.has(cwd)) return
    triedFolders.add(cwd)
    const found = await gitRepo(cwd)
    const repo = githubRepo(found?.remote)
    if (found && repo && stored.folders[repo] !== found.root) {
      stored.folders[repo] = found.root
      state.folders = { ...stored.folders }
      await persist()
    }
  }

  async function setFolder(cardId: string, repo: string, path: string) {
    const found = await gitRepo(path.trim())
    const actual = githubRepo(found?.remote)
    if (!found || actual !== repo) {
      state.errors[cardId] = { kind: 'unknown', message: actual ? `That folder is ${actual}, not ${repo}` : 'That folder is not a GitHub repository' }
      return
    }
    delete state.errors[cardId]
    delete state.needsFolder[cardId]
    stored.folders[repo] = found.root
    state.folders = { ...stored.folders }
    await persist()
  }

  async function templates() {
    return syncTemplates(DEFAULT_TEMPLATES)
  }

  async function run(card: Suggestion, action: SuggestionAction) {
    state.busy[card.id] = true
    delete state.errors[card.id]
    try {
      switch (action.kind) {
        case 'open':
          if (!isOpenable(action.url, deps.siteHosts())) throw { kind: 'unknown', message: `Hither does not open ${new URL(action.url).hostname}` }
          await openUrl(action.url)
          break
        case 'focus-terminal':
          await focusTerminal()
          break
        case 'claude': {
          const folder = stored.folders[action.repo]
          if (!folder) {
            state.needsFolder[card.id] = action.repo
            return
          }
          const prompt = renderTemplate((await templates())[action.template], action.vars)
          let attachment: string | undefined
          if (action.log) {
            const token = await secretGet(FORGE_TOKEN_KEY)
            if (!token) throw { kind: 'service-not-configured', service: 'Forge', missing: 'add an API token' }
            attachment = await fetchDeploymentLog(token, deps.settings().forgeOrg, action.log, httpFetch)
          }
          await launchClaude(folder, prompt, attachment)
          break
        }
        case 'summarize': {
          const prompt = renderTemplate((await templates())[action.template], action.vars)
          const text = await claudePrint(stored.folders[action.repo], prompt)
          stored.summaries[card.id] = { text, at: new Date().toISOString() }
          state.summaries = { ...stored.summaries }
          break
        }
      }
      stored.clicks.push({ rule: card.rule, at: new Date().toISOString() })
      countClicks()
      await persist()
    } catch (error) {
      state.errors[card.id] = typeof error === 'string' ? { kind: 'unknown', message: error } : toAppError(error)
    } finally {
      state.busy[card.id] = false
    }
  }

  async function dismiss(card: Suggestion) {
    stored.dismissed.push(card.id)
    state.cards = state.cards.filter((c) => c.id !== card.id)
    await persist()
  }

  async function boot() {
    if (!deps.ephemeral) {
      const store = await load('suggestions.json', { defaults: {}, autoSave: false })
      stored = restore(await store.get('state'))
      persist = async () => {
        await store.set('state', stored)
        await store.save()
      }
    }
    state.folders = { ...stored.folders }
    state.summaries = { ...stored.summaries }
    countClicks()
    await templates()
    await listen<HookEvent>('agent-event', ({ payload }) => void learnFolder(payload.cwd))
    watch(() => deps.board.lanes, recompute, { deep: true, immediate: true })
    setInterval(recompute, 60_000)
  }

  boot().catch((error) => {
    state.errors.boot = toAppError(error)
  })

  return { state, run, dismiss, setFolder }
}
