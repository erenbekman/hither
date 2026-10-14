import type { AppError } from '../../core/errors'

const TIMEOUT_MS = 15_000

export async function fetchViewerLogin(token: string, fetchFn: typeof fetch = fetch): Promise<string> {
  let response: Response
  try {
    response = await fetchFn('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw { kind: 'network', message: error instanceof Error ? error.message : String(error) } satisfies AppError
  }

  if (response.status === 401) throw { kind: 'github-unauthorized' } satisfies AppError
  if (response.status === 403) throw { kind: 'github-forbidden' } satisfies AppError
  if (!response.ok) throw { kind: 'github-status', status: response.status } satisfies AppError

  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || typeof (body as { login?: unknown }).login !== 'string') {
    throw { kind: 'unknown', message: 'GitHub response has no login' } satisfies AppError
  }
  return (body as { login: string }).login
}
