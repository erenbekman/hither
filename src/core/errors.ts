export type AppError =
  | { kind: 'gh-not-found' }
  | { kind: 'gh-not-authenticated' }
  | { kind: 'gh-timeout' }
  | { kind: 'github-unauthorized' }
  | { kind: 'github-forbidden' }
  | { kind: 'github-status'; status: number }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string }

const KNOWN_KINDS = new Set<string>([
  'gh-not-found',
  'gh-not-authenticated',
  'gh-timeout',
  'github-unauthorized',
  'github-forbidden',
  'github-status',
  'network',
])

export function toAppError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'kind' in error && KNOWN_KINDS.has(String(error.kind))) {
    return error as AppError
  }
  if (error instanceof Error) return { kind: 'unknown', message: error.message }
  return { kind: 'unknown', message: String(error) }
}

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
    case 'github-status':
      return `GitHub answered with HTTP ${error.status}`
    case 'network':
      return 'No connection to GitHub'
    case 'unknown':
      return `Unexpected error: ${error.message}`
  }
}

export function errorHint(error: AppError): string | undefined {
  switch (error.kind) {
    case 'gh-not-found':
      return 'brew install gh && gh auth login'
    case 'gh-not-authenticated':
    case 'gh-timeout':
    case 'github-unauthorized':
      return 'gh auth login'
    default:
      return undefined
  }
}
