<script setup lang="ts">
import Banner from '../components/Banner.vue'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import type { Lane } from '../../core/types'
import { LANE_ORDER, SECTION_TITLES } from '../../lanes'
import { toggleIn, useSettings } from './context'

const { state, save, updates, changeLaunchAtLogin } = useSettings()
const INTERVALS = [1, 2, 5, 10, 15, 30]
const LANES: { lane: Lane; label: string; hint: string }[] = [
  { lane: 'incoming', label: 'Incoming', hint: 'Review requests, new pull requests and issues' },
  { lane: 'outgoing', label: 'Outgoing', hint: 'Failed checks and deploys, Sentry issues' },
  { lane: 'agents', label: 'Agents', hint: 'Claude sessions waiting for you' },
]
const clock = (event: Event) => (event.target as HTMLInputElement).value
const checked = (event: Event) => (event.target as HTMLInputElement).checked
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
  </Group>

  <Group label="Notifications">
    <SettingRow label="Notifications" hint="The menu bar count shows new items either way">
      <Toggle label="Notifications" :model-value="state.settings.notifications" @update:model-value="save({ notifications: $event })" />
    </SettingRow>
    <SettingRow v-for="item in LANES" :key="item.lane" :label="item.label" :hint="item.hint">
      <Toggle
        :label="`${item.label} notifications`"
        :model-value="state.settings.notificationLanes.includes(item.lane)"
        :disabled="!state.settings.notifications"
        @update:model-value="save({ notificationLanes: toggleIn(state.settings.notificationLanes, item.lane, $event) as Lane[] })"
      />
    </SettingRow>
    <SettingRow label="Quiet hours" hint="No notifications in this window">
      <input
        type="time"
        aria-label="Quiet hours start"
        :value="state.settings.quietStart"
        :disabled="!state.settings.notifications || !state.settings.quietHours"
        @change="clock($event) && save({ quietStart: clock($event) })"
      />
      <span class="dash">–</span>
      <input
        type="time"
        aria-label="Quiet hours end"
        :value="state.settings.quietEnd"
        :disabled="!state.settings.notifications || !state.settings.quietHours"
        @change="clock($event) && save({ quietEnd: clock($event) })"
      />
      <Toggle
        label="Quiet hours"
        :model-value="state.settings.quietHours"
        :disabled="!state.settings.notifications"
        @update:model-value="save({ quietHours: $event })"
      />
    </SettingRow>
  </Group>

  <Group label="Sections">
    <SettingRow v-for="item in LANES" :key="item.lane" :label="item.label" stacked>
      <div class="kinds">
        <label v-for="kind in LANE_ORDER[item.lane]" :key="kind" class="check">
          <input
            type="checkbox"
            :checked="!state.settings.hiddenKinds.includes(kind)"
            @change="save({ hiddenKinds: toggleIn(state.settings.hiddenKinds, kind, !checked($event)) })"
          />
          {{ SECTION_TITLES[kind] ?? kind }}
        </label>
      </div>
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
.kinds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
}

.dash {
  color: var(--fg-3);
}

.flush {
  margin: -6px 0 14px;
}
</style>
