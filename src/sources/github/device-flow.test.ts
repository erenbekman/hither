import { describe, expect, it, vi } from 'vitest'
import { pollToken, requestDeviceCode, signInScopes } from './device-flow'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('signInScopes', () => {
  it('asks for private repositories only when you want them', () => {
    expect(signInScopes(true)).toEqual(['repo', 'read:org', 'notifications'])
    expect(signInScopes(false)).toEqual(['public_repo', 'read:org', 'notifications'])
  })
})

describe('requestDeviceCode', () => {
  it('asks GitHub for a code with the client id and scopes', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      json({ device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }),
    )
    const code = await requestDeviceCode('client', ['repo', 'read:org'], fetchFn)
    expect(code).toEqual({ deviceCode: 'dev', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5 })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://github.com/login/device/code')
    expect(String(init?.body)).toBe('client_id=client&scope=repo+read%3Aorg')
    expect((init?.headers as Record<string, string>).Accept).toBe('application/json')
  })

  it('explains a refused client id', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'device_flow_disabled', error_description: 'Device Flow must be explicitly enabled' }))
    await expect(requestDeviceCode('client', [], fetchFn)).rejects.toEqual({ kind: 'unknown', message: 'Device Flow must be explicitly enabled' })
  })
})

describe('pollToken', () => {
  const poll = (body: unknown) => pollToken('client', 'dev', 5, vi.fn<typeof fetch>().mockResolvedValue(json(body)))

  it('returns the token once you approve', async () => {
    expect(await poll({ access_token: 'gho_x', token_type: 'bearer', scope: 'repo' })).toEqual({ kind: 'token', token: 'gho_x' })
  })

  it('keeps waiting, and slows down when GitHub asks', async () => {
    expect(await poll({ error: 'authorization_pending' })).toEqual({ kind: 'pending', interval: 5 })
    expect(await poll({ error: 'slow_down', interval: 10 })).toEqual({ kind: 'pending', interval: 10 })
    expect(await poll({ error: 'slow_down' })).toEqual({ kind: 'pending', interval: 10 })
  })

  it('stops with a reason when the code expires or you decline', async () => {
    expect(await poll({ error: 'expired_token' })).toEqual({ kind: 'failed', message: 'The code expired. Try again.' })
    expect(await poll({ error: 'access_denied' })).toEqual({ kind: 'failed', message: 'Access was denied on GitHub.' })
    expect(await poll({ error: 'incorrect_client_credentials' })).toEqual({
      kind: 'failed',
      message: 'GitHub could not complete the sign-in (incorrect_client_credentials). Try again.',
    })
  })

  it('keeps waiting through a dropped connection', async () => {
    const outcome = await pollToken('client', 'dev', 5, vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))
    expect(outcome).toEqual({ kind: 'pending', interval: 5 })
  })
})
