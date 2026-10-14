<script setup lang="ts">
import Banner from '../components/Banner.vue'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import { useSettings } from './context'

const { state, save, updates, changeLaunchAtLogin } = useSettings()
const INTERVALS = [1, 2, 5, 10, 15, 30]
</script>

<template>
  <Group>
    <SettingRow label="Refresh every">
      <select :value="state.settings.refreshMinutes" @change="save({ refreshMinutes: Number(($event.target as HTMLSelectElement).value) })">
        <option v-for="minutes in INTERVALS" :key="minutes" :value="minutes">{{ minutes }} min</option>
        <option v-if="!INTERVALS.includes(state.settings.refreshMinutes)" :value="state.settings.refreshMinutes">
          {{ state.settings.refreshMinutes }} min
        </option>
      </select>
    </SettingRow>
    <SettingRow label="Open at login" hint="Starts Hither when you log in; listed under Login Items in System Settings">
      <Toggle
        label="Open at login"
        :model-value="state.launchAtLogin ?? false"
        :disabled="state.launchAtLogin === undefined"
        @update:model-value="changeLaunchAtLogin($event)"
      />
    </SettingRow>
    <SettingRow label="Notifications" hint="New items, failed checks and deploys, waiting Claude sessions">
      <Toggle label="Notifications" :model-value="state.settings.notifications" @update:model-value="save({ notifications: $event })" />
    </SettingRow>
  </Group>

  <Group label="Updates">
    <SettingRow
      :label="`Hither ${updates.state.current ?? '…'}`"
      :hint="
        updates.state.checking
          ? 'Checking…'
          : updates.state.available
            ? `${updates.state.available.version} is available`
            : updates.state.checkedAt
              ? 'Up to date'
              : undefined
      "
    >
      <button class="button" :disabled="updates.state.checking" @click="updates.checkNow()">Check now</button>
      <button v-if="updates.state.available" class="button primary" :disabled="updates.state.installing" @click="updates.install()">
        {{ updates.state.installing ? 'Installing…' : 'Install and restart' }}
      </button>
    </SettingRow>
  </Group>
  <Banner v-if="updates.state.error" tone="error" :error="updates.state.error" class="flush" />
</template>

<style scoped>
.flush {
  margin: -6px 0 14px;
}
</style>
