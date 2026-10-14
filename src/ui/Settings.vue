<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import type { Store } from '@tauri-apps/plugin-store'
import { toAppError, type AppError } from '../core/errors'
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../core/settings'
import { fetchOrganizations, KIND_ORDER, KIND_TITLES } from '../sources/github'
import { ghToken, openTemplates, secretDelete, secretGet, secretSet } from '../native'
import { FORGE_TOKEN_KEY, listForgeOrganizations, listForgeServers } from '../sources/forge'
import { SENTRY_TOKEN_KEY } from '../sources/sentry'
import ErrorRow from './ErrorRow.vue'
import type { HookStatus } from '../core/claude-settings'
import { installHooks, readHookStatus, uninstallHooks } from './hooks'
import { announceSettingsChanged, openSettingsStore, readSettings, writeSettings } from './settings-store'

const state = reactive<{
  settings: Settings
  organizations: string[]
  forgeOrgs: { slug: string; name: string }[]
  forgeServers: { id: string; name: string }[]
  tokens: Record<string, boolean>
  tokenInput: Record<string, string>
  hooks?: HookStatus
  hooksBlocked: boolean
  backup?: string
  loaded: boolean
  saved: boolean
  errors: AppError[]
}>({
  settings: { ...DEFAULT_SETTINGS },
  organizations: [],
  forgeOrgs: [],
  forgeServers: [],
  tokens: {},
  tokenInput: {},
  hooksBlocked: false,
  loaded: false,
  saved: false,
  errors: [],
})

let store: Store | undefined

const lines = (text: string) => text.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)

const accounts = computed({
  get: () => state.settings.accounts.join(', '),
  set: (text: string) => (state.settings.accounts = lines(text)),
})
const repoList = computed({
  get: () => state.settings.repoList.join('\n'),
  set: (text: string) => (state.settings.repoList = lines(text)),
})
const watchedRepos = computed({
  get: () => state.settings.watchedRepos.join('\n'),
  set: (text: string) => (state.settings.watchedRepos = lines(text)),
})
const sentryProjects = computed({
  get: () => state.settings.sentryProjects.join(', '),
  set: (text: string) => (state.settings.sentryProjects = lines(text)),
})
const agentLogins = computed({
  get: () => state.settings.agentLogins.join(', '),
  set: (text: string) => (state.settings.agentLogins = lines(text)),
})
const agentBranchPrefixes = computed({
  get: () => state.settings.agentBranchPrefixes.join(', '),
  set: (text: string) => (state.settings.agentBranchPrefixes = lines(text)),
})
const siteLinks = computed({
  get: () =>
    Object.entries(state.settings.sentryProjectForSite)
      .map(([site, project]) => `${site} = ${project}`)
      .join('\n'),
  set: (text: string) =>
    (state.settings.sentryProjectForSite = Object.fromEntries(
      text
        .split('\n')
        .map((line) => line.split('=').map((part) => part.trim()))
        .filter((parts) => parts.length === 2 && parts[0] && parts[1]),
    )),
})
const HOOK_LABELS: Record<HookStatus, string> = {
  installed: 'Installed',
  missing: 'Not installed',
  outdated: 'Out of date',
}
const allOrganizations = computed(() => [...new Set([...state.organizations, ...state.settings.organizations])])

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value)
}

async function attempt(task: () => Promise<void>) {
  try {
    await task()
  } catch (error) {
    state.errors.push(toAppError(error))
  }
}

async function loadForge() {
  const token = await secretGet(FORGE_TOKEN_KEY)
  if (!token) return
  await attempt(async () => {
    state.forgeOrgs = await listForgeOrganizations(token, httpFetch)
    if (!state.settings.forgeOrg && state.forgeOrgs.length === 1) state.settings.forgeOrg = state.forgeOrgs[0].slug
  })
  if (state.settings.forgeOrg) {
    await attempt(async () => {
      state.forgeServers = await listForgeServers(token, state.settings.forgeOrg, httpFetch)
    })
  }
}

async function saveToken(key: string) {
  const value = state.tokenInput[key]?.trim()
  if (!value) return
  await attempt(async () => {
    await secretSet(key, value)
    state.tokenInput[key] = ''
    state.tokens[key] = true
    if (key === FORGE_TOKEN_KEY) await loadForge()
  })
}

async function forgetToken(key: string) {
  await attempt(async () => {
    await secretDelete(key)
    state.tokens[key] = false
  })
}

