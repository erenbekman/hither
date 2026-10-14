import type { AppError } from './errors'

export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'PostToolUse', 'Stop', 'StopFailure', 'SessionEnd'] as const
export const HOOK_TIMEOUT_SECONDS = 5

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export const hookUrl = (port: number) => `http://127.0.0.1:${port}/hook`

export type HookStatus = 'installed' | 'missing' | 'outdated'

export function parseClaudeSettings(text: string | null): Json {
  if (text === null || text.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw { kind: 'unknown', message: '~/.claude/settings.json is not valid JSON; Hither left it untouched' } satisfies AppError
  }
  if (!isObject(parsed)) {
    throw { kind: 'unknown', message: '~/.claude/settings.json is not a JSON object; Hither left it untouched' } satisfies AppError
  }
  return parsed
}

const isOurs = (hook: unknown, url: string) => isObject(hook) && hook.type === 'http' && hook.url === url

export function removeHooks(settings: Json, url: string): Json {
  const result: Json = structuredClone(settings)
  if (!isObject(result.hooks)) return result
  const hooks = result.hooks
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue
    const kept = groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return [group]
      const remaining = group.hooks.filter((hook) => !isOurs(hook, url))
      if (remaining.length === group.hooks.length) return [group]
      return remaining.length > 0 ? [{ ...group, hooks: remaining }] : []
    })
    if (kept.length > 0) hooks[event] = kept
    else delete hooks[event]
  }
  if (Object.keys(hooks).length === 0) delete result.hooks
  return result
}

export function addHooks(settings: Json, url: string, token: string): Json {
  const result = removeHooks(settings, url)
  const hooks: Json = isObject(result.hooks) ? result.hooks : {}
  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : []
    hooks[event] = [
      ...groups,
      { hooks: [{ type: 'http', url, timeout: HOOK_TIMEOUT_SECONDS, headers: { Authorization: `Bearer ${token}` } }] },
    ]
  }
  result.hooks = hooks
  return result
}

export function hookStatus(settings: Json, url: string, token: string): HookStatus {
  if (!isObject(settings.hooks)) return 'missing'
  const ours = HOOK_EVENTS.map((event) => {
    const groups = settings.hooks && isObject(settings.hooks) ? settings.hooks[event] : undefined
    if (!Array.isArray(groups)) return []
    return groups.flatMap((group) => (isObject(group) && Array.isArray(group.hooks) ? group.hooks.filter((hook) => isOurs(hook, url)) : []))
  })
  if (ours.every((list) => list.length === 0)) return 'missing'
  const current = ours.every(
    (list) => list.length === 1 && isObject(list[0].headers) && list[0].headers.Authorization === `Bearer ${token}`,
  )
  return current ? 'installed' : 'outdated'
}

export function blockedByAllowList(settings: Json, url: string): boolean {
  const allowed = settings.allowedHttpHookUrls
  if (!Array.isArray(allowed)) return false
  return !allowed.some((pattern) => {
    if (typeof pattern !== 'string') return false
    const regex = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
    return regex.test(url)
  })
}

export const serializeClaudeSettings = (settings: Json) => `${JSON.stringify(settings, null, 2)}\n`
