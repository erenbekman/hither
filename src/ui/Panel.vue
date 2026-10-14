<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { scopeLabel, type LaneId } from '../core/settings'
import type { Lane, Signal } from '../core/types'
import { openSettings, openUrl } from '../native'
import { isQuotaLow, showsQuota } from '../sources/github/account'
import { startBoard } from './board-runtime'
import { DEMO } from './demo-mode'
import Avatar from './components/Avatar.vue'
import Banner from './components/Banner.vue'
import LaneTabs, { type LaneTab } from './components/LaneTabs.vue'
import Mark from './components/Mark.vue'
import LaneView from './LaneView.vue'
import { startSuggestions } from './suggestions-runtime'
import SuggestionsView from './SuggestionsView.vue'
import { startUpdates } from './update-runtime'

type Tab = LaneId

const EMPTY: Record<Lane, string> = {
  incoming: 'Nothing waiting on you.',
  outgoing: 'All green.',
  agents: 'No Claude Code or Codex sessions, and no agent pull requests.',
}

const LABELS: Record<Tab, string> = { incoming: 'Incoming', outgoing: 'Outgoing', agents: 'Agents', suggestions: 'Suggestions' }

const view = reactive<{ tab: Tab }>({ tab: 'incoming' })
const board = startBoard()
const updates = startUpdates({ periodic: true })
const suggestions = startSuggestions({ board: board.state, settings: board.settings, siteHosts: board.siteHosts, ephemeral: DEMO })
const now = ref(new Date())
let ticker: ReturnType<typeof setInterval> | undefined

const signalsIn = (lane: Lane) => board.state.lanes[lane].flatMap((section) => section.signals)

const tabs = computed<LaneTab[]>(() =>
  board.settings().lanes.map((id) =>
    id === 'suggestions'
      ? {
          id,
          label: LABELS[id],
          unseen: suggestions.state.cards.filter((card) => card.severity !== 'info').length,
          total: suggestions.state.cards.length,
        }
      : { id, label: LABELS[id], unseen: board.state.laneBadges[id], total: signalsIn(id).length },
  ),
)
const activeTab = computed<Tab>(() => (tabs.value.some((tab) => tab.id === view.tab) ? view.tab : ((tabs.value[0]?.id as Tab) ?? 'incoming')))
const activeLane = computed<Lane | undefined>(() => (activeTab.value === 'suggestions' ? undefined : activeTab.value))

function moveRow(step: number) {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')]
  if (rows.length === 0) return
  const index = rows.indexOf(document.activeElement as HTMLElement)
  const next = index === -1 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step))
  rows[next].focus()
  rows[next].scrollIntoView({ block: 'nearest' })
}

const search = reactive({ open: false, query: '' })
const searchInput = ref<HTMLInputElement>()

function openSearch(text = '') {
  search.open = true
  search.query += text
  void nextTick(() => searchInput.value?.focus())
}

function closeSearch() {
  search.open = false
  search.query = ''
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (search.query) search.query = ''
    else closeSearch()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveRow(1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    document.querySelector<HTMLElement>('[data-row]')?.click()
  }
}

function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('input, textarea, select')) return
  if (event.metaKey && event.key === 'r') {
    event.preventDefault()
    void board.refresh()
  } else if (event.metaKey && event.key === ',') {
    event.preventDefault()
    void openSettings()
  } else if (event.metaKey && event.key === 'o' && board.state.account) {
    event.preventDefault()
    void openUrl(`https://github.com/${board.state.account}`)
  } else if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    void board.markAllSeen()
  } else if (event.metaKey && event.key === 'f' && activeTab.value !== 'suggestions') {
    event.preventDefault()
    openSearch()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (search.open) closeSearch()
    else void getCurrentWebviewWindow().hide()
  } else if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  } else if (activeTab.value !== 'suggestions' && event.key.length === 1 && event.key !== ' ') {
    event.preventDefault()
    openSearch(event.key)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const ids = tabs.value.map((tab) => tab.id as Tab)
    const index = ids.indexOf(activeTab.value)
    view.tab = ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveRow(event.key === 'ArrowDown' ? 1 : -1)
  }
}

onMounted(() => {
  ticker = setInterval(() => (now.value = new Date()), 30_000)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  clearInterval(ticker)
  window.removeEventListener('keydown', onKey)
})

const compact = (value: number) => (value >= 10_000 ? new Intl.NumberFormat('en', { notation: 'compact' }).format(value) : value.toLocaleString('en'))
const profile = computed(() => board.state.profile)
const quota = computed(() => (showsQuota(board.settings().quotaVisibility, board.state.quota) ? board.state.quota : undefined))
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const status = computed(() => {
  if (quota.value) return `${quota.value.remaining.toLocaleString('en')} API calls left`
  if (board.state.refreshing) return 'Refreshing…'
  return board.state.lastRefresh ? `Updated ${clock(board.state.lastRefresh)}` : ''
})

const laneUnseen = computed(() => (activeLane.value ? signalsIn(activeLane.value).filter((s) => board.state.unseen[s.id]).map((s) => s.id) : []))

const scope = computed(() =>
  activeTab.value === 'incoming' && ((profile.value?.organizations.length ?? 0) > 0 || board.settings().organizations.length > 0)
    ? scopeLabel(board.settings().organizations)
    : undefined,
)

const emptyHint = computed(() => {
  const settings = board.settings()
  if (activeTab.value === 'outgoing' && !settings.forgeEnabled && !settings.sentryEnabled && settings.watchedRepos.length === 0) {
    return 'Failed checks on your pull requests show up here. Connect Forge or Sentry, or watch a branch, for more.'
  }
  if (activeTab.value === 'incoming' && settings.repoListIsAllowList) return 'Only checked repositories are watched.'
  return undefined
})

