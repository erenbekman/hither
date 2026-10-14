<script setup lang="ts">
import { computed, ref } from 'vue'
import { SENTRY_TOKEN_KEY } from '../../sources/sentry'
import SettingRow from './SettingRow.vue'
import TokenRow from './TokenRow.vue'
import { lines, useSettings } from './context'

const { state, save, forgetToken } = useSettings()

const text = (event: Event) => (event.target as HTMLInputElement).value

const editing = ref(false)
const connected = computed(() => state.settings.sentryEnabled)
const complete = computed(() => !!state.tokens[SENTRY_TOKEN_KEY] && !!state.settings.sentryOrg)
const open = computed(() => connected.value && (editing.value || !complete.value))
const summary = computed(() => {
  if (!connected.value) return 'Not connected · new and spiking errors'
  if (!complete.value) return 'Add a token and your organization slug'
  const projects = state.settings.sentryProjects.length
  return `Connected · ${state.settings.sentryOrg} · ${projects === 0 ? 'all projects' : `${projects} project${projects === 1 ? '' : 's'}`}`
})

async function connect() {
  editing.value = true
  await save({ sentryEnabled: true })
}

async function disconnect() {
  editing.value = false
  await forgetToken(SENTRY_TOKEN_KEY)
  await save({ sentryEnabled: false })
}
</script>

<template>
  <SettingRow label="Sentry" :hint="summary">
    <button v-if="!connected" class="button" @click="connect()">Connect…</button>
    <template v-else>
      <button v-if="complete" class="button" @click="editing = !editing">{{ editing ? 'Done' : 'Edit' }}</button>
      <button class="button" @click="disconnect()">Disconnect</button>
    </template>
  </SettingRow>

  <div v-if="open" class="nested">
    <TokenRow label="Auth token" :token-key="SENTRY_TOKEN_KEY" hint="Needs the event:read scope" />
    <SettingRow label="Organization slug">
      <input class="text-input" type="text" :value="state.settings.sentryOrg" @change="save({ sentryOrg: text($event) })" />
    </SettingRow>
    <SettingRow label="Projects" hint="Comma separated slugs; empty means all">
      <input class="text-input" type="text" :value="state.settings.sentryProjects.join(', ')" @change="save({ sentryProjects: lines(text($event)) })" />
    </SettingRow>
  </div>
</template>

<style scoped>
.nested {
  margin: 0 10px 6px 18px;
  border-left: 1.5px solid var(--separator);
}
</style>
