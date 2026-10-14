<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import type { Store } from '@tauri-apps/plugin-store'
import { toAppError, type AppError } from '../core/errors'
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../core/settings'
import { fetchOrganizations, KIND_ORDER, KIND_TITLES } from '../sources/github'
import { ghToken } from '../native'
import ErrorRow from './ErrorRow.vue'
import { openSettingsStore, readSettings, writeSettings } from './settings-store'

const state = reactive<{
  settings: Settings
  organizations: string[]
  loaded: boolean
  saved: boolean
  errors: AppError[]
}>({ settings: { ...DEFAULT_SETTINGS }, organizations: [], loaded: false, saved: false, errors: [] })

let store: Store | undefined

const lines = (text: string) => text.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)

const accounts = computed({
  get: () => state.settings.accounts.join(', '),
  set: (text: string) => (state.settings.accounts = lines(text)),
})
const repoList = computed({
  get: () => state.settings.repoList.join('\n'),
  set: (text: string) => (state.settings.repoList = lines(text)),
})
const allOrganizations = computed(() => [...new Set([...state.organizations, ...state.settings.organizations])])

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value)
}

onMounted(async () => {
  try {
    store = await openSettingsStore()
    state.settings = await readSettings(store)
    state.loaded = true
  } catch (error) {
    state.errors.push(toAppError(error))
  }
  try {
    state.organizations = await fetchOrganizations(await ghToken())
  } catch (error) {
    state.errors.push(toAppError(error))
  }
})

async function save() {
  if (!store) return
  try {
    state.settings = normalizeSettings({ ...state.settings })
    await writeSettings(store, state.settings)
    state.saved = true
    setTimeout(() => (state.saved = false), 1500)
  } catch (error) {
    state.errors.push(toAppError(error))
  }
}
</script>

<template>
  <main class="settings">
    <ErrorRow v-for="(error, i) in state.errors" :key="i" :error="error" />

    <fieldset :disabled="!state.loaded">
      <h2>General</h2>
      <label class="line">
        Refresh every
        <input v-model.number="state.settings.refreshMinutes" type="number" min="1" class="number" />
        minutes
      </label>
      <label class="line"><input v-model="state.settings.notifications" type="checkbox" /> Notify me about new items</label>

      <h2>Scope</h2>
      <label class="block">
        Accounts <span class="hint">comma separated; @me is you</span>
        <input v-model.lazy="accounts" type="text" />
      </label>
      <div class="block">
        Organizations <span class="hint">selecting one searches it instead of the accounts</span>
        <label v-for="org in allOrganizations" :key="org" class="line">
          <input
            type="checkbox"
            :checked="state.settings.organizations.includes(org)"
            @change="state.settings.organizations = toggle(state.settings.organizations, org, ($event.target as HTMLInputElement).checked)"
          />
          {{ org }}
        </label>
        <span v-if="allOrganizations.length === 0" class="hint">No organizations</span>
      </div>
      <label class="block">
        Repositories <span class="hint">one per line, owner/name or name</span>
        <textarea v-model.lazy="repoList" rows="4" />
      </label>
      <div class="line">
        <label><input v-model="state.settings.repoListIsAllowList" type="radio" :value="false" /> Hide these</label>
        <label><input v-model="state.settings.repoListIsAllowList" type="radio" :value="true" /> Only these</label>
      </div>

      <h2>Display</h2>
      <label v-for="kind in KIND_ORDER" :key="kind" class="line">
        <input
          type="checkbox"
          :checked="!state.settings.hiddenKinds.includes(kind)"
          @change="state.settings.hiddenKinds = toggle(state.settings.hiddenKinds, kind, !($event.target as HTMLInputElement).checked)"
        />
        {{ KIND_TITLES[kind] }}
      </label>
      <label class="line"><input v-model="state.settings.showBots" type="checkbox" /> Show bot pull requests</label>
      <label class="line"><input v-model="state.settings.showDrafts" type="checkbox" /> Show drafts</label>
      <label class="line">
        Fold a repository with more than
        <input v-model.number="state.settings.repoGroupThreshold" type="number" min="0" class="number" />
        items (0 never folds)
      </label>
    </fieldset>

    <footer>
      <span v-if="state.saved" class="hint">Saved</span>
      <button :disabled="!state.loaded" @click="save">Save</button>
    </footer>
  </main>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

fieldset {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 4px 20px 12px;
  border: 0;
}

h2 {
  margin: 16px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
}

.hint {
  color: var(--muted);
  font-size: 11px;
}

input[type='text'],
textarea {
  font: inherit;
  padding: 4px 6px;
}

.number {
  width: 56px;
}

footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid var(--line);
}
</style>
