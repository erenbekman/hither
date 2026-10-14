<script setup lang="ts">
import { computed, ref } from 'vue'
import { isRepoWatched, sameRepo, setRepoWatched, type QuotaVisibility } from '../../core/settings'
import Group from '../components/Group.vue'
import Toggle from '../components/Toggle.vue'
import Advanced from './Advanced.vue'
import GitHubAccount from './GitHubAccount.vue'
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
const newAccount = ref('')
const accountName = (text: string) => {
  const name = text.trim().replace(/^@/, '').toLowerCase()
  return /^[a-z\d](?:[a-z\d-]{0,38})$/.test(name) ? name : undefined
}

function addAccount() {
  const name = accountName(newAccount.value)
  if (!name) return
  if (!state.settings.accounts.includes(name)) void save({ accounts: [...state.settings.accounts, name] })
  newAccount.value = ''
}

function addRepo() {
  const repo = newRepo.value.trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return
  state.knownRepos = { [repo]: 0, ...state.knownRepos }
  void save({ repoList: setRepoWatched(state.settings, repo, state.settings.repoListIsAllowList) })
  newRepo.value = ''
}
</script>

<template>
  <Group label="Account">
    <GitHubAccount />
  </Group>

  <Group label="Organizations" hint="Checked organizations show what is assigned to you there">
    <label v-for="org in organizations" :key="org" class="check row-check">
      <input
        type="checkbox"
        :checked="state.settings.organizations.includes(org)"
        @change="save({ organizations: toggleIn(state.settings.organizations, org, checked($event)) })"
      />
      {{ org }}
    </label>
    <span v-if="organizations.length === 0" class="empty row-check">Organizations you belong to appear here</span>
  </Group>

  <Group label="Repositories">
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
  </Group>

  <Advanced summary="Watched accounts and branches, bots, drafts, folding, overdue reviews, API quota">
    <Group>
      <SettingRow label="Watched accounts" hint="@me is you; your personal repositories stay on this list" stacked>
        <div class="list">
          <div v-for="account in state.settings.accounts" :key="account" class="entry">
            <span class="repo">{{ account }}</span>
            <button
              v-if="account !== '@me'"
              class="icon-button"
              :title="`Remove ${account}`"
              :aria-label="`Remove ${account}`"
              @click="save({ accounts: state.settings.accounts.filter((entry) => entry !== account) })"
            >
              −
            </button>
          </div>
        </div>
        <form class="add" @submit.prevent="addAccount">
          <input v-model="newAccount" class="text-input" type="text" placeholder="username" aria-label="Account to add" />
          <button class="button" :disabled="!accountName(newAccount)">Add</button>
        </form>
      </SettingRow>
      <SettingRow label="Watch the main branch of" hint="owner/name, one per line; a red build shows under Outgoing" stacked>
        <textarea class="text-input" rows="2" :value="state.settings.watchedRepos.join('\n')" @change="save({ watchedRepos: lines(text($event)) })" />
      </SettingRow>
    </Group>

    <Group>
      <SettingRow label="Show bot pull requests">
        <Toggle label="Show bot pull requests" :model-value="state.settings.showBots" @update:model-value="save({ showBots: $event })" />
      </SettingRow>
      <SettingRow label="Show drafts">
        <Toggle label="Show drafts" :model-value="state.settings.showDrafts" @update:model-value="save({ showDrafts: $event })" />
      </SettingRow>
      <SettingRow label="Fold a repository with more than" hint="Quiet items only; 0 never folds">
        <input type="number" min="0" :value="state.settings.repoGroupThreshold" @change="save({ repoGroupThreshold: Number(text($event)) })" />
      </SettingRow>
      <SettingRow label="Flag review requests older than" hint="Hours since the pull request was opened; 0 never flags">
        <input type="number" min="0" :value="state.settings.reviewOverdueHours" @change="save({ reviewOverdueHours: Number(text($event)) })" />
      </SettingRow>
      <SettingRow label="Show API calls left" hint="In the panel footer; low means under a quarter left">
        <select :value="state.settings.quotaVisibility" @change="save({ quotaVisibility: text($event) as QuotaVisibility })">
          <option v-for="choice in QUOTA_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
        </select>
      </SettingRow>
    </Group>
  </Advanced>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 22px;
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

.row-check {
  padding: 5px 10px;
}
</style>
