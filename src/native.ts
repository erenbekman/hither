import { invoke } from '@tauri-apps/api/core'
import type { TrayState } from './core/board'

export const ghToken = () => invoke<string>('gh_token')
export const secretGet = (key: string) => invoke<string | null>('secret_get', { key })
export const secretSet = (key: string, value: string) => invoke<void>('secret_set', { key, value })
export const secretDelete = (key: string) => invoke<void>('secret_delete', { key })
export const openUrl = (url: string) => invoke<void>('open_url', { url })
export const copyText = (text: string) => invoke<void>('copy_text', { text })
export const setTray = (count: number, state: TrayState) => invoke<void>('set_tray', { count, state })
export const revealPanel = () => invoke<void>('reveal_panel')
export const startHookListener = (token: string) => invoke<number>('start_hook_listener', { token })
export const claudeSettingsRead = () => invoke<string | null>('claude_settings_read')
export const claudeSettingsWrite = (content: string) => invoke<string | null>('claude_settings_write', { content })
export interface GitRepo {
  root: string
  remote: string
}
export const gitRepo = (path: string) => invoke<GitRepo | null>('git_repo', { path })
export const launchClaude = (folder: string, prompt: string, attachment: string | undefined, terminal: string) =>
  invoke<void>('launch_claude', { folder, prompt, attachment: attachment ?? null, terminal })
export const claudePrint = (folder: string | undefined, prompt: string) => invoke<string>('claude_print', { folder: folder ?? null, prompt })
export const focusTerminal = (terminal: string) => invoke<void>('focus_terminal', { terminal })
export const checkoutPullRequest = (folder: string, number: number, terminal: string) =>
  invoke<void>('checkout_pr', { folder, number, terminal })
export const syncTemplates = (defaults: Record<string, string>) => invoke<Record<string, string>>('sync_templates', { defaults })
export const openTemplates = () => invoke<void>('open_templates')
export const restartApp = () => invoke<void>('restart_app')
export const openSettings = () => invoke<void>('open_settings_window')
export const launchAtLogin = () => invoke<boolean>('launch_at_login')
export const setLaunchAtLogin = (enabled: boolean) => invoke<void>('set_launch_at_login', { enabled })
