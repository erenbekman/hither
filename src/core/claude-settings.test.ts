import { describe, expect, it, vi } from 'vitest'
import {
  addCodexHooks,
  addHooks,
  blockedByAllowList,
  CODEX_HOOK_EVENTS,
  codexCommand,
  codexHookStatus,
  COPILOT_HOOK_EVENTS,
  copilotHooks,
  opencodePlugin,
  ownedFileStatus,
  HOOK_EVENTS,
  hookStatus,
  hookUrl,
  parseClaudeSettings,
  removeHooks,
  serializeClaudeSettings,
} from './claude-settings'

const url = hookUrl(47811)

const userSettings = {
  model: 'opus',
  permissions: { allow: ['Bash(npm test)'] },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './guard.sh' }] }],
  },
}

describe('parseClaudeSettings', () => {
  it('treats a missing or empty file as empty settings', () => {
    expect(parseClaudeSettings(null)).toEqual({})
    expect(parseClaudeSettings('  ')).toEqual({})
  })

  it('refuses to touch a file that is not a JSON object', () => {
    expect(() => parseClaudeSettings('{ "model": ')).toThrow(expect.objectContaining({ kind: 'unknown' }))
    expect(() => parseClaudeSettings('[]')).toThrow(expect.objectContaining({ kind: 'unknown' }))
  })
})

describe('addHooks', () => {
  it('adds one http hook per event and keeps everything else', () => {
    const merged = addHooks(userSettings, url, 'tok')
    expect(merged.model).toBe('opus')
    expect(merged.permissions).toEqual(userSettings.permissions)
    const hooks = merged.hooks as Record<string, unknown[]>
    expect(Object.keys(hooks).sort()).toEqual([...new Set([...HOOK_EVENTS, 'PreToolUse'])].sort())
    expect(hooks.Stop).toEqual([
      { hooks: [{ type: 'command', command: 'say done' }] },
      {
        hooks: [
          {
            type: 'http',
            url,
            timeout: 5,
            headers: { Authorization: 'Bearer tok', 'X-Hither-Terminal': '$TERM_PROGRAM', 'X-Hither-Terminal-Session': '$ITERM_SESSION_ID' },
            allowedEnvVars: ['TERM_PROGRAM', 'ITERM_SESSION_ID'],
          },
        ],
      },
    ])
    expect(hooks.PreToolUse).toEqual(userSettings.hooks.PreToolUse)
  })

  it('does not change the settings it was given', () => {
    const before = structuredClone(userSettings)
    addHooks(userSettings, url, 'tok')
    expect(userSettings).toEqual(before)
  })

  it('is idempotent and replaces an old token instead of adding a second hook', () => {
    const once = addHooks(userSettings, url, 'old')
    const twice = addHooks(addHooks(once, url, 'new'), url, 'new')
    expect(twice).toEqual(addHooks(userSettings, url, 'new'))
  })

  it('creates the hooks block in a fresh file', () => {
    expect(hookStatus(addHooks({}, url, 'tok'), url, 'tok')).toBe('installed')
  })
})

describe('removeHooks', () => {
  it('restores the settings exactly as they were', () => {
    expect(removeHooks(addHooks(userSettings, url, 'tok'), url)).toEqual(userSettings)
  })

  it('removes the hooks key when Hither added it', () => {
    expect(removeHooks(addHooks({ model: 'opus' }, url, 'tok'), url)).toEqual({ model: 'opus' })
  })

  it('keeps other hooks that share a group with ours', () => {
    const shared = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }, { type: 'http', url }] }] } }
    expect(removeHooks(shared, url)).toEqual({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } })
  })

  it('leaves another http hook alone', () => {
    const other = { hooks: { Stop: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:9999/x' }] }] } }
    expect(removeHooks(other, url)).toEqual(other)
  })
})

describe('hookStatus', () => {
  it('tells installed, missing and outdated apart', () => {
    expect(hookStatus(userSettings, url, 'tok')).toBe('missing')
    const installed = addHooks(userSettings, url, 'tok')
    expect(hookStatus(installed, url, 'tok')).toBe('installed')
    expect(hookStatus(installed, url, 'other')).toBe('outdated')
    const partial = structuredClone(installed) as { hooks: Record<string, unknown> }
    delete partial.hooks.SessionEnd
    expect(hookStatus(partial, url, 'tok')).toBe('outdated')
  })

  it('asks for an update when the hooks do not report the terminal yet', () => {
    const installed = addHooks(userSettings, url, 'tok') as { hooks: Record<string, { hooks: Record<string, unknown>[] }[]> }
    for (const groups of Object.values(installed.hooks)) {
      for (const hook of groups.flatMap((group) => group.hooks)) {
        if (hook.type !== 'http') continue
        hook.headers = { Authorization: 'Bearer tok' }
        delete hook.allowedEnvVars
      }
    }
    expect(hookStatus(installed, url, 'tok')).toBe('outdated')
  })
})

describe('blockedByAllowList', () => {
  it('warns when an allow list exists and does not cover the hook url', () => {
    expect(blockedByAllowList({}, url)).toBe(false)
    expect(blockedByAllowList({ allowedHttpHookUrls: ['https://hooks.example/*'] }, url)).toBe(true)
    expect(blockedByAllowList({ allowedHttpHookUrls: ['http://127.0.0.1:*'] }, url)).toBe(false)
  })
})

