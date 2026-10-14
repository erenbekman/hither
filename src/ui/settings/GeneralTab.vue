<script setup lang="ts">
import type { LaneId } from '../../core/settings'
import type { Lane } from '../../core/types'
import { LANE_ORDER, SECTION_TITLES } from '../../lanes'
import Banner from '../components/Banner.vue'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import Advanced from './Advanced.vue'
import SettingRow from './SettingRow.vue'
import { toggleIn, useSettings } from './context'

const { state, save, updates, changeLaunchAtLogin } = useSettings()
const INTERVALS = [1, 2, 5, 10, 15, 30]
const LANES: { id: LaneId; label: string; hint: string }[] = [
  { id: 'incoming', label: 'Incoming', hint: 'Pull requests and issues waiting on you' },
  { id: 'outgoing', label: 'Outgoing', hint: 'Your checks, deploys and production errors' },
  { id: 'agents', label: 'Agents', hint: 'Claude Code and Codex sessions, agent pull requests' },
  { id: 'suggestions', label: 'Suggestions', hint: 'One-click next steps, such as fixing a red build in Claude' },
]
const NOTIFYING: { lane: Lane; label: string }[] = [
  { lane: 'incoming', label: 'Incoming' },
  { lane: 'outgoing', label: 'Outgoing' },
  { lane: 'agents', label: 'Agents' },
]
const clock = (event: Event) => (event.target as HTMLInputElement).value
const checked = (event: Event) => (event.target as HTMLInputElement).checked
const isLastLane = (id: LaneId) => state.settings.lanes.length === 1 && state.settings.lanes[0] === id
</script>

<template>
  <Group label="Lanes">
    <SettingRow v-for="lane in LANES" :key="lane.id" :label="lane.label" :hint="lane.hint">
      <Toggle
        :label="lane.label"
        :model-value="state.settings.lanes.includes(lane.id)"
        :disabled="isLastLane(lane.id)"
        @update:model-value="save({ lanes: toggleIn(state.settings.lanes, lane.id, $event) as LaneId[] })"
      />
    </SettingRow>
  </Group>

  <Group>
    <SettingRow label="Refresh every">
      <select :value="state.settings.refreshMinutes" @change="save({ refreshMinutes: Number(($event.target as HTMLSelectElement).value) })">
        <option v-for="minutes in INTERVALS" :key="minutes" :value="minutes">{{ minutes }} min</option>
        <option v-if="!INTERVALS.includes(state.settings.refreshMinutes)" :value="state.settings.refreshMinutes">
          {{ state.settings.refreshMinutes }} min
        </option>
      </select>
    </SettingRow>
    <SettingRow label="Notifications" hint="The menu bar count shows new items either way">
      <Toggle label="Notifications" :model-value="state.settings.notifications" @update:model-value="save({ notifications: $event })" />
    </SettingRow>
    <SettingRow label="Open at login">
      <Toggle
        label="Open at login"
        :model-value="state.launchAtLogin ?? false"
        :disabled="state.launchAtLogin === undefined"
        @update:model-value="changeLaunchAtLogin($event)"
      />
    </SettingRow>
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

  <Advanced summary="Notifications per lane, quiet hours, sections">
    <Group label="Notify about">
      <SettingRow v-for="item in NOTIFYING" :key="item.lane" :label="item.label">
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
      <SettingRow v-for="item in NOTIFYING" :key="item.lane" :label="item.label" stacked>
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
  </Advanced>
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
