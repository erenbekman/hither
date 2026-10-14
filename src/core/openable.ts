const FIXED_HOSTS = ['github.com', 'sentry.io', 'forge.laravel.com']

export function isOpenable(url: string, extraHosts: Iterable<string> = []): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const extra = new Set(extraHosts)
  const host = parsed.hostname
  if (parsed.protocol === 'http:') return extra.has(host)
  if (parsed.protocol !== 'https:') return false
  return FIXED_HOSTS.includes(host) || host.endsWith('.sentry.io') || extra.has(host)
}