const showHookBanner = computed(() => activeTab.value === 'agents' && board.hooks.status !== undefined && board.hooks.status !== 'installed')
</script>

<template>
  <main class="panel">
    <header class="profile">
      <button
        class="who"
        :disabled="!board.state.account"
        :title="board.state.account ? `Open ${board.state.account} on GitHub` : undefined"
        @click="openUrl(`https://github.com/${board.state.account}`)"
      >
        <Avatar v-if="board.state.account" :login="board.state.account" :url="profile?.avatar" :size="34" />
        <Mark v-else :size="28" />
        <span class="names">
          <span class="line">
            <span class="name">{{ profile?.name ?? board.state.account ?? 'Hither' }}</span>
            <span v-if="board.state.account" class="login">@{{ board.state.account }}</span>
          </span>
          <span v-if="profile" class="stats num">
            {{ compact(profile.stars) }}{{ profile.starsAreExact ? '' : '+' }} stars · {{ compact(profile.followers) }} followers
          </span>
          <span v-else-if="!board.state.account" class="stats">Connecting…</span>
        </span>
      </button>
      <button
        class="icon-button refresh"
        :class="{ spinning: board.state.refreshing }"
        :title="board.state.refreshing ? 'Refreshing…' : 'Refresh'"
        :aria-label="board.state.refreshing ? 'Refreshing' : 'Refresh'"
        :disabled="board.state.refreshing"
        @click="board.refresh()"
      >
        ↻
      </button>
      <button class="icon-button more" title="More" aria-label="More" aria-haspopup="menu" @click="board.showMoreMenu()">⋯</button>
    </header>

    <div v-if="scope" class="scope">
      <button class="scope-pill" aria-haspopup="menu" @click="board.showScopeMenu()">
        {{ scope }}
        <span class="chevron" aria-hidden="true">▾</span>
      </button>
    </div>

    <LaneTabs v-if="tabs.length > 1" :items="tabs" :model-value="activeTab" @update:model-value="view.tab = $event as Tab" />

    <div v-if="search.open && activeTab !== 'suggestions'" class="search">
      <input
        ref="searchInput"
        v-model="search.query"
        class="text-input"
        type="search"
        placeholder="Filter by title, repo, #number or @person"
        aria-label="Filter"
        @keydown="onSearchKey"
      />
    </div>

    <Banner
      v-if="updates.state.available"
      tone="action"
      :text="`Hither ${updates.state.available.version} is available`"
      :detail="`You have ${updates.state.current}.`"
    >
      <template #action>
        <button class="button primary" :disabled="updates.state.installing" @click="updates.install()">
          {{ updates.state.installing ? 'Installing…' : 'Install and restart' }}
        </button>
      </template>
    </Banner>

    <Banner
      v-if="showHookBanner"
      tone="action"
      :text="board.hooks.status === 'missing' ? 'Claude Code hooks are not installed' : 'Claude Code hooks are out of date'"
      detail="Adds Hither's hooks to ~/.claude/settings.json after a backup; your other hooks stay."
    >
      <template #action>
        <button class="button primary" :disabled="board.hooks.busy" @click="board.installAgentHooks()">
          {{ board.hooks.busy ? 'Installing…' : board.hooks.status === 'missing' ? 'Install' : 'Update' }}
        </button>
      </template>
    </Banner>

    <LaneView
      v-if="activeLane"
      :key="activeLane"
      :lane="activeLane"
      :state="board.state"
      :now="now"
      :open="board.open"
      :show-menu="(signals: Signal[]) => board.showMenu(signals, suggestions.state.folders)"
      :overdue-hours="board.settings().reviewOverdueHours"
      :group-threshold="board.settings().repoGroupThreshold"
      :empty="EMPTY[activeLane]"
      :empty-hint="emptyHint"
      :query="search.open ? search.query : ''"
    />
    <SuggestionsView
      v-else
      :state="suggestions.state"
      :now="now"
      :run="suggestions.run"
      :dismiss="suggestions.dismiss"
      :set-folder="suggestions.setFolder"
    />

    <footer class="footer">
      <button v-if="laneUnseen.length" class="link" @click="board.markSeen(laneUnseen)">Mark these as seen</button>
      <span v-else-if="activeTab === 'suggestions'" class="status num">{{ suggestions.state.clicksThisWeek }} used this week</span>
      <span v-else />
      <span class="status num" :class="{ low: quota && isQuotaLow(quota) }">{{ status }}</span>
    </footer>
  </main>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  border-radius: 12px;
  overflow: hidden;
}

.profile {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 14px 10px 8px 16px;
}

.who {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
}

.names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.name {
  overflow: hidden;
  color: var(--fg);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
}

.login,
.stats {
  overflow: hidden;
  color: var(--fg-3);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.who:not(:disabled):hover .name {
  text-decoration: underline;
}

.refresh,
.more {
  font-size: 17px;
}

.refresh.spinning {
  color: var(--blue);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .refresh.spinning {
    animation-duration: 2.5s;
  }
}

.scope {
  padding: 0 16px 6px;
}

.scope-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border: 0;
  border-radius: 10px;
  background: var(--fill);
  color: var(--fg-2);
  font-size: 11.5px;
}

.scope-pill:hover {
  background: var(--fill-hover);
}

.scope-pill .chevron {
  color: var(--fg-3);
  font-size: 9px;
}

.search {
  display: flex;
  padding: 8px 12px 0;
}

.search .text-input {
  flex: 1;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px 10px;
  border-top: 0.5px solid var(--separator);
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg-2);
  font-size: 12px;
}

.link:hover {
  color: var(--fg);
}

.status {
  color: var(--fg-3);
  font-size: 12px;
}

.status.low {
  color: var(--orange);
}
</style>
