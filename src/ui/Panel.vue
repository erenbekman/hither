<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { ago } from '../core/format'
import type { Lane } from '../core/types'
import { startBoard } from './board-runtime'
import LaneView from './LaneView.vue'

type Tab = Lane | 'suggestions'

const tabs: { id: Tab; label: string }[] = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'agents', label: 'Agents' },
  { id: 'suggestions', label: 'Suggestions' },
]

const EMPTY: Record<'incoming' | 'outgoing', string> = {
  incoming: 'Nothing waiting on you.',
  outgoing: 'All green.',
}

const view = reactive<{ tab: Tab }>({ tab: 'incoming' })
const board = startBoard()
const now = ref(new Date())
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => (ticker = setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(ticker))

const badge = (tab: Tab) => (tab === 'suggestions' ? 0 : board.state.laneBadges[tab])
</script>

<template>
  <main class="panel">
    <nav class="tabs">
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: view.tab === tab.id }" @click="view.tab = tab.id">
        {{ tab.label }}
        <span v-if="badge(tab.id) > 0" class="badge">{{ badge(tab.id) }}</span>
      </button>
    </nav>

    <header class="bar">
      <span v-if="board.state.account" class="account"><span class="dot" />{{ board.state.account }}</span>
      <span v-else class="muted">Connecting…</span>
      <span class="spacer" />
      <span v-if="board.state.lastRefresh" class="muted">Updated {{ ago(board.state.lastRefresh, now) }}</span>
      <button
        class="icon"
        :class="{ spinning: board.state.refreshing }"
        :title="board.state.refreshing ? 'Refreshing…' : 'Refresh'"
        :disabled="board.state.refreshing"
        @click="board.refresh()"
      >
        ↻
      </button>
    </header>

    <LaneView
      v-if="view.tab === 'incoming' || view.tab === 'outgoing'"
      :key="view.tab"
      :lane="view.tab"
      :state="board.state"
      :open="board.open"
      :mark-seen="board.markSeen"
      :empty="EMPTY[view.tab]"
    />
    <section v-else class="empty">Nothing here yet.</section>
  </main>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 8px;
  border-bottom: 1px solid var(--line);
}

.tabs button {
  flex: 1;
  padding: 4px 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font: inherit;
}

.tabs button.active {
  background: var(--line);
  color: var(--fg);
}

.badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
}

.account {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}

.spacer {
  flex: 1;
}

.muted {
  color: var(--muted);
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  line-height: 1;
}

.icon.spinning {
  color: var(--accent);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon.spinning {
    animation-duration: 2.5s;
  }
}

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}
</style>
