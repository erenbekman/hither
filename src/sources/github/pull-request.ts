import type { AppError } from '../../core/errors'

export const DIFF_LIMIT = 100_000

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const field = (value: unknown, key: string) => (isObject(value) ? text(value[key]) : '')

async function get(url: string, token: string, accept: string, fetchFn: typeof fetch): Promise<Response> {
  let response: Response
  try {
    response = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    throw { kind: 'network', service: 'GitHub', message: error instanceof Error ? error.message : String(error) } satisfies AppError
  }
  if (response.status === 401) throw { kind: 'github-unauthorized' } satisfies AppError
  return response
}

export async function pullRequestText(token: string, repo: string, number: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const url = `https://api.github.com/repos/${repo.split('/').map(encodeURIComponent).join('/')}/pulls/${encodeURIComponent(number)}`
  const meta = await get(url, token, 'application/vnd.github+json', fetchFn)
  if (!meta.ok) throw { kind: 'github-status', status: meta.status } satisfies AppError
  const raw: unknown = await meta.json()
  const pr: Json = isObject(raw) ? raw : {}
  const diffResponse = await get(url, token, 'application/vnd.github.diff', fetchFn)
  let diff: string
  if (diffResponse.ok) diff = await diffResponse.text()
  else if (diffResponse.status === 406) diff = 'GitHub did not return the diff because it is too large.'
  else throw { kind: 'github-status', status: diffResponse.status } satisfies AppError
  if (diff.length > DIFF_LIMIT) diff = `${diff.slice(0, DIFF_LIMIT)}\n… ${diff.length - DIFF_LIMIT} more characters left out`
  const body = [
    `Title: ${text(pr.title)}`,
    `Author: ${field(pr.user, 'login')}`,
    `Branch: ${field(pr.head, 'ref')} → ${field(pr.base, 'ref')}`,
    '',
    'Description:',
    text(pr.body) || '(none)',
    '',
    'Diff:',
    diff,
  ].join('\n')
  let closed = body
  while (/<\/pull-request>/i.test(closed)) closed = closed.replace(/<\/pull-request>/gi, '')
  return `<pull-request>\n${closed}\n</pull-request>`
}