async function refreshHookStatus() {
  await attempt(async () => {
    const { status, blocked } = await readHookStatus()
    state.hooks = status
    state.hooksBlocked = blocked
  })
}

async function changeHooks(install: boolean) {
  await attempt(async () => {
    state.backup = (await (install ? installHooks() : uninstallHooks())) ?? undefined
    await announceSettingsChanged()
  })
  await refreshHookStatus()
}

async function chooseForgeOrg(slug: string) {
  state.settings.forgeOrg = slug
  state.settings.forgeServers = []
  state.forgeServers = []
  await loadForge()
}

onMounted(async () => {
  await attempt(async () => {
    store = await openSettingsStore()
    state.settings = await readSettings(store)
    state.loaded = true
  })
  await attempt(async () => {
    for (const key of [FORGE_TOKEN_KEY, SENTRY_TOKEN_KEY]) state.tokens[key] = (await secretGet(key)) !== null
  })
  await attempt(async () => {
    state.organizations = await fetchOrganizations(await ghToken())
  })
  await refreshHookStatus()
  await loadForge()
})

async function save() {
  if (!store) return
  try {
    state.settings = normalizeSettings({ ...state.settings })
    await writeSettings(store, state.settings)
    state.saved = true
    setTimeout(() => (state.saved = false), 1500)
  } catch (error) {
    state.errors.push(toAppError(error))
  }
}
</script>

