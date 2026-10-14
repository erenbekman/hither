import type { AppError } from '../../core/errors'

export const DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type PollOutcome = { kind: 'token'; token: string } | { kind: 'pending'; interval: number } | { kind: 'failed'; message: string }

type Json = Record<string, unknown>

export const signInScopes = (privateRepositories: boolean) => [privateRepositories ? 'repo' : 'public_repo', 'read:org', 'notifications']

function post(url: string, fields: Record<string, string>, fetchFn: typeof fetch) {
  return fetchFn(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
}

export async function requestDeviceCode(clientId: string, scopes: string[], fetchFn: typeof fetch): Promise<DeviceCode> {
  let body: Json
  try {
    body = (await (await post(DEVICE_CODE_URL, { client_id: clientId, scope: scopes.join(' ') }, fetchFn)).json()) as Json
  } catch (error) {
    throw { kind: 'network', message: error instanceof Error ? error.message : String(error), service: 'GitHub' } satisfies AppError
  }
  const { device_code, user_code, verification_uri, expires_in, interval } = body
  if (typeof device_code !== 'string' || typeof user_code !== 'string' || typeof verification_uri !== 'string') {
    const message = typeof body.error_description === 'string' ? body.error_description : `GitHub did not start the sign-in (${String(body.error ?? 'no code')})`
    throw { kind: 'unknown', message } satisfies AppError
  }
  return {
    deviceCode: device_code,
    userCode: user_code,
    verificationUri: verification_uri,
    expiresIn: typeof expires_in === 'number' ? expires_in : 900,
    interval: typeof interval === 'number' ? interval : 5,
  }
}

export async function pollToken(clientId: string, deviceCode: string, interval: number, fetchFn: typeof fetch): Promise<PollOutcome> {
  let body: Json
  try {
    body = (await (await post(TOKEN_URL, { client_id: clientId, device_code: deviceCode, grant_type: GRANT_TYPE }, fetchFn)).json()) as Json
  } catch {
    return { kind: 'pending', interval }
  }
  if (typeof body.access_token === 'string') return { kind: 'token', token: body.access_token }
  switch (body.error) {
    case 'authorization_pending':
      return { kind: 'pending', interval }
    case 'slow_down':
      return { kind: 'pending', interval: typeof body.interval === 'number' ? body.interval : interval + 5 }
    case 'expired_token':
      return { kind: 'failed', message: 'The code expired. Try again.' }
    case 'access_denied':
      return { kind: 'failed', message: 'Access was denied on GitHub.' }
    default:
      return { kind: 'failed', message: `GitHub could not complete the sign-in (${String(body.error ?? 'no token')}). Try again.` }
  }
}
