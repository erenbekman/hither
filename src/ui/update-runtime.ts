import { reactive } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { toAppError, type AppError } from '../core/errors'
import { restartApp } from '../native'

const CHECK_EVERY_MS = 6 * 3_600_000

export interface UpdateState {
  current?: string
  available?: { version: string; notes?: string }
  checking: boolean
  installing: boolean
  checkedAt?: string
  error?: AppError
}

const asError = (error: unknown): AppError =>
  typeof error === 'string' ? { kind: 'unknown', message: error } : toAppError(error)

export function startUpdates({ periodic }: { periodic: boolean }) {
  const state = reactive<UpdateState>({ checking: false, installing: false })
  let pending: Update | null = null

  async function checkNow() {
    state.checking = true
    try {
      state.current ??= await getVersion()
      pending = await check()
      state.available = pending ? { version: pending.version, notes: pending.body ?? undefined } : undefined
      state.error = undefined
      state.checkedAt = new Date().toISOString()
    } catch (error) {
      state.error = asError(error)
    } finally {
      state.checking = false
    }
  }

  async function install() {
    if (!pending) return
    state.installing = true
    try {
      await pending.downloadAndInstall()
      await restartApp()
    } catch (error) {
      state.error = asError(error)
      state.installing = false
    }
  }

  void checkNow()
  if (periodic) setInterval(() => void checkNow(), CHECK_EVERY_MS)

  return { state, checkNow, install }
}
