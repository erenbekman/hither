<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { ago } from '../core/format'
import type { Lane, Signal } from '../core/types'
import { openSettings, openUrl } from '../native'
import { isQuotaLow, showsQuota } from '../sources/github/account'
import { startBoard } from './board-runtime'
import { DEMO } from './demo-mode'
import Avatar from './components/Avatar.vue'
import Banner from './components/Banner.vue'
import Mark from './components/Mark.vue'
import Segmented, { type SegmentItem } from './components/Segmented.vue'
import LaneView from './LaneView.vue'
import { startSuggestions } from './suggestions-runtime'
import SuggestionsView from './SuggestionsView.vue'
import { startUpdates } from './update-runtime'

type Tab = Lane | 'suggestions'

const EMPTY: Record<Lane, string> = {
  incoming: 'Nothing waiting on you.',
  outgoing: 'All green.',
  agents: 'No Claude Code sessions or agent pull requests.',
}

const view = reactive<{ tab: Tab }>({ tab: 'incoming' })
const board = startBoard()
const updates = startUpdates({ periodic: true })
const suggestions = startSuggestions({ board: board.state, settings: board.settings, siteHosts: board.siteHosts, ephemeral: DEMO })
const now = ref(new Date())
let ticker: ReturnType<typeof setInterval> | undefined

const TAB_ORDER: Tab[] = ['incoming', 'outgoing', 'agents', 'suggestions']

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
  } else if (event.metaKey && event.key === 'f' && view.tab !== 'suggestions') {
    event.preventDefault()
    openSearch()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (search.open) closeSearch()
    else void getCurrentWebviewWindow().hide()
  } else if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  } else if (view.tab !== 'suggestions' && event.key.length === 1 && event.key !== ' ') {
    event.preventDefault()
    openSearch(event.key)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const index = TAB_ORDER.indexOf(view.tab)
    view.tab = TAB_ORDER[(index + (event.key === 'ArrowRight' ? 1 : TAB_ORDER.length - 1)) % TAB_ORDER.length]
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

const laneCritical = (lane: Lane) =>
  board.state.lanes[lane].some((section) => section.signals.some((s) => s.severity === 'critical' && board.state.unseen[s.id]))

const tabs = computed<SegmentItem[]>(() => [
  { id: 'incoming', label: 'Incoming', badge: board.state.laneBadges.incoming, critical: laneCritical('incoming') },
  { id: 'outgoing', label: 'Outgoing', badge: board.state.laneBadges.outgoing, critical: laneCritical('outgoing') },
  { id: 'agents', label: 'Agents', badge: board.state.laneBadges.agents, critical: laneCritical('agents') },
  {
    id: 'suggestions',
    label: 'Suggestions',
    badge: suggestions.state.cards.filter((c) => c.severity !== 'info').length,
    critical: suggestions.state.cards.some((c) => c.severity === 'critical'),
  },
])

const compact = new Intl.NumberFormat('en', { notation: 'compact' })
const profile = computed(() => board.state.profile)
const quota = computed(() => (showsQuota(board.settings().quotaVisibility, board.state.quota) ? board.state.quota : undefined))
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const emptyHint = computed(() => {
  const settings = board.settings()
  if (view.tab === 'outgoing' && !settings.forgeEnabled && !settings.sentryEnabled && settings.watchedRepos.length === 0) {
    return 'Failed checks on your pull requests show up here. Connect Forge or Sentry, or watch a branch, for more.'
  }
  if (view.tab === 'incoming' && settings.repoListIsAllowList) return 'Only checked repositories are watched.'
  return undefined
})

const showHookBanner = computed(() => view.tab === 'agents' && board.hooks.status !== undefined && board.hooks.status !== 'installed')
</script>

<template>
  <main class="panel">
    <div class="top">
      <Segmented :items="tabs" :model-value="view.tab" @update:model-value="view.tab = $event as Tab" />
      <div v-if="search.open && view.tab !== 'suggestions'" class="search">
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
    </div>

    <header class="account">
      <template v-if="board.state.account">
        <Avatar :login="board.state.account" :url="profile?.avatar" :size="18" />
        <button class="name" :title="`Open ${board.state.account} on GitHub`" @click="openUrl(`https://github.com/${board.state.account}`)">
          {{ board.state.account }}
        </button>
        <span
          v-if="profile"
          class="muted num"
          :title="`${profile.stars}${profile.starsAreExact ? '' : '+'} stars on your public repositories, ${profile.followers} followers`"
        >
          ★ {{ compact.format(profile.stars) }}{{ profile.starsAreExact ? '' : '+' }} · {{ compact.format(profile.followers) }} followers
        </span>
      </template>
      <template v-else>
        <Mark />
        <span class="muted">Connecting…</span>
      </template>
      <span v-if="board.state.lastRefresh" class="muted num">· {{ ago(board.state.lastRefresh, now) }}</span>
      <span class="spacer" />
      <button
        class="icon-button refresh"
        :class="{ spinning: board.state.refreshing }"
        :title="board.state.refreshing ? 'Refreshing…' : 'Refresh'"
        :disabled="board.state.refreshing"
        @click="board.refresh()"
      >
        ↻
      </button>
      <button class="icon-button" title="Settings" aria-label="Settings" @click="openSettings()">
        <svg class="gear" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 6.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4" /></svg>
      </button>
    </header>

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
      v-if="view.tab !== 'suggestions'"
      :key="view.tab"
      :lane="view.tab"
      :state="board.state"
      :now="now"
      :open="board.open"
      :mark-seen="board.markSeen"
      :show-menu="(signals: Signal[]) => board.showMenu(signals, suggestions.state.folders)"
      :overdue-hours="board.settings().reviewOverdueHours"
      :empty="EMPTY[view.tab]"
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

    <footer v-if="quota" class="quota num" :class="{ low: isQuotaLow(quota) }">
      GitHub API: {{ quota.remaining.toLocaleString('en') }} of {{ quota.limit.toLocaleString('en') }} left · resets {{ clock(quota.resetAt) }}
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

.top {
  padding: 8px 8px 4px;
}

.search {
  display: flex;
  margin-top: 6px;
}

.search .text-input {
  flex: 1;
}

.account {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px 12px;
  border-bottom: 0.5px solid var(--separator);
}

.name {
  overflow: hidden;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.name:hover {
  text-decoration: underline;
}

.quota {
  padding: 5px 12px 6px;
  border-top: 0.5px solid var(--separator);
  color: var(--fg-3);
  font-size: 11px;
}

.quota.low {
  color: var(--orange);
}

.muted {
  color: var(--fg-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.gear {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}

.refresh {
  font-size: 16px;
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
</style>
