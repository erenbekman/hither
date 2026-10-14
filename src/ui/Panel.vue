<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { toAppError, type AppError } from '../core/errors'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { ghToken } from '../native'
import { fetchViewerLogin } from '../sources/github'
import ErrorRow from './ErrorRow.vue'

type Tab = 'incoming' | 'outgoing' | 'agents' | 'suggestions'

const tabs: { id: Tab; label: string }[] = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'agents', label: 'Agents' },
  { id: 'suggestions', label: 'Suggestions' },
]

const state = reactive<{ tab: Tab; gh: 'checking' | { login: string } | AppError }>({
  tab: 'incoming',
  gh: 'checking',
})

async function checkGh() {
  try {
    state.gh = { login: await fetchViewerLogin(await ghToken()) }
  } catch (error) {
    state.gh = toAppError(error)
  }
}

onMounted(() => {
  checkGh()
  getCurrentWebviewWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) checkGh()
  })
})
</script>

<template>
  <main class="panel">
    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: state.tab === tab.id }"
        @click="state.tab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="state.tab === 'incoming'">
      <div v-if="state.gh === 'checking'" class="row muted">Checking GitHub CLI…</div>
      <div v-else-if="'login' in state.gh" class="row">
        <span class="dot" />Signed in as <strong>{{ state.gh.login }}</strong><span class="muted">via GitHub CLI</span>
      </div>
      <ErrorRow v-else :error="state.gh" />
      <div class="empty">Nothing incoming yet.</div>
    </section>
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

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.muted {
  color: var(--muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok);
}

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}
</style>
