export type Service = 'GitHub' | 'Forge' | 'Sentry'

export type AppError =
  | { kind: 'gh-not-found' }
  | { kind: 'gh-not-authenticated' }
  | { kind: 'gh-timeout' }
  | { kind: 'github-unauthorized' }
  | { kind: 'github-forbidden' }
  | { kind: 'github-rate-limited'; resetAt: string }
  | { kind: 'github-graphql'; message: string }
  | { kind: 'github-parse'; message: string }
  | { kind: 'github-status'; status: number }
  | { kind: 'service-unauthorized'; service: Service }
  | { kind: 'service-rate-limited'; service: Service; resetAt: string }
  | { kind: 'service-status'; service: Service; status: number }
  | { kind: 'service-not-configured'; service: Service; missing: string }
  | { kind: 'network'; message: string; service?: Service }
  | { kind: 'unknown'; message: string }

const KNOWN_KINDS = new Set<string>([
  'gh-not-found',
  'gh-not-authenticated',
  'gh-timeout',
  'github-unauthorized',
  'github-forbidden',
  'github-rate-limited',
  'github-graphql',
  'github-parse',
  'github-status',
  'service-unauthorized',
  'service-rate-limited',
  'service-status',
  'service-not-configured',
  'network',
])

export function toAppError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'kind' in error && KNOWN_KINDS.has(String(error.kind))) {
    return error as AppError
  }
  if (error instanceof Error) return { kind: 'unknown', message: error.message }
  return { kind: 'unknown', message: String(error) }
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export function errorText(error: AppError): string {
  switch (error.kind) {
    case 'gh-not-found':
      return 'GitHub CLI not found — install gh'
    case 'gh-not-authenticated':
      return 'Not signed in to GitHub CLI'
    case 'gh-timeout':
      return 'GitHub CLI did not answer within 5 seconds'
    case 'github-unauthorized':
      return 'GitHub no longer accepts this sign-in'
    case 'github-forbidden':
      return 'GitHub refused the request. An organization may require SSO or an IP allow list.'
    case 'github-rate-limited':
      return `Rate limit reached · resets ${clock(error.resetAt)}`
    case 'github-graphql':
      return `GitHub error: ${error.message}`
    case 'github-parse':
      return 'Unexpected response from GitHub'
    case 'github-status':
      return `GitHub answered with HTTP ${error.status}`
    case 'service-unauthorized':
      return `${error.service} rejected the token`
    case 'service-rate-limited':
      return `${error.service} rate limit reached · resets ${clock(error.resetAt)}`
    case 'service-status':
      return `${error.service} answered with HTTP ${error.status}`
    case 'service-not-configured':
      return `${error.service}: ${error.missing}`
    case 'network':
      return `No connection to ${error.service ?? 'GitHub'}`
    case 'unknown':
      return `Unexpected error: ${error.message}`
  }
}

export type ErrorHint = { command: string } | { text: string }

export function errorHint(error: AppError): ErrorHint | undefined {
  switch (error.kind) {
    case 'gh-not-found':
      return { command: 'brew install gh && gh auth login' }
    case 'gh-not-authenticated':
    case 'gh-timeout':
    case 'github-unauthorized':
      return { command: 'gh auth login' }
    case 'service-unauthorized':
    case 'service-not-configured':
      return { text: 'Check it in Settings' }
    default:
      return undefined
  }
}
