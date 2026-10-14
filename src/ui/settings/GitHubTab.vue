<script setup lang="ts">
import { computed, ref } from 'vue'
import { isRepoWatched, sameRepo, setRepoWatched, type QuotaVisibility } from '../../core/settings'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import SettingRow from './SettingRow.vue'
import { lines, toggleIn, useSettings } from './context'

const { state, save } = useSettings()

const organizations = computed(() => [...new Set([...state.organizations, ...state.settings.organizations])])
const text = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value
const checked = (event: Event) => (event.target as HTMLInputElement).checked

const QUOTA_CHOICES: { value: QuotaVisibility; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'low', label: 'When low' },
  { value: 'always', label: 'Always' },
]

const repos = computed(() => {
  const known = Object.keys(state.knownRepos)
  const listed = state.settings.repoList.filter((entry) => !known.some((repo) => sameRepo(state.settings, entry, repo)))
  return [...known, ...listed].sort((a, b) => (state.knownRepos[b] ?? 0) - (state.knownRepos[a] ?? 0) || a.localeCompare(b))
})
const newRepo = ref('')

function addRepo() {
  const repo = newRepo.value.trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return
  state.knownRepos = { [repo]: 0, ...state.knownRepos }
  void save({ repoList: setRepoWatched(state.settings, repo, state.settings.repoListIsAllowList) })
  newRepo.value = ''
}
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
    <SettingRow label="Watch only checked repositories" :hint="state.settings.repoListIsAllowList ? 'Only checked repositories are watched' : 'Unchecked repositories are hidden'">
      <Toggle
        label="Watch only checked repositories"
        :model-value="state.settings.repoListIsAllowList"
        @update:model-value="save({ repoListIsAllowList: $event })"
      />
    </SettingRow>
    <SettingRow label="Repositories" hint="Repositories appear here as Hither sees activity in them" stacked>
      <div class="repos">
        <label v-for="repo in repos" :key="repo" class="check">
          <input
            type="checkbox"
            :checked="isRepoWatched(state.settings, repo)"
            @change="save({ repoList: setRepoWatched(state.settings, repo, checked($event)) })"
          />
          <span class="repo">{{ repo }}</span>
          <span v-if="state.knownRepos[repo]" class="count num">{{ state.knownRepos[repo] }}</span>
        </label>
      </div>
      <form class="add" @submit.prevent="addRepo">
        <input v-model="newRepo" class="text-input" type="text" placeholder="owner/name" aria-label="Repository to add" />
        <button class="button" :disabled="!newRepo.includes('/')">Add</button>
      </form>
    </SettingRow>
    <SettingRow label="Watch the main branch of" hint="owner/name, one per line; a red build shows under Outgoing" stacked>
      <textarea class="text-input" rows="2" :value="state.settings.watchedRepos.join('\n')" @change="save({ watchedRepos: lines(text($event)) })" />
    </SettingRow>
  </Group>

  <Group label="API">
    <SettingRow label="Show the remaining API quota" hint="At the bottom of the panel; low means under a quarter left">
      <select :value="state.settings.quotaVisibility" @change="save({ quotaVisibility: text($event) as QuotaVisibility })">
        <option v-for="choice in QUOTA_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
      </select>
    </SettingRow>
  </Group>

  <Group label="Incoming lane">
    <SettingRow label="Show bot pull requests">
      <Toggle label="Show bot pull requests" :model-value="state.settings.showBots" @update:model-value="save({ showBots: $event })" />
    </SettingRow>
    <SettingRow label="Show drafts">
      <Toggle label="Show drafts" :model-value="state.settings.showDrafts" @update:model-value="save({ showDrafts: $event })" />
    </SettingRow>
    <SettingRow label="Flag review requests older than" hint="Hours since the pull request was opened; 0 never flags">
      <input
        type="number"
        min="0"
        :value="state.settings.reviewOverdueHours"
        @change="save({ reviewOverdueHours: Number(text($event)) })"
      />
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

.repos {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.repo {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.count {
  color: var(--fg-3);
  font-size: 11.5px;
}

.add {
  display: flex;
  gap: 6px;
}

.add .text-input {
  flex: 1;
}

.empty {
  color: var(--fg-3);
  font-size: 12px;
}
</style>
