<script setup lang="ts">
import { TERMINALS, type Terminal } from '../../core/settings'
import Group from '../components/Group.vue'
import SettingRow from './SettingRow.vue'
import { useSettings } from './context'

const { state, save, openTemplates } = useSettings()
</script>

<template>
  <Group>
    <SettingRow label="Prompt templates" hint="Markdown files; prompts carry only ids such as repo and PR number, never titles or logs">
      <button class="button" @click="openTemplates()">Open folder</button>
    </SettingRow>
    <SettingRow label="Terminal" :hint="`Open in Claude starts claude in a new ${state.settings.terminal} window, in the repository's folder`">
      <select :value="state.settings.terminal" @change="save({ terminal: ($event.target as HTMLSelectElement).value as Terminal })">
        <option v-for="terminal in TERMINALS" :key="terminal" :value="terminal">{{ terminal }}</option>
      </select>
    </SettingRow>
    <SettingRow label="Summaries" hint="Summarize runs claude -p with read-only tools: Read, Grep, Glob, gh pr view/diff, gh run view">
      <span class="value">Read-only</span>
    </SettingRow>
  </Group>
</template>

<style scoped>
.value {
  color: var(--fg-2);
  font-size: 12.5px;
}
</style>
