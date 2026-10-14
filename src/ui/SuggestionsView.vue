<script setup lang="ts">
import { reactive } from 'vue'
import { ago } from '../core/format'
import type { Suggestion, SuggestionAction } from '../core/suggestions'
import Banner from './components/Banner.vue'
import Mark from './components/Mark.vue'
import type { SuggestionsState } from './suggestions-runtime'

defineProps<{
  state: SuggestionsState
  now: Date
  run: (card: Suggestion, action: SuggestionAction) => void
  dismiss: (card: Suggestion) => void
  setFolder: (cardId: string, repo: string, path: string) => void
}>()

const folderInput = reactive<Record<string, string>>({})

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
      <article v-for="card in state.cards" :key="card.id" class="card">
        <header>
          <span class="status" :class="card.severity" />
          <span class="title">{{ card.title }}</span>
          <span class="age num">{{ ago(card.at, now) }}</span>
          <button class="icon-button close" title="Hide" @click="dismiss(card)">×</button>
        </header>
        <p v-if="card.detail" class="detail">{{ card.detail }}</p>

        <div class="actions">
          <button
            v-for="(action, i) in card.actions"
            :key="i"
            class="button"
            :class="{ primary: i === 0 }"
            :data-row="i === 0 ? '' : undefined"
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

        <form
          v-if="state.needsFolder[card.id]"
          class="folder"
          @submit.prevent="setFolder(card.id, state.needsFolder[card.id], folderInput[card.id] ?? '')"
        >
          <label>
            Where is {{ state.needsFolder[card.id] }} on this Mac?
            <input v-model="folderInput[card.id]" class="text-input" type="text" placeholder="/Users/you/code/repo" />
          </label>
          <button class="button" type="submit">Save</button>
        </form>

        <Banner v-if="state.errors[card.id]" tone="error" :error="state.errors[card.id]" class="card-banner" />
        <pre v-if="state.summaries[card.id]" class="summary selectable">{{ state.summaries[card.id].text }}</pre>
      </article>

      <div v-if="state.cards.length === 0" class="empty">
        <Mark :size="32" tone="muted" />
        <span>No suggestions right now.</span>
      </div>
    </div>
    <footer class="footer num">
      {{ state.clicksThisWeek }} suggestion{{ state.clicksThisWeek === 1 ? '' : 's' }} acted on in the last 7 days
    </footer>
  </div>
</template>

<style scoped>
.suggestions {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.card {
  margin-bottom: 8px;
  padding: 9px 10px 10px;
  border-radius: 8px;
  background: var(--fill);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--blue);
}

.status.attention {
  background: var(--orange);
}

.status.critical {
  background: var(--red);
}

.title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.age,
.note,
.footer {
  color: var(--fg-3);
  font-size: 11px;
}

.close {
  width: 18px;
  height: 18px;
  margin: -2px -4px -2px 0;
}

.detail {
  margin: 2px 0 0 15px;
  overflow: hidden;
  color: var(--fg-2);
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 9px 0 0 15px;
}

.note {
  margin: 5px 0 0 15px;
}

.folder {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin: 9px 0 0 15px;
}

.folder label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  color: var(--fg-2);
  font-size: 11.5px;
}

.card-banner {
  margin: 8px 0 0;
}

.summary {
  margin: 9px 0 0;
  padding: 8px 9px;
  border-radius: 6px;
  background: var(--fill);
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  white-space: pre-wrap;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 12px;
  color: var(--fg-3);
  font-size: 12px;
}

.footer {
  padding: 6px 12px;
  border-top: 0.5px solid var(--separator);
}
</style>
