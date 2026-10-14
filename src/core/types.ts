export type Lane = 'incoming' | 'outgoing' | 'agents'

export interface Signal {
  id: string
  source: 'github' | 'forge' | 'sentry' | 'claude-code'
  lane: Lane
  kind: string
  severity: 'info' | 'attention' | 'critical'
  project: string
  title: string
  url?: string
  actor?: string
  at: string
  meta?: Record<string, unknown>
}

export interface Ctx {
  signal: AbortSignal
}

export interface PollResult {
  signals: Signal[]
  notices: string[]
  account?: string
  retryAt?: string
}

export interface Source {
  id: string
  interval: number
  poll(ctx: Ctx): Promise<PollResult>
}
