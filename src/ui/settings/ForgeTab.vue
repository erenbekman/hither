<script setup lang="ts">
import { FORGE_TOKEN_KEY } from '../../sources/forge'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import TokenRow from './TokenRow.vue'
import { toggleIn, useSettings } from './context'

const { state, save, chooseForgeOrg } = useSettings()
</script>

<template>
  <Group>
    <SettingRow label="Watch Forge deployments" hint="Failed, running and recent deploys show under Outgoing">
      <Toggle label="Watch Forge deployments" :model-value="state.settings.forgeEnabled" @update:model-value="save({ forgeEnabled: $event })" />
    </SettingRow>
  </Group>

  <template v-if="state.settings.forgeEnabled">
    <Group label="Account">
      <TokenRow label="API token" :token-key="FORGE_TOKEN_KEY" hint="Create one at forge.laravel.com/profile/api" />
      <SettingRow v-if="state.forgeOrgs.length > 0" label="Organization">
        <select :value="state.settings.forgeOrg" @change="chooseForgeOrg(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Choose…</option>
          <option v-for="org in state.forgeOrgs" :key="org.slug" :value="org.slug">{{ org.name }}</option>
        </select>
      </SettingRow>
    </Group>

    <Group v-if="state.forgeServers.length > 0" label="Servers" hint="One request per server on each refresh">
      <SettingRow v-for="server in state.forgeServers" :key="server.id" :label="server.name">
        <Toggle
          :label="server.name"
          :model-value="state.settings.forgeServers.includes(server.id)"
          @update:model-value="save({ forgeServers: toggleIn(state.settings.forgeServers, server.id, $event) })"
        />
      </SettingRow>
    </Group>
  </template>
</template>
