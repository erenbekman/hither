import {
  addCodexHooks,
  addHooks,
  blockedByAllowList,
  codexHookStatus,
  hookStatus,
  hookUrl,
  parseClaudeSettings,
  removeHooks,
  serializeClaudeSettings,
  type HookStatus,
} from '../core/claude-settings'
import { agentConfigRead, agentConfigWrite, secretGet, secretSet } from '../native'

export const HOOK_TOKEN_KEY = 'hook-token'
export const HOOK_PORT = 47811
const CODEX_FILE = '~/.codex/hooks.json'

export async function hookToken(): Promise<string> {
  const existing = await secretGet(HOOK_TOKEN_KEY)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  await secretSet(HOOK_TOKEN_KEY, token)
  return token
}

export async function readHookStatus(): Promise<{ status: HookStatus; blocked: boolean }> {
  const settings = parseClaudeSettings(await agentConfigRead('claude'))
  const url = hookUrl(HOOK_PORT)
  return { status: hookStatus(settings, url, await hookToken()), blocked: blockedByAllowList(settings, url) }
}

export async function installHooks(): Promise<string | null> {
  const settings = parseClaudeSettings(await agentConfigRead('claude'))
  return agentConfigWrite('claude', serializeClaudeSettings(addHooks(settings, hookUrl(HOOK_PORT), await hookToken())))
}

export async function uninstallHooks(): Promise<string | null> {
  const settings = parseClaudeSettings(await agentConfigRead('claude'))
  return agentConfigWrite('claude', serializeClaudeSettings(removeHooks(settings, hookUrl(HOOK_PORT))))
}

export async function readCodexHookStatus(): Promise<HookStatus | 'unavailable'> {
  let text: string | null
  try {
    text = await agentConfigRead('codex')
  } catch (error) {
    if (error === 'Codex is not installed') return 'unavailable'
    throw error
  }
  return codexHookStatus(parseClaudeSettings(text, CODEX_FILE), hookUrl(HOOK_PORT), await hookToken())
}

export async function changeCodexHooks(install: boolean): Promise<string | null> {
  const settings = parseClaudeSettings(await agentConfigRead('codex'), CODEX_FILE)
  const url = hookUrl(HOOK_PORT)
  const next = install ? addCodexHooks(settings, url, await hookToken()) : removeHooks(settings, url)
  return agentConfigWrite('codex', serializeClaudeSettings(next))
}
