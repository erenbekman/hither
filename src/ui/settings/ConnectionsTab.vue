<script setup lang="ts">
import type { HookStatus } from '../../core/claude-settings'
import { TERMINALS, type Terminal } from '../../core/settings'
import Banner from '../components/Banner.vue'
import Group from '../components/Group.vue'
import Advanced from './Advanced.vue'
import ForgeConnection from './ForgeConnection.vue'
import SentryConnection from './SentryConnection.vue'
import SettingRow from './SettingRow.vue'
import { lines, useSettings } from './context'

const { state, save, changeHooks, updateCodexHooks, openTemplates } = useSettings()

const HOOK_LABELS: Record<HookStatus, string> = {
  installed: 'Hooks installed',
  missing: 'Hooks not installed',
  outdated: 'Hooks out of date',
}

const text = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value

const siteLinks = () =>
  Object.entries(state.settings.sentryProjectForSite)
    .map(([site, project]) => `${site} = ${project}`)
    .join('\n')

const parseLinks = (value: string) =>
  Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.split('=').map((part) => part.trim()))
      .filter((parts) => parts.length === 2 && parts[0] && parts[1]),
  )
</script>

<template>
  <Group label="Agents" :hint="state.settings.lanes.includes('agents') ? undefined : 'The Agents lane is off in General'">
    <SettingRow label="Claude Code" :hint="state.hooks ? HOOK_LABELS[state.hooks] : 'Checking…'">
      <button v-if="state.hooks !== 'installed'" class="button primary" @click="changeHooks(true)">
        {{ state.hooks === 'outdated' ? 'Update' : 'Install' }}
      </button>
      <button v-if="state.hooks && state.hooks !== 'missing'" class="button" @click="changeHooks(false)">Remove</button>
    </SettingRow>
    <SettingRow
      v-if="state.codexHooks !== 'unavailable'"
      label="Codex"
      :hint="`${state.codexHooks ? HOOK_LABELS[state.codexHooks] : 'Checking…'}${state.codexHooks === 'installed' ? '' : ' · approve them once in Codex with /hooks'}`"
    >
      <button v-if="state.codexHooks !== 'installed'" class="button primary" @click="updateCodexHooks(true)">
        {{ state.codexHooks === 'outdated' ? 'Update' : 'Install' }}
      </button>
      <button v-if="state.codexHooks && state.codexHooks !== 'missing'" class="button" @click="updateCodexHooks(false)">Remove</button>
    </SettingRow>
    <SettingRow label="Terminal" hint="Where Open in Claude and Checkout start">
      <select :value="state.settings.terminal" @change="save({ terminal: text($event) as Terminal })">
        <option v-for="terminal in TERMINALS" :key="terminal" :value="terminal">{{ terminal }}</option>
      </select>
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

  <Group label="Deploys and errors" :hint="state.settings.lanes.includes('outgoing') ? undefined : 'The Outgoing lane is off in General'">
    <ForgeConnection />
    <SentryConnection />
  </Group>

  <Advanced summary="Agent accounts and branches, Sentry projects per site, prompt templates">
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

    <Group v-if="state.settings.sentryEnabled && state.settings.forgeEnabled" label="Deploys and errors">
      <SettingRow label="Forge site → Sentry project" hint="One per line, e.g. acme.app = acme-api; links new errors to the deploy before them" stacked>
        <textarea class="text-input" rows="3" :value="siteLinks()" @change="save({ sentryProjectForSite: parseLinks(text($event)) })" />
      </SettingRow>
    </Group>

    <Group label="Suggestions">
      <SettingRow label="Prompt templates" hint="Markdown files; prompts carry only ids such as repo and PR number, never titles or logs">
        <button class="button" @click="openTemplates()">Open folder</button>
      </SettingRow>
      <SettingRow label="Summaries" hint="Summarize runs claude -p with read-only tools: Read, Grep, Glob, gh pr view/diff, gh run view">
        <span class="value">Read-only</span>
      </SettingRow>
    </Group>
  </Advanced>
</template>

<style scoped>
.backup {
  color: var(--fg-2);
  word-break: break-all;
}

.value {
  color: var(--fg-2);
  font-size: 12.5px;
}

.flush {
  margin: -6px 0 14px;
}
</style>
