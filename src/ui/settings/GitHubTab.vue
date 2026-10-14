<script setup lang="ts">
import { computed } from 'vue'
import { KIND_ORDER, KIND_TITLES } from '../../sources/github'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import { lines, toggleIn, useSettings } from './context'

const { state, save } = useSettings()

const organizations = computed(() => [...new Set([...state.organizations, ...state.settings.organizations])])
const text = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value
const checked = (event: Event) => (event.target as HTMLInputElement).checked
</script>

<template>
  <Group label="Scope">
    <SettingRow label="Accounts" hint="Comma separated; @me is you">
      <input class="text-input" type="text" :value="state.settings.accounts.join(', ')" @change="save({ accounts: lines(text($event)) })" />
    </SettingRow>
    <SettingRow label="Organizations" hint="Selecting one searches it instead of the accounts" stacked>
      <label v-for="org in organizations" :key="org" class="check">
        <input
          type="checkbox"
          :checked="state.settings.organizations.includes(org)"
          @change="save({ organizations: toggleIn(state.settings.organizations, org, checked($event)) })"
        />
        {{ org }}
      </label>
      <span v-if="organizations.length === 0" class="empty">No organizations</span>
    </SettingRow>
    <SettingRow label="Repositories" hint="One per line, owner/name or name" stacked>
      <textarea class="text-input" rows="3" :value="state.settings.repoList.join('\n')" @change="save({ repoList: lines(text($event)) })" />
      <div class="radios">
        <label class="check">
          <input type="radio" :checked="!state.settings.repoListIsAllowList" @change="save({ repoListIsAllowList: false })" />
          Hide these
        </label>
        <label class="check">
          <input type="radio" :checked="state.settings.repoListIsAllowList" @change="save({ repoListIsAllowList: true })" />
          Only these
        </label>
      </div>
    </SettingRow>
    <SettingRow label="Watch the main branch of" hint="owner/name, one per line; a red build shows under Outgoing" stacked>
      <textarea class="text-input" rows="2" :value="state.settings.watchedRepos.join('\n')" @change="save({ watchedRepos: lines(text($event)) })" />
    </SettingRow>
  </Group>

  <Group label="Incoming lane">
    <SettingRow label="Sections" stacked>
      <label v-for="kind in KIND_ORDER" :key="kind" class="check">
        <input
          type="checkbox"
          :checked="!state.settings.hiddenKinds.includes(kind)"
          @change="save({ hiddenKinds: toggleIn(state.settings.hiddenKinds, kind, !checked($event)) })"
        />
        {{ KIND_TITLES[kind] }}
      </label>
    </SettingRow>
    <SettingRow label="Show bot pull requests">
      <Toggle label="Show bot pull requests" :model-value="state.settings.showBots" @update:model-value="save({ showBots: $event })" />
    </SettingRow>
    <SettingRow label="Show drafts">
      <Toggle label="Show drafts" :model-value="state.settings.showDrafts" @update:model-value="save({ showDrafts: $event })" />
    </SettingRow>
    <SettingRow label="Fold a repository with more than" hint="0 never folds">
      <input
        type="number"
        min="0"
        :value="state.settings.repoGroupThreshold"
        @change="save({ repoGroupThreshold: Number(text($event)) })"
      />
    </SettingRow>
  </Group>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
}

.radios {
  display: flex;
  gap: 16px;
}

.empty {
  color: var(--fg-3);
  font-size: 12px;
}
</style>