describe('serializeClaudeSettings', () => {
  it('writes readable JSON with a trailing newline', () => {
    expect(serializeClaudeSettings({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  })
})

describe('Codex hooks', () => {
  const codexHooks = {
    hooks: {
      PermissionRequest: [{ hooks: [{ type: 'command', command: '/opt/approve', timeout: 7200 }] }],
    },
  }

  it('posts the event to Hither with curl, in the background, never failing Codex', () => {
    const command = codexCommand(url, 'abc123')
    expect(command).toContain("-H 'Authorization: Bearer abc123'")
    expect(command).toContain("-H 'X-Hither-Agent: codex'")
    expect(command).toContain('"X-Hither-Terminal: $TERM_PROGRAM"')
    expect(command).toContain(`--data-binary @- ${url}`)
    expect(command.endsWith('|| true')).toBe(true)
    const merged = addCodexHooks(codexHooks, url, 'abc123') as { hooks: Record<string, unknown[]> }
    expect(Object.keys(merged.hooks).sort()).toEqual([...CODEX_HOOK_EVENTS].sort())
    expect(merged.hooks.PermissionRequest).toEqual([
      codexHooks.hooks.PermissionRequest[0],
      { hooks: [{ type: 'command', command, timeout: 5, async: true }] },
    ])
  })

  it('tells installed, missing and outdated apart and removes only its own commands', () => {
    expect(codexHookStatus(codexHooks, url, 'abc123')).toBe('missing')
    const installed = addCodexHooks(codexHooks, url, 'abc123')
    expect(codexHookStatus(installed, url, 'abc123')).toBe('installed')
    expect(codexHookStatus(installed, url, 'other')).toBe('outdated')
    expect(removeHooks(installed, url)).toEqual(codexHooks)
  })
})


describe('Copilot CLI hooks', () => {
  it('runs the same background curl as Codex on every event Hither follows, under its own name', () => {
    const file = JSON.parse(copilotHooks(url, 'abc123'))
    expect(file.version).toBe(1)
    expect(Object.keys(file.hooks).sort()).toEqual([...COPILOT_HOOK_EVENTS].sort())
    for (const hooks of Object.values(file.hooks)) {
      expect(hooks).toEqual([{ type: 'command', bash: codexCommand(url, 'abc123', 'copilot'), timeoutSec: 5 }])
    }
    expect(codexCommand(url, 'abc123', 'copilot')).toContain("-H 'X-Hither-Agent: copilot'")
  })

  it('knows its own file is installed only while it matches the current token', () => {
    expect(ownedFileStatus(null, copilotHooks(url, 'abc123'))).toBe('missing')
    expect(ownedFileStatus(copilotHooks(url, 'abc123'), copilotHooks(url, 'abc123'))).toBe('installed')
    expect(ownedFileStatus(copilotHooks(url, 'old'), copilotHooks(url, 'abc123'))).toBe('outdated')
  })
})

describe('opencode plugin', () => {
  async function load(token: string) {
    const module = (await import(`data:text/javascript,${encodeURIComponent(opencodePlugin(url, token))}`)) as { Hither: (context: { directory: string }) => Promise<{ event: (input: { event: unknown }) => Promise<void> }> }
    return module.Hither({ directory: '/code/api' })
  }

  it('turns opencode events into the events Hither already understands', async () => {
    const fetchFn = vi.fn(async (_target: string, _init: RequestInit) => new Response(null))
    vi.stubGlobal('fetch', fetchFn)
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app')
    const plugin = await load('abc123')
    const events = [
      { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } },
      { type: 'permission.asked', properties: { id: 'per_1', sessionID: 'ses_1', action: 'bash', resources: ['ls'] } },
      { type: 'permission.replied', properties: { sessionID: 'ses_1', requestID: 'per_1', reply: 'once' } },
      { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'retry', attempt: 1, message: 'busy', next: 2 } } },
      { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } },
      { type: 'session.error', properties: { sessionID: 'ses_1', error: { name: 'ProviderAuthError', data: { message: 'Invalid API key' } } } },
      { type: 'session.deleted', properties: { info: { id: 'ses_1' } } },
      { type: 'file.edited', properties: { file: 'a.ts' } },
      { type: 'session.status', properties: { status: { type: 'busy' } } },
    ]
    for (const event of events) await plugin.event({ event })
    const sent = fetchFn.mock.calls.map(([target, init]) => {
      const { headers, body } = init as RequestInit & { headers: Record<string, string> }
      expect(target).toBe(url)
      expect(headers).toMatchObject({ Authorization: 'Bearer abc123', 'X-Hither-Agent': 'opencode', 'X-Hither-Terminal': 'iTerm.app' })
      return JSON.parse(String(body))
    })
    expect(sent).toEqual([
      { session_id: 'ses_1', hook_event_name: 'UserPromptSubmit', cwd: '/code/api' },
      { session_id: 'ses_1', hook_event_name: 'PermissionRequest', cwd: '/code/api', tool_name: 'bash' },
      { session_id: 'ses_1', hook_event_name: 'PostToolUse', cwd: '/code/api' },
      { session_id: 'ses_1', hook_event_name: 'Stop', cwd: '/code/api' },
      { session_id: 'ses_1', hook_event_name: 'StopFailure', cwd: '/code/api', error: 'Invalid API key' },
      { session_id: 'ses_1', hook_event_name: 'SessionEnd', cwd: '/code/api' },
    ])
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('never breaks opencode when Hither is not running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('connection refused'))))
    const plugin = await load('quiet')
    await expect(plugin.event({ event: { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } } })).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
