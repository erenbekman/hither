import type { AppError } from '../../core/errors'
import { getJson } from '../../core/http'
import type { Settings } from '../../core/settings'
import { githubRepo } from '../../core/repo'
import type { PollResult, Signal, Source } from '../../core/types'

export const FORGE_API = 'https://forge.laravel.com/api'
export const FORGE_TOKEN_KEY = 'forge-token'
export const DEPLOY_OK_VISIBLE_MS = 30 * 60_000

const FAILED = new Set(['failed', 'failed-build'])
const RUNNING = new Set(['deploying', 'queued', 'pending'])

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined)

export interface Deployment {
  id: string
  serverId?: string
  status: string
  siteId?: string
  hash?: string
  author?: string
  message?: string
  branch?: string
  startedAt?: string
  endedAt?: string
  createdAt?: string
}

export interface Site {
  name: string
  url: string
  repo?: string
}

export function siteUrl(attributes: Json): string {
  const name = text(attributes.name) ?? ''
  const url = text(attributes.url) ?? name
  if (/^https?:\/\//.test(url)) return url
  return `${attributes.https === false ? 'http' : 'https'}://${url}`
}

export function parseDeployments(body: unknown, serverId?: string): { deployments: Deployment[]; sites: Map<string, Site> } {
  const root = isObject(body) ? body : {}
  const data = Array.isArray(root.data) ? root.data.filter(isObject) : []
  const included = Array.isArray(root.included) ? root.included.filter(isObject) : []

  const sites = new Map<string, Site>()
  for (const resource of included) {
    if (resource.type !== 'sites' || typeof resource.id !== 'string' || !isObject(resource.attributes)) continue
    const repository = isObject(resource.attributes.repository) ? resource.attributes.repository : {}
    sites.set(resource.id, {
      name: text(resource.attributes.name) ?? resource.id,
      url: siteUrl(resource.attributes),
      repo: githubRepo(text(repository.url)),
    })
  }

  const deployments = data.flatMap((resource): Deployment[] => {
    const attributes = isObject(resource.attributes) ? resource.attributes : undefined
    if (resource.id === undefined || !attributes || typeof attributes.status !== 'string') return []
    const commit = isObject(attributes.commit) ? attributes.commit : {}
    const site = isObject(resource.relationships) && isObject(resource.relationships.site) ? resource.relationships.site.data : undefined
    return [
      {
        id: String(resource.id),
        serverId,
        status: attributes.status,
        siteId: isObject(site) && site.id !== undefined ? String(site.id) : undefined,
        hash: text(commit.hash),
        author: text(commit.author),
        message: text(commit.message),
        branch: text(commit.branch),
        startedAt: text(attributes.started_at),
        endedAt: text(attributes.ended_at),
        createdAt: text(attributes.created_at),
      },
    ]
  })
  return { deployments, sites }
}

export function deploymentSignals(deployments: Deployment[], sites: Map<string, Site>, now: Date): Signal[] {
  const time = (d: Deployment) => Date.parse(d.createdAt ?? d.startedAt ?? '') || 0
  const latest = new Map<string, Deployment>()
  for (const deployment of [...deployments].sort((a, b) => time(b) - time(a))) {
    if (deployment.siteId && !latest.has(deployment.siteId)) latest.set(deployment.siteId, deployment)
  }

  return [...latest].flatMap(([siteId, deployment]): Signal[] => {
    const site = sites.get(siteId) ?? { name: `site ${siteId}`, url: '' }
    const at = deployment.endedAt ?? deployment.startedAt ?? deployment.createdAt ?? now.toISOString()
    let kind: string
    let severity: Signal['severity'] = 'info'
    if (FAILED.has(deployment.status)) {
      kind = 'deploy-failed'
      severity = 'critical'
    } else if (RUNNING.has(deployment.status)) {
      kind = 'deploy-running'
    } else if (deployment.status === 'finished' && now.getTime() - Date.parse(at) < DEPLOY_OK_VISIBLE_MS) {
      kind = 'deploy-ok'
    } else {
      return []
    }
    return [
      {
        id: `forge:deploy:${deployment.id}`,
        source: 'forge',
        lane: 'outgoing',
        kind,
        severity,
        project: site.name,
        title: deployment.message ?? 'Deployment',
        url: site.url || undefined,
        actor: deployment.author,
        at,
        meta: {
          status: deployment.status,
          hash: deployment.hash?.slice(0, 7),
          sha: deployment.hash,
          branch: deployment.branch,
          repo: site.repo,
          serverId: deployment.serverId,
          siteId,
          deploymentId: deployment.id,
        },
      },
    ]
  })
}

export function describeDeployment(signal: Signal): string {
  if (signal.kind === 'deploy-failed') return 'Deploy failed'
  if (signal.kind === 'deploy-running') return 'Deploying'
  return 'Deployed'
}

const notConfigured = (missing: string): AppError => ({ kind: 'service-not-configured', service: 'Forge', missing })

export function forgeSource(deps: {
  token: () => Promise<string | null>
  settings: () => Settings
  fetchFn: typeof fetch
  now?: () => Date
}): Source {
  const now = deps.now ?? (() => new Date())
  return {
    id: 'forge',
    interval: 0,
    async poll(ctx): Promise<PollResult> {
      const { forgeOrg, forgeServers } = deps.settings()
      if (!forgeOrg || forgeServers.length === 0) throw notConfigured('choose an organization and servers')
      const token = await deps.token()
      if (!token) throw notConfigured('add an API token')

      const pages = await Promise.all(
        forgeServers.map((server) =>
          getJson(
            'Forge',
            `${FORGE_API}/orgs/${encodeURIComponent(forgeOrg)}/servers/${encodeURIComponent(server)}/deployments?sort=-created_at&include=site&page[size]=30`,
            token,
            { fetchFn: deps.fetchFn, signal: ctx.signal, now },
          ),
        ),
      )
      const deployments: Deployment[] = []
      const sites = new Map<string, Site>()
      for (const [i, page] of pages.entries()) {
        const parsed = parseDeployments(page, forgeServers[i])
        deployments.push(...parsed.deployments)
        for (const [id, site] of parsed.sites) sites.set(id, site)
      }
      return { signals: deploymentSignals(deployments, sites, now()), notices: [] }
    },
  }
}

export async function listForgeOrganizations(token: string, fetchFn: typeof fetch): Promise<{ slug: string; name: string }[]> {
  const body = await getJson('Forge', `${FORGE_API}/orgs?page[size]=100`, token, { fetchFn })
  const data = isObject(body) && Array.isArray(body.data) ? body.data.filter(isObject) : []
  return data.flatMap((org) => {
    const attributes = isObject(org.attributes) ? org.attributes : {}
    const slug = text(attributes.slug)
    return slug ? [{ slug, name: text(attributes.name) ?? slug }] : []
  })
}

export async function listForgeServers(token: string, org: string, fetchFn: typeof fetch): Promise<{ id: string; name: string }[]> {
  const body = await getJson('Forge', `${FORGE_API}/orgs/${encodeURIComponent(org)}/servers?page[size]=100`, token, { fetchFn })
  const data = isObject(body) && Array.isArray(body.data) ? body.data.filter(isObject) : []
  return data.flatMap((server) => {
    if (server.id === undefined) return []
    const attributes = isObject(server.attributes) ? server.attributes : {}
    return [{ id: String(server.id), name: text(attributes.name) ?? String(server.id) }]
  })
}

export async function fetchDeploymentLog(
  token: string,
  org: string,
  ids: { serverId: string; siteId: string; deploymentId: string },
  fetchFn: typeof fetch,
): Promise<string> {
  const path = [org, 'servers', ids.serverId, 'sites', ids.siteId, 'deployments', ids.deploymentId].map(encodeURIComponent)
  const body = await getJson('Forge', `${FORGE_API}/orgs/${path.join('/')}/log`, token, { fetchFn })
  const data = isObject(body) && isObject(body.data) ? body.data : {}
  const attributes = isObject(data.attributes) ? data.attributes : {}
  return text(attributes.output) ?? ''
}
