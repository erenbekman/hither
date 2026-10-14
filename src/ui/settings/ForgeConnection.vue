<script setup lang="ts">
import { computed, ref } from 'vue'
import { FORGE_TOKEN_KEY } from '../../sources/forge'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import TokenRow from './TokenRow.vue'
import { toggleIn, useSettings } from './context'

const { state, save, chooseForgeOrg, forgetToken } = useSettings()

const editing = ref(false)
const connected = computed(() => state.settings.forgeEnabled)
const complete = computed(() => !!state.tokens[FORGE_TOKEN_KEY] && !!state.settings.forgeOrg && state.settings.forgeServers.length > 0)
const open = computed(() => connected.value && (editing.value || !complete.value))
const summary = computed(() => {
  if (!connected.value) return 'Not connected · deploys from Laravel Forge'
  if (!complete.value) return 'Add a token, then pick an organization and servers'
  const org = state.forgeOrgs.find((entry) => entry.slug === state.settings.forgeOrg)?.name ?? state.settings.forgeOrg
  const servers = state.settings.forgeServers.length
  return `Connected · ${org} · ${servers} server${servers === 1 ? '' : 's'}`
})

async function connect() {
  editing.value = true
  await save({ forgeEnabled: true })
}

async function disconnect() {
  editing.value = false
  await forgetToken(FORGE_TOKEN_KEY)
  await save({ forgeEnabled: false, forgeServers: [] })
}
</script>

<template>
  <SettingRow label="Forge" :hint="summary">
    <button v-if="!connected" class="button" @click="connect()">Connect…</button>
    <template v-else>
      <button v-if="complete" class="button" @click="editing = !editing">{{ editing ? 'Done' : 'Edit' }}</button>
      <button class="button" @click="disconnect()">Disconnect</button>
    </template>
  </SettingRow>

  <div v-if="open" class="nested">
    <TokenRow label="API token" :token-key="FORGE_TOKEN_KEY" hint="Create one at forge.laravel.com/profile/api" />
    <SettingRow v-if="state.forgeOrgs.length > 0" label="Organization">
      <select :value="state.settings.forgeOrg" @change="chooseForgeOrg(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>Choose…</option>
        <option v-for="org in state.forgeOrgs" :key="org.slug" :value="org.slug">{{ org.name }}</option>
      </select>
    </SettingRow>
    <SettingRow v-for="server in state.forgeServers" :key="server.id" :label="server.name" hint="One request per server on each refresh">
      <Toggle
        :label="server.name"
        :model-value="state.settings.forgeServers.includes(server.id)"
        @update:model-value="save({ forgeServers: toggleIn(state.settings.forgeServers, server.id, $event) })"
      />
    </SettingRow>
  </div>
</template>

<style scoped>
.nested {
  margin: 0 10px 6px 18px;
  border-left: 1.5px solid var(--separator);
}
</style>
