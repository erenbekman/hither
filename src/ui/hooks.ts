import { addHooks, blockedByAllowList, hookStatus, hookUrl, parseClaudeSettings, removeHooks, serializeClaudeSettings, type HookStatus } from '../core/claude-settings'
import { claudeSettingsRead, claudeSettingsWrite, secretGet, secretSet } from '../native'

export const HOOK_TOKEN_KEY = 'hook-token'
export const HOOK_PORT = 47811

export async function hookToken(): Promise<string> {
  const existing = await secretGet(HOOK_TOKEN_KEY)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  await secretSet(HOOK_TOKEN_KEY, token)
  return token
}

export async function readHookStatus(): Promise<{ status: HookStatus; blocked: boolean }> {
  const settings = parseClaudeSettings(await claudeSettingsRead())
  const url = hookUrl(HOOK_PORT)
  return { status: hookStatus(settings, url, await hookToken()), blocked: blockedByAllowList(settings, url) }
}

export async function installHooks(): Promise<string | null> {
  const settings = parseClaudeSettings(await claudeSettingsRead())
  return claudeSettingsWrite(serializeClaudeSettings(addHooks(settings, hookUrl(HOOK_PORT), await hookToken())))
}

export async function uninstallHooks(): Promise<string | null> {
  const settings = parseClaudeSettings(await claudeSettingsRead())
  return claudeSettingsWrite(serializeClaudeSettings(removeHooks(settings, hookUrl(HOOK_PORT))))
}
