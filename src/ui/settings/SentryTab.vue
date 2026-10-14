<script setup lang="ts">
import { SENTRY_TOKEN_KEY } from '../../sources/sentry'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import TokenRow from './TokenRow.vue'
import { lines, useSettings } from './context'

const { state, save } = useSettings()

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
  <Group>
    <SettingRow label="Watch Sentry errors" hint="New and spiking unresolved issues show under Outgoing">
      <Toggle label="Watch Sentry errors" :model-value="state.settings.sentryEnabled" @update:model-value="save({ sentryEnabled: $event })" />
    </SettingRow>
  </Group>

  <template v-if="state.settings.sentryEnabled">
    <Group label="Account">
      <TokenRow label="Auth token" :token-key="SENTRY_TOKEN_KEY" hint="Needs the event:read scope" />
      <SettingRow label="Organization slug">
        <input class="text-input" type="text" :value="state.settings.sentryOrg" @change="save({ sentryOrg: text($event) })" />
      </SettingRow>
      <SettingRow label="Projects" hint="Comma separated slugs; empty means all">
        <input
          class="text-input"
          type="text"
          :value="state.settings.sentryProjects.join(', ')"
          @change="save({ sentryProjects: lines(text($event)) })"
        />
      </SettingRow>
    </Group>

    <Group label="Deploys and errors">
      <SettingRow label="Forge site → Sentry project" hint="One per line, e.g. acme.app = acme-api; links new errors to the deploy before them" stacked>
        <textarea class="text-input" rows="3" :value="siteLinks()" @change="save({ sentryProjectForSite: parseLinks(text($event)) })" />
      </SettingRow>
    </Group>
  </template>
</template>
