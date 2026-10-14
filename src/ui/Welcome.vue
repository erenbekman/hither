<script setup lang="ts">
import { onMounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { HookStatus } from '../core/claude-settings'
import type { LaneId } from '../core/settings'
import { revealPanel } from '../native'
import Banner from './components/Banner.vue'
import Group from './components/Group.vue'
import Mark from './components/Mark.vue'
import Toggle from './components/Toggle.vue'
import { createSettingsContext, provideSettings, toggleIn } from './settings/context'
import GitHubAccount from './settings/GitHubAccount.vue'
import SettingRow from './settings/SettingRow.vue'

const context = createSettingsContext()
provideSettings(context)
const { state, save, changeHooks, updateCodexHooks, changeLaunchAtLogin, dismissError } = context

const STATUS: Record<HookStatus, string> = { installed: 'Installed', missing: 'Not installed', outdated: 'Out of date' }
const LANES: { id: LaneId; label: string; hint: string }[] = [
  { id: 'incoming', label: 'Incoming', hint: 'Pull requests and issues waiting on you' },
  { id: 'outgoing', label: 'Outgoing', hint: 'Your checks, deploys and production errors' },
  { id: 'agents', label: 'Agents', hint: 'Claude Code and Codex sessions' },
  { id: 'suggestions', label: 'Suggestions', hint: 'One-click next steps in Claude' },
]

async function finish() {
  await save({ onboarded: true })
  await context.attempt(revealPanel)
  await context.attempt(() => getCurrentWindow().close())
}

onMounted(async () => {
  await context.load({ organizations: false })
  await getCurrentWindow().onCloseRequested(() => save({ onboarded: true }))
})
</script>

<template>
  <div class="welcome">
    <header class="intro" data-tauri-drag-region>
      <Mark :size="40" />
      <h1>Welcome to Hither</h1>
      <p>What waits on you, how your checks and deploys went, and your Claude Code and Codex sessions — in the menu bar.</p>
    </header>

    <div class="content">
      <Banner v-for="(error, i) in state.errors" :key="i" tone="error" :error="error" class="flush">
        <template #action>
          <button class="icon-button" title="Dismiss" aria-label="Dismiss" @click="dismissError(i)">×</button>
        </template>
      </Banner>

      <fieldset :disabled="!state.loaded">
        <Group label="GitHub">
          <GitHubAccount />
        </Group>

        <Group label="What do you want to see?">
          <SettingRow v-for="lane in LANES" :key="lane.id" :label="lane.label" :hint="lane.hint">
            <Toggle
              :label="lane.label"
              :model-value="state.settings.lanes.includes(lane.id)"
              :disabled="state.settings.lanes.length === 1 && state.settings.lanes[0] === lane.id"
              @update:model-value="save({ lanes: toggleIn(state.settings.lanes, lane.id, $event) as LaneId[] })"
            />
          </SettingRow>
        </Group>

        <Group v-if="state.settings.lanes.includes('agents')" label="Agents">
          <SettingRow label="Claude Code" :hint="`${state.hooks ? STATUS[state.hooks] : 'Checking…'} · sessions show under Agents`">
            <button v-if="state.hooks !== 'installed'" class="button primary" @click="changeHooks(true)">
              {{ state.hooks === 'outdated' ? 'Update' : 'Install' }}
            </button>
          </SettingRow>
          <SettingRow
            v-if="state.codexHooks !== 'unavailable'"
            label="Codex"
            :hint="`${state.codexHooks ? STATUS[state.codexHooks] : 'Checking…'} · approve them once in Codex with /hooks`"
          >
            <button v-if="state.codexHooks !== 'installed'" class="button primary" @click="updateCodexHooks(true)">
              {{ state.codexHooks === 'outdated' ? 'Update' : 'Install' }}
            </button>
          </SettingRow>
        </Group>

        <Group>
          <SettingRow label="Open at login">
            <Toggle
              label="Open at login"
              :model-value="state.launchAtLogin ?? false"
              :disabled="state.launchAtLogin === undefined"
              @update:model-value="changeLaunchAtLogin($event)"
            />
          </SettingRow>
        </Group>
      </fieldset>
    </div>

    <footer>
      <span class="hint">Forge and Sentry can be connected later in Settings → Connections.</span>
      <button class="button primary" @click="finish()">Start Using Hither</button>
    </footer>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 36px 32px 8px;
  text-align: center;
}

.intro h1 {
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.intro p {
  margin: 0;
  color: var(--fg-2);
  font-size: 12.5px;
}

.content {
  flex: 1;
  padding: 12px 20px 0;
}

fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 18px;
}

.hint {
  flex: 1;
  color: var(--fg-3);
  font-size: 11px;
}

.flush {
  margin: 0 0 12px;
}
</style>
