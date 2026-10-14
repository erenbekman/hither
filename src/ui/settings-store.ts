import { emit, listen } from '@tauri-apps/api/event'
import { load, type Store } from '@tauri-apps/plugin-store'
import { normalizeSettings, type Settings } from '../core/settings'

const SETTINGS_CHANGED = 'settings-changed'
export const REPOS_FILE = 'repos.json'

export const openSettingsStore = () => load('settings.json', { defaults: {}, autoSave: false })

export async function readSettings(store: Store): Promise<Settings> {
  return normalizeSettings(Object.fromEntries(await store.entries()))
}

export async function writeSettings(store: Store, values: Partial<Settings>): Promise<void> {
  for (const [key, value] of Object.entries(values)) await store.set(key, value)
  await store.save()
  await announceSettingsChanged()
}

export const announceSettingsChanged = () => emit(SETTINGS_CHANGED)

export const onSettingsChanged = (handler: () => void) => listen(SETTINGS_CHANGED, handler)