<template>
  <main class="settings">
    <ErrorRow v-for="(error, i) in state.errors" :key="i" :error="error" />

    <fieldset :disabled="!state.loaded">
      <h2>General</h2>
      <label class="line">
        Refresh every
        <input v-model.number="state.settings.refreshMinutes" type="number" min="1" class="number" />
        minutes
      </label>
      <label class="line"><input v-model="state.settings.notifications" type="checkbox" /> Notify me about new items</label>

      <h2>Scope</h2>
      <label class="block">
        Accounts <span class="hint">comma separated; @me is you</span>
        <input v-model.lazy="accounts" type="text" />
      </label>
      <div class="block">
        Organizations <span class="hint">selecting one searches it instead of the accounts</span>
        <label v-for="org in allOrganizations" :key="org" class="line">
          <input
            type="checkbox"
            :checked="state.settings.organizations.includes(org)"
            @change="state.settings.organizations = toggle(state.settings.organizations, org, ($event.target as HTMLInputElement).checked)"
          />
          {{ org }}
        </label>
        <span v-if="allOrganizations.length === 0" class="hint">No organizations</span>
      </div>
      <label class="block">
        Repositories <span class="hint">one per line, owner/name or name</span>
        <textarea v-model.lazy="repoList" rows="4" />
      </label>
      <div class="line">
        <label><input v-model="state.settings.repoListIsAllowList" type="radio" :value="false" /> Hide these</label>
        <label><input v-model="state.settings.repoListIsAllowList" type="radio" :value="true" /> Only these</label>
      </div>

      <label class="block">
        Watch the main branch of <span class="hint">owner/name, one per line; a red build shows under Outgoing</span>
        <textarea v-model.lazy="watchedRepos" rows="3" />
      </label>

      <h2>Forge</h2>
      <label class="line"><input v-model="state.settings.forgeEnabled" type="checkbox" /> Watch Forge deployments</label>
      <template v-if="state.settings.forgeEnabled">
        <div class="block">
          API token
          <span class="hint">{{ state.tokens[FORGE_TOKEN_KEY] ? 'Saved in Keychain' : 'Create one at forge.laravel.com/profile/api' }}</span>
          <div class="line">
            <input v-model="state.tokenInput[FORGE_TOKEN_KEY]" type="password" placeholder="Paste a new token" autocomplete="off" />
            <button @click="saveToken(FORGE_TOKEN_KEY)">Save token</button>
            <button v-if="state.tokens[FORGE_TOKEN_KEY]" @click="forgetToken(FORGE_TOKEN_KEY)">Remove</button>
          </div>
        </div>
        <label v-if="state.forgeOrgs.length > 0" class="block">
          Organization
          <select :value="state.settings.forgeOrg" @change="chooseForgeOrg(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>Choose…</option>
            <option v-for="org in state.forgeOrgs" :key="org.slug" :value="org.slug">{{ org.name }}</option>
          </select>
        </label>
        <div v-if="state.forgeServers.length > 0" class="block">
          Servers
          <label v-for="server in state.forgeServers" :key="server.id" class="line">
            <input
              type="checkbox"
              :checked="state.settings.forgeServers.includes(server.id)"
              @change="state.settings.forgeServers = toggle(state.settings.forgeServers, server.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ server.name }}
          </label>
        </div>
      </template>

      <h2>Sentry</h2>
      <label class="line"><input v-model="state.settings.sentryEnabled" type="checkbox" /> Watch Sentry errors</label>
      <template v-if="state.settings.sentryEnabled">
        <div class="block">
          Auth token
          <span class="hint">{{ state.tokens[SENTRY_TOKEN_KEY] ? 'Saved in Keychain' : 'Needs the event:read scope' }}</span>
          <div class="line">
            <input v-model="state.tokenInput[SENTRY_TOKEN_KEY]" type="password" placeholder="Paste a new token" autocomplete="off" />
            <button @click="saveToken(SENTRY_TOKEN_KEY)">Save token</button>
            <button v-if="state.tokens[SENTRY_TOKEN_KEY]" @click="forgetToken(SENTRY_TOKEN_KEY)">Remove</button>
          </div>
        </div>
        <label class="block">
          Organization slug
          <input v-model.trim="state.settings.sentryOrg" type="text" />
        </label>
        <label class="block">
          Projects <span class="hint">comma separated slugs; empty means all</span>
          <input v-model.lazy="sentryProjects" type="text" />
        </label>
        <label class="block">
          Forge site → Sentry project
          <span class="hint">one per line, e.g. ustad.app = ustad-api; links new errors to the deploy before them</span>
          <textarea v-model.lazy="siteLinks" rows="3" />
        </label>
      </template>

      <h2>Suggestions</h2>
      <div class="block">
        Prompt templates
        <span class="hint">Markdown files; prompts carry only ids such as repo and PR number, never titles or logs</span>
        <div class="line"><button type="button" @click="attempt(openTemplates)">Open templates folder</button></div>
      </div>

      <h2>Claude Code</h2>
      <div class="block">
        Hooks in ~/.claude/settings.json
        <span class="hint">
          {{ state.hooks ? HOOK_LABELS[state.hooks] : 'Checking…' }} · Hither listens on 127.0.0.1 only; your other hooks stay as they are
        </span>
        <div class="line">
          <button type="button" @click="changeHooks(true)">{{ state.hooks === 'missing' ? 'Install hooks' : 'Reinstall hooks' }}</button>
          <button v-if="state.hooks && state.hooks !== 'missing'" type="button" @click="changeHooks(false)">Remove hooks</button>
        </div>
        <span v-if="state.backup" class="hint">Previous file saved as {{ state.backup }}</span>
        <span v-if="state.hooksBlocked" class="hint warn">allowedHttpHookUrls does not include http://127.0.0.1:47811/hook</span>
      </div>
      <label class="block">
        Agent accounts <span class="hint">pull requests by these logins show under Agents</span>
        <input v-model.lazy="agentLogins" type="text" />
      </label>
      <label class="block">
        Agent branch prefixes <span class="hint">pull requests from these branches show under Agents</span>
        <input v-model.lazy="agentBranchPrefixes" type="text" />
      </label>

      <h2>Display</h2>
      <label v-for="kind in KIND_ORDER" :key="kind" class="line">
        <input
          type="checkbox"
          :checked="!state.settings.hiddenKinds.includes(kind)"
          @change="state.settings.hiddenKinds = toggle(state.settings.hiddenKinds, kind, !($event.target as HTMLInputElement).checked)"
        />
        {{ KIND_TITLES[kind] }}
      </label>
      <label class="line"><input v-model="state.settings.showBots" type="checkbox" /> Show bot pull requests</label>
      <label class="line"><input v-model="state.settings.showDrafts" type="checkbox" /> Show drafts</label>
      <label class="line">
        Fold a repository with more than
        <input v-model.number="state.settings.repoGroupThreshold" type="number" min="0" class="number" />
        items (0 never folds)
      </label>
    </fieldset>

    <footer>
      <span v-if="state.saved" class="hint">Saved</span>
      <button :disabled="!state.loaded" @click="save">Save</button>
    </footer>
  </main>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

fieldset {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 4px 20px 12px;
  border: 0;
}

h2 {
  margin: 16px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
}

.hint {
  color: var(--muted);
  font-size: 11px;
}

input[type='text'],
input[type='password'],
select,
textarea {
  font: inherit;
  padding: 4px 6px;
}

.warn {
  color: var(--error-fg);
}

.number {
  width: 56px;
}

footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid var(--line);
}
</style>
