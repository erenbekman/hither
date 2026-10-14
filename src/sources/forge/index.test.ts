import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../core/settings'
import { deploymentSignals, forgeSource, listForgeOrganizations, parseDeployments, siteUrl } from './index'

const now = new Date('2026-10-14T12:00:00Z')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

const deployment = (id: number, site: string, status: string, endedMinutesAgo: number) => ({
  id: String(id),
  type: 'deployments',
  attributes: {
    commit: { hash: `abcdef${id}123`, author: 'Eren', message: `Release ${id}`, branch: 'main' },
    status,
    started_at: minutesAgo(endedMinutesAgo + 2),
    ended_at: minutesAgo(endedMinutesAgo),
    created_at: minutesAgo(endedMinutesAgo + 3),
  },
  relationships: { site: { data: { id: site, type: 'sites' } } },
})

const site = (id: string, name: string, url = `https://${name}`) => ({
  id,
  type: 'sites',
  attributes: { name, url, https: true, repository: { provider: 'github', url: `git@github.com:eren/${name}.git`, branch: 'main' } },
})

const body = {
  data: [deployment(3, '1', 'failed', 5), deployment(2, '1', 'finished', 60), deployment(9, '2', 'finished', 10), deployment(7, '3', 'finished', 90)],
  included: [site('1', 'acme.app'), site('2', 'shop.app'), site('3', 'old.app')],
}

describe('parseDeployments', () => {
  it('reads deployments and the sites they belong to', () => {
    const { deployments, sites } = parseDeployments(body)
    expect(deployments).toHaveLength(4)
    expect(deployments[0]).toMatchObject({ id: '3', status: 'failed', siteId: '1', message: 'Release 3', author: 'Eren' })
    expect(sites.get('2')).toEqual({ name: 'shop.app', url: 'https://shop.app', repo: 'eren/shop.app' })
  })

  it('survives a body without data', () => {
    expect(parseDeployments(null).deployments).toEqual([])
  })
})

describe('siteUrl', () => {
  it('adds a scheme when Forge gives a bare domain', () => {
    expect(siteUrl({ name: 'acme.app', url: 'acme.app', https: true })).toBe('https://acme.app')
    expect(siteUrl({ name: 'dev.test', https: false })).toBe('http://dev.test')
    expect(siteUrl({ url: 'https://x.dev' })).toBe('https://x.dev')
  })
})

describe('deploymentSignals', () => {
  it('looks only at the latest deployment of each site', () => {
    const { deployments, sites } = parseDeployments(body)
    const signals = deploymentSignals(deployments, sites, now)
    expect(signals.map((s) => [s.project, s.kind, s.severity])).toEqual([
      ['acme.app', 'deploy-failed', 'critical'],
      ['shop.app', 'deploy-ok', 'info'],
    ])
    expect(signals[0]).toMatchObject({
      id: 'forge:deploy:3',
      url: 'https://acme.app',
      title: 'Release 3',
      meta: { hash: 'abcdef3', sha: 'abcdef3123', repo: 'eren/acme.app', siteId: '1', deploymentId: '3' },
    })
  })

  it('drops a successful deployment after thirty minutes', () => {
    const { deployments, sites } = parseDeployments({ data: [deployment(1, '1', 'finished', 31)], included: [site('1', 'acme.app')] })
    expect(deploymentSignals(deployments, sites, now)).toEqual([])
  })

  it('shows a running deployment and ignores a cancelled one', () => {
    const { deployments, sites } = parseDeployments({
      data: [deployment(1, '1', 'deploying', 0), deployment(2, '2', 'cancelled', 1)],
      included: [site('1', 'acme.app'), site('2', 'shop.app')],
    })
    expect(deploymentSignals(deployments, sites, now).map((s) => s.kind)).toEqual(['deploy-running'])
  })
})

describe('forgeSource', () => {
  const ctx = { signal: new AbortController().signal }
  const configured = { ...DEFAULT_SETTINGS, forgeEnabled: true, forgeOrg: 'eren', forgeServers: ['11', '12'] }

  it('asks once per server and merges the answers', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }))
    const source = forgeSource({ token: async () => 'tok', settings: () => configured, fetchFn, now: () => now })
    const result = await source.poll(ctx)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      'https://forge.laravel.com/api/orgs/eren/servers/11/deployments?sort=-created_at&include=site&page[size]=30',
    )
    expect(result.signals.map((s) => s.kind)).toEqual(['deploy-failed', 'deploy-ok'])
  })

  it('says what is missing instead of showing an empty lane', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    await expect(forgeSource({ token: async () => 'tok', settings: () => DEFAULT_SETTINGS, fetchFn }).poll(ctx)).rejects.toEqual({
      kind: 'service-not-configured',
      service: 'Forge',
      missing: 'choose an organization and servers',
    })
    await expect(forgeSource({ token: async () => null, settings: () => configured, fetchFn }).poll(ctx)).rejects.toMatchObject({
      missing: 'add an API token',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('listForgeOrganizations', () => {
  it('returns slug and name', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: '1', type: 'organizations', attributes: { name: 'Eren', slug: 'eren' } }] }), { status: 200 }),
    )
    await expect(listForgeOrganizations('t', fetchFn)).resolves.toEqual([{ slug: 'eren', name: 'Eren' }])
  })
})
