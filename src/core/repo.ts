const PATTERNS = [
  /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  /^ssh:\/\/git@github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  /^([\w.-]+)\/([\w.-]+)$/,
]

export function githubRepo(remote: string | undefined | null): string | undefined {
  const text = remote?.trim()
  if (!text) return undefined
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text)
    if (match) return `${match[1]}/${match[2]}`
  }
  return undefined
}
