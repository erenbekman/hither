import { invoke } from '@tauri-apps/api/core'

export const ghToken = () => invoke<string>('gh_token')
export const secretGet = (key: string) => invoke<string | null>('secret_get', { key })
export const secretSet = (key: string, value: string) => invoke<void>('secret_set', { key, value })
export const secretDelete = (key: string) => invoke<void>('secret_delete', { key })
export const openUrl = (url: string) => invoke<void>('open_url', { url })
export const setBadge = (count: number) => invoke<void>('set_badge', { count })
export const revealPanel = () => invoke<void>('reveal_panel')
