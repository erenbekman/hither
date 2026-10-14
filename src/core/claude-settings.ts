import type { AppError } from './errors'

export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'PostToolUse', 'Stop', 'StopFailure', 'SessionEnd'] as const
export const HOOK_TIMEOUT_SECONDS = 5
export const TERMINAL_HEADER = 'X-Hither-Terminal'
export const TERMINAL_SESSION_HEADER = 'X-Hither-Terminal-Session'
export const CODEX_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'PostToolUse', 'Stop', 'SessionEnd'] as const

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export const hookUrl = (port: number) => `http://127.0.0.1:${port}/hook`

export type HookStatus = 'installed' | 'missing' | 'outdated'

export function parseClaudeSettings(text: string | null, file = '~/.claude/settings.json'): Json {
  if (text === null || text.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw { kind: 'unknown', message: `${file} is not valid JSON; Hither left it untouched` } satisfies AppError
  }
  if (!isObject(parsed)) {
    throw { kind: 'unknown', message: `${file} is not a JSON object; Hither left it untouched` } satisfies AppError
  }
  return parsed
}

const isOurs = (hook: unknown, url: string) =>
  isObject(hook) &&
  ((hook.type === 'http' && hook.url === url) || (hook.type === 'command' && typeof hook.command === 'string' && hook.command.includes(url)))

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
      {
        hooks: [
          {
            type: 'http',
            url,
            timeout: HOOK_TIMEOUT_SECONDS,
            headers: { Authorization: `Bearer ${token}`, [TERMINAL_HEADER]: '$TERM_PROGRAM', [TERMINAL_SESSION_HEADER]: '$ITERM_SESSION_ID' },
            allowedEnvVars: ['TERM_PROGRAM', 'ITERM_SESSION_ID'],
          },
        ],
      },
    ]
  }
  result.hooks = hooks
  return result
}

export function hookStatus(settings: Json, url: string, token: string): HookStatus {
  const ours = ourHooks(settings, url, HOOK_EVENTS)
  if (ours.every((list) => list.length === 0)) return 'missing'
  const current = ours.every(
    ([hook, ...rest]) =>
      rest.length === 0 &&
      isObject(hook?.headers) &&
      hook.headers.Authorization === `Bearer ${token}` &&
      hook.headers[TERMINAL_HEADER] === '$TERM_PROGRAM' &&
      hook.headers[TERMINAL_SESSION_HEADER] === '$ITERM_SESSION_ID' &&
      Array.isArray(hook.allowedEnvVars) &&
      hook.allowedEnvVars.includes('TERM_PROGRAM') &&
      hook.allowedEnvVars.includes('ITERM_SESSION_ID'),
  )
  return current ? 'installed' : 'outdated'
}

export const codexCommand = (url: string, token: string) =>
  [
    '/usr/bin/curl -sS -m 2 -o /dev/null',
    `-H 'Authorization: Bearer ${token}'`,
    "-H 'Content-Type: application/json'",
    "-H 'X-Hither-Agent: codex'",
    `-H "${TERMINAL_HEADER}: $TERM_PROGRAM"`,
    `-H "${TERMINAL_SESSION_HEADER}: $ITERM_SESSION_ID"`,
    `--data-binary @- ${url} || true`,
  ].join(' ')

function ourHooks(settings: Json, url: string, events: readonly string[]): Json[][] {
  const hooks = isObject(settings.hooks) ? settings.hooks : {}
  return events.map((event) => {
    const groups = hooks[event]
    if (!Array.isArray(groups)) return []
    return groups.flatMap((group) => (isObject(group) && Array.isArray(group.hooks) ? group.hooks.filter((hook): hook is Json => isOurs(hook, url)) : []))
  })
}

export function addCodexHooks(settings: Json, url: string, token: string): Json {
  const result = removeHooks(settings, url)
  const hooks: Json = isObject(result.hooks) ? result.hooks : {}
  for (const event of CODEX_HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : []
    hooks[event] = [...groups, { hooks: [{ type: 'command', command: codexCommand(url, token), timeout: HOOK_TIMEOUT_SECONDS, async: true }] }]
  }
  result.hooks = hooks
  return result
}

export function codexHookStatus(settings: Json, url: string, token: string): HookStatus {
  const ours = ourHooks(settings, url, CODEX_HOOK_EVENTS)
  if (ours.every((list) => list.length === 0)) return 'missing'
  const command = codexCommand(url, token)
  return ours.every(([hook, ...rest]) => rest.length === 0 && hook?.command === command && hook.async === true) ? 'installed' : 'outdated'
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
