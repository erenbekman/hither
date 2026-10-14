<script setup lang="ts">
import { onMounted, reactive, watch } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'
import { toAppError, type AppError } from '../core/errors'
import ErrorRow from './ErrorRow.vue'

const DEFAULT_INTERVAL = 300

const state = reactive<{ refreshIntervalSec: number; loaded: boolean; error?: AppError }>({
  refreshIntervalSec: DEFAULT_INTERVAL,
  loaded: false,
})

let store: Store | undefined

onMounted(async () => {
  try {
    store = await load('settings.json', { defaults: { refreshIntervalSec: DEFAULT_INTERVAL }, autoSave: true })
    state.refreshIntervalSec = (await store.get<number>('refreshIntervalSec')) ?? DEFAULT_INTERVAL
    state.loaded = true
  } catch (error) {
    state.error = toAppError(error)
  }
})

watch(
  () => state.refreshIntervalSec,
  async (value) => {
    if (!store || !state.loaded) return
    try {
      await store.set('refreshIntervalSec', value)
    } catch (error) {
      state.error = toAppError(error)
    }
  },
)
</script>

<template>
  <main class="settings">
    <h1>Settings</h1>
    <ErrorRow v-if="state.error" :error="state.error" />
    <label>
      Refresh every
      <input v-model.number="state.refreshIntervalSec" type="number" min="60" step="60" :disabled="!state.loaded" />
      seconds
    </label>
  </main>
</template>

<style scoped>
.settings {
  padding: 20px;
}

h1 {
  margin: 0 0 16px;
  font-size: 15px;
}

input {
  width: 80px;
  margin: 0 6px;
}
</style>
