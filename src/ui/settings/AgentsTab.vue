<script setup lang="ts">
import type { HookStatus } from '../../core/claude-settings'
import Banner from '../components/Banner.vue'
import Group from '../components/Group.vue'
import SettingRow from './SettingRow.vue'
import { lines, useSettings } from './context'

const { state, save, changeHooks } = useSettings()

const HOOK_LABELS: Record<HookStatus, string> = {
  installed: 'Installed',
  missing: 'Not installed',
  outdated: 'Out of date',
}

const text = (event: Event) => (event.target as HTMLInputElement).value
</script>

<template>
  <Group label="Claude Code">
    <SettingRow
      label="Hooks in ~/.claude/settings.json"
      :hint="`${state.hooks ? HOOK_LABELS[state.hooks] : 'Checking…'} · Hither listens on 127.0.0.1 only; your other hooks stay`"
    >
      <button class="button" :class="{ primary: state.hooks !== 'installed' }" @click="changeHooks(true)">
        {{ state.hooks === 'missing' ? 'Install' : 'Reinstall' }}
      </button>
      <button v-if="state.hooks && state.hooks !== 'missing'" class="button" @click="changeHooks(false)">Remove</button>
    </SettingRow>
    <SettingRow v-if="state.backup" label="Previous file saved as" stacked>
      <code class="selectable backup">{{ state.backup }}</code>
    </SettingRow>
  </Group>
  <Banner
    v-if="state.hooksBlocked"
    tone="warning"
    text="allowedHttpHookUrls does not include http://127.0.0.1:47811/hook"
    detail="Claude Code will not send events to Hither until it is added."
    class="flush"
  />

  <Group label="Agent pull requests">
    <SettingRow label="Accounts" hint="Pull requests by these logins show under Agents" stacked>
      <input class="text-input" type="text" :value="state.settings.agentLogins.join(', ')" @change="save({ agentLogins: lines(text($event)) })" />
    </SettingRow>
    <SettingRow label="Branch prefixes" hint="Pull requests from these branches show under Agents" stacked>
      <input
        class="text-input"
        type="text"
        :value="state.settings.agentBranchPrefixes.join(', ')"
        @change="save({ agentBranchPrefixes: lines(text($event)) })"
      />
    </SettingRow>
  </Group>
</template>

<style scoped>
.backup {
  color: var(--fg-2);
  word-break: break-all;
}

.flush {
  margin: -6px 0 14px;
}
</style>
