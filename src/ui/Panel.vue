<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ago } from '../core/format'
import type { Lane } from '../core/types'
import { openSettings } from '../native'
import { startBoard } from './board-runtime'
import { DEMO } from './demo-mode'
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
onMounted(() => (ticker = setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(ticker))

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

const showHookBanner = computed(() => view.tab === 'agents' && board.hooks.status !== undefined && board.hooks.status !== 'installed')
</script>

<template>
  <main class="panel">
    <div class="top">
      <Segmented :items="tabs" :model-value="view.tab" @update:model-value="view.tab = $event as Tab" />
    </div>

    <header class="account">
      <Mark />
      <span v-if="board.state.account" class="name">{{ board.state.account }}</span>
      <span v-else class="muted">Connecting…</span>
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
      <button class="icon-button" title="Settings" @click="openSettings()">⚙︎</button>
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
      :empty="EMPTY[view.tab]"
    />
    <SuggestionsView
      v-else
      :state="suggestions.state"
      :now="now"
      :run="suggestions.run"
      :dismiss="suggestions.dismiss"
      :set-folder="suggestions.setFolder"
    />
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

.account {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px 12px;
  border-bottom: 0.5px solid var(--separator);
}

.name {
  font-size: 12.5px;
  font-weight: 600;
}

.muted {
  color: var(--fg-3);
  font-size: 11.5px;
}

.spacer {
  flex: 1;
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
