<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue'
import type { AppError } from '../../core/errors'
import { toAppError } from '../../core/errors'
import { GITHUB_CLIENT_ID } from '../../core/github-app'
import { copyText, openUrl, secretGet } from '../../native'
import type { DeviceCode } from '../../sources/github/device-flow'
import Avatar from '../components/Avatar.vue'
import Banner from '../components/Banner.vue'
import { currentAccount, GITHUB_TOKEN_KEY, signInWithGitHub, signOutOfGitHub, type GitHubAccount } from '../github-auth'
import SettingRow from './SettingRow.vue'

const state = reactive<{
  account?: GitHubAccount
  checked: boolean
  signedOut: boolean
  savedToken: boolean
  rejected: boolean
  code?: DeviceCode
  copied: boolean
  includePrivate: boolean
  error?: AppError
}>({ checked: false, signedOut: false, savedToken: false, rejected: false, copied: false, includePrivate: true })

let cancel: (() => void) | undefined

async function refresh() {
  state.error = undefined
  try {
    state.savedToken = (await secretGet(GITHUB_TOKEN_KEY)) !== null
    state.account = await currentAccount()
    state.signedOut = false
    state.rejected = false
  } catch (error) {
    const appError = toAppError(error)
    state.account = undefined
    state.signedOut = appError.kind === 'gh-not-found' || appError.kind === 'gh-not-authenticated'
    state.rejected = state.savedToken && appError.kind === 'github-unauthorized'
    if (!state.signedOut && !state.rejected) state.error = appError
  } finally {
    state.checked = true
  }
}

async function signIn() {
  state.error = undefined
  const flow = signInWithGitHub(state.includePrivate, (code) => (state.code = code))
  cancel = flow.cancel
  try {
    await flow.done
    await refresh()
  } catch (error) {
    state.error = toAppError(error)
  } finally {
    state.code = undefined
    cancel = undefined
  }
}

function stopSignIn() {
  cancel?.()
  state.code = undefined
}

async function signOut() {
  try {
    await signOutOfGitHub()
    await refresh()
  } catch (error) {
    state.error = toAppError(error)
  }
}

async function copyCode() {
  if (!state.code) return
  await copyText(state.code.userCode)
  state.copied = true
}

onMounted(refresh)
onUnmounted(() => cancel?.())
</script>

<template>
  <SettingRow v-if="state.code" label="Enter this code on GitHub" hint="It is on your clipboard, and GitHub is open in your browser" stacked>
    <div class="code-row">
      <code class="code selectable">{{ state.code.userCode }}</code>
      <button class="button" @click="copyCode()">{{ state.copied ? 'Copied' : 'Copy' }}</button>
    </div>
    <span class="waiting">Waiting for you to approve on GitHub…</span>
    <div class="actions">
      <button class="button" @click="openUrl(state.code.verificationUri)">Open GitHub Again</button>
      <button class="button" @click="stopSignIn()">Cancel</button>
    </div>
  </SettingRow>

  <SettingRow
    v-else-if="state.account"
    :label="`@${state.account.login}`"
    :hint="state.account.source === 'oauth' ? 'Signed in with GitHub' : 'Using the GitHub CLI account'"
  >
    <Avatar :login="state.account.login" :url="state.account.avatar" :size="22" />
    <button v-if="state.account.source === 'oauth'" class="button" @click="signOut()">Sign Out</button>
    <button v-else-if="GITHUB_CLIENT_ID" class="button" @click="signIn()">Sign In with GitHub Instead</button>
  </SettingRow>

  <template v-else-if="state.signedOut">
    <SettingRow
      label="Not signed in"
      :hint="GITHUB_CLIENT_ID ? 'Sign in with GitHub, or install the GitHub CLI and run gh auth login' : 'Install the GitHub CLI and run gh auth login'"
    >
      <button v-if="GITHUB_CLIENT_ID" class="button primary" @click="signIn()">Sign In with GitHub</button>
    </SettingRow>
    <SettingRow v-if="GITHUB_CLIENT_ID" label="Include private repositories" hint="Otherwise Hither sees public repositories only">
      <input v-model="state.includePrivate" type="checkbox" aria-label="Include private repositories" />
    </SettingRow>
  </template>

  <SettingRow v-else-if="state.rejected" label="The saved GitHub sign-in no longer works" hint="Sign out to use the GitHub CLI, or sign in again">
    <button class="button" @click="signOut()">Sign Out</button>
    <button v-if="GITHUB_CLIENT_ID" class="button primary" @click="signIn()">Sign In Again</button>
  </SettingRow>

  <SettingRow v-else-if="!state.checked" label="Checking…" />

  <Banner v-if="state.error" tone="error" :error="state.error" class="flush" />
</template>

<style scoped>
.code-row,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.code {
  font: 600 20px ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}

.waiting {
  color: var(--fg-3);
  font-size: 11.5px;
}

.flush {
  margin: 0 10px 8px;
}
</style>
