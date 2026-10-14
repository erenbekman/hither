<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Banner from './components/Banner.vue'
import SettingsTabs, { type SettingsTab } from './components/SettingsTabs.vue'
import ConnectionsTab from './settings/ConnectionsTab.vue'
import { createSettingsContext, provideSettings } from './settings/context'
import GeneralTab from './settings/GeneralTab.vue'
import GitHubTab from './settings/GitHubTab.vue'

const WIDTH = 520
const MIN_HEIGHT = 360
const MAX_HEIGHT = 760

const context = createSettingsContext()
provideSettings(context)
const { state, dismissError } = context

const tab = ref<SettingsTab>('general')
const page = ref<HTMLElement>()

const TABS = { general: GeneralTab, github: GitHubTab, connections: ConnectionsTab }

async function fitWindow() {
  await nextTick()
  if (!page.value) return
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, page.value.scrollHeight))
  await context.attempt(() => getCurrentWindow().setSize(new LogicalSize(WIDTH, height)))
}

const resize = new ResizeObserver(() => void fitWindow())

onMounted(async () => {
  if (page.value) resize.observe(page.value)
  await context.load()
  await fitWindow()
})
onUnmounted(() => resize.disconnect())
</script>

<template>
  <div ref="page" class="settings">
    <SettingsTabs v-model="tab" />
    <div class="content">
      <Banner v-for="(error, i) in state.errors" :key="i" tone="error" :error="error" class="flush">
        <template #action>
          <button class="icon-button" title="Dismiss" @click="dismissError(i)">×</button>
        </template>
      </Banner>
      <fieldset :disabled="!state.loaded">
        <component :is="TABS[tab]" />
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flow-root;
}

.content {
  padding: 16px 20px 6px;
}

fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.flush {
  margin: 0 0 12px;
}
</style>
