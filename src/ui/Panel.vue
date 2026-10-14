<script setup lang="ts">
import { reactive } from 'vue'
import IncomingLane from './IncomingLane.vue'
import { startIncoming } from './incoming-runtime'

type Tab = 'incoming' | 'outgoing' | 'agents' | 'suggestions'

const tabs: { id: Tab; label: string }[] = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'agents', label: 'Agents' },
  { id: 'suggestions', label: 'Suggestions' },
]

const view = reactive<{ tab: Tab }>({ tab: 'incoming' })
const incoming = startIncoming()
</script>

<template>
  <main class="panel">
    <nav class="tabs">
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: view.tab === tab.id }" @click="view.tab = tab.id">
        {{ tab.label }}
        <span v-if="tab.id === 'incoming' && incoming.state.badge > 0" class="badge">{{ incoming.state.badge }}</span>
      </button>
    </nav>

    <IncomingLane
      v-if="view.tab === 'incoming'"
      :state="incoming.state"
      :open="incoming.open"
      :refresh="incoming.refresh"
      :mark-seen="incoming.markSeen"
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

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}
</style>
