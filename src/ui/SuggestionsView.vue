<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { ago } from '../core/format'
import type { Suggestion, SuggestionAction } from '../core/suggestions'
import ErrorRow from './ErrorRow.vue'
import type { SuggestionsState } from './suggestions-runtime'

defineProps<{
  state: SuggestionsState
  run: (card: Suggestion, action: SuggestionAction) => void
  dismiss: (card: Suggestion) => void
  setFolder: (cardId: string, repo: string, path: string) => void
}>()

const now = ref(new Date())
const folderInput = reactive<Record<string, string>>({})
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => (ticker = setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(ticker))

function label(action: SuggestionAction): string {
  switch (action.kind) {
    case 'claude':
      return 'Open in Claude'
    case 'summarize':
      return 'Summarize'
    case 'focus-terminal':
      return 'Go to terminal'
    case 'open':
      return action.label
  }
}
</script>

<template>
  <div class="suggestions">
    <div class="list">
      <article v-for="card in state.cards" :key="card.id" class="card" :class="card.severity">
        <header>
          <span class="title">{{ card.title }}</span>
          <span class="age">{{ ago(card.at, now) }}</span>
          <button class="close" title="Hide" @click="dismiss(card)">×</button>
        </header>
        <p v-if="card.detail" class="detail">{{ card.detail }}</p>

        <div class="actions">
          <button
            v-for="(action, i) in card.actions"
            :key="i"
            :class="{ primary: i === 0 }"
            :disabled="state.busy[card.id]"
            :title="action.kind === 'summarize' ? 'Sends the pull request to Claude (claude -p, read-only tools)' : undefined"
            @click="run(card, action)"
          >
            {{ state.busy[card.id] && i === 0 && action.kind === 'summarize' ? 'Summarizing…' : label(action) }}
          </button>
        </div>
        <p v-if="card.actions.some((a) => a.kind === 'summarize') && !state.summaries[card.id]" class="note">
          Summarize sends this pull request to Claude.
        </p>

        <form v-if="state.needsFolder[card.id]" class="folder" @submit.prevent="setFolder(card.id, state.needsFolder[card.id], folderInput[card.id] ?? '')">
          <label>
            Where is {{ state.needsFolder[card.id] }} on this Mac?
            <input v-model="folderInput[card.id]" type="text" placeholder="/Users/you/code/repo" />
          </label>
          <button type="submit">Save</button>
        </form>

        <ErrorRow v-if="state.errors[card.id]" :error="state.errors[card.id]" />
        <pre v-if="state.summaries[card.id]" class="summary">{{ state.summaries[card.id].text }}</pre>
      </article>

      <div v-if="state.cards.length === 0" class="empty">No suggestions right now.</div>
    </div>
    <footer class="footer">{{ state.clicksThisWeek }} suggestion{{ state.clicksThisWeek === 1 ? '' : 's' }} acted on in the last 7 days</footer>
  </div>
</template>

<style scoped>
.suggestions {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.card {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
}

.card.attention {
  border-left-color: var(--warn);
}

.card.critical {
  border-left-color: var(--error-fg);
}

header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.title {
  flex: 1;
  font-weight: 600;
}

.age,
.detail,
.note,
.footer {
  color: var(--muted);
}

.age,
.note,
.footer {
  font-size: 11px;
}

.detail {
  margin: 2px 0 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

button {
  font: inherit;
  color: inherit;
}

.close {
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.actions button,
.folder button {
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
}

.actions button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.actions button:disabled {
  opacity: 0.6;
}

.note {
  margin: 4px 0 0;
}

.folder {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.folder label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.folder input {
  font: inherit;
  padding: 3px 6px;
}

.summary {
  margin: 8px 0 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--hover);
  font: inherit;
  white-space: pre-wrap;
  user-select: text;
}

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}

.footer {
  padding: 6px 12px;
  border-top: 1px solid var(--line);
}
</style>
