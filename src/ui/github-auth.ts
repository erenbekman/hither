import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { toAppError } from '../core/errors'
import { GITHUB_CLIENT_ID } from '../core/github-app'
import { copyText, ghToken, openUrl, secretDelete, secretGet, secretSet } from '../native'
import { pollToken, requestDeviceCode, signInScopes, type DeviceCode } from '../sources/github/device-flow'
import { announceAccountChanged, announceSettingsChanged } from './settings-store'

export const GITHUB_TOKEN_KEY = 'github-token'

export interface GitHubAccount {
  login: string
  avatar?: string
  source: 'oauth' | 'gh'
}

export async function githubToken(): Promise<string> {
  return (await secretGet(GITHUB_TOKEN_KEY)) ?? ghToken()
}

export async function currentAccount(): Promise<GitHubAccount> {
  const saved = await secretGet(GITHUB_TOKEN_KEY)
  const token = saved ?? (await ghToken())
  let response: Response
  try {
    response = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  } catch (error) {
    throw { kind: 'network', message: error instanceof Error ? error.message : String(error), service: 'GitHub' }
  }
  if (response.status === 401) throw { kind: 'github-unauthorized' }
  if (!response.ok) throw { kind: 'github-status', status: response.status }
  const body = (await response.json()) as { login?: unknown; avatar_url?: unknown }
  if (typeof body.login !== 'string') throw { kind: 'github-parse', message: 'no login in /user' }
  return { login: body.login, avatar: typeof body.avatar_url === 'string' ? body.avatar_url : undefined, source: saved ? 'oauth' : 'gh' }
}

const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

export function signInWithGitHub(privateRepositories: boolean, onCode: (code: DeviceCode) => void) {
  let cancelled = false
  const done = (async () => {
    const code = await requestDeviceCode(GITHUB_CLIENT_ID, signInScopes(privateRepositories), httpFetch)
    onCode(code)
    await copyText(code.userCode).catch(() => undefined)
    await openUrl(code.verificationUri)
    const expires = Date.now() + code.expiresIn * 1000
    let interval = code.interval
    while (!cancelled && Date.now() < expires) {
      await wait(interval)
      if (cancelled) break
      const outcome = await pollToken(GITHUB_CLIENT_ID, code.deviceCode, interval, httpFetch)
      if (outcome.kind === 'token') {
        await secretSet(GITHUB_TOKEN_KEY, outcome.token)
        await announceSettingsChanged()
        await announceAccountChanged()
        return
      }
      if (outcome.kind === 'failed') throw { kind: 'unknown', message: outcome.message }
      interval = outcome.interval
    }
    if (!cancelled) throw { kind: 'unknown', message: 'The code expired. Try again.' }
  })().catch((error) => {
    throw toAppError(error)
  })
  return {
    done,
    cancel: () => {
      cancelled = true
    },
  }
}

export async function signOutOfGitHub() {
  await secretDelete(GITHUB_TOKEN_KEY)
  await announceSettingsChanged()
  await announceAccountChanged()
}
