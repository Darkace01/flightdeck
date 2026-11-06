import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrlFor, graphqlUrl, hostOf, normalizeHost, parseRepoInput, repoUrl } from '../../src/shared/accounts'
import type { Account } from '../../src/shared/types'

// store.ts reads paths and encryption from Electron; neither is needed for normalising settings.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))
const { normalizeSettings } = await import('../../src/main/store')
const { GitHub } = await import('../../src/main/github')

const corp: Account = { id: 'a1', name: 'Corp', host: 'ghe.example.com', apiUrl: 'https://ghe.example.com/api/v3' }

describe('normalizeHost', () => {
  it.each([
    ['ghe.example.com', 'ghe.example.com'],
    ['https://GHE.Example.com/org/repo', 'ghe.example.com'],
    ['  ghe.example.com/  ', 'ghe.example.com'],
    ['git.corp:8443', 'git.corp:8443'],
    ['10.0.0.5', '10.0.0.5']
  ])('%s → %s', (input, out) => expect(normalizeHost(input)).toBe(out))
  // Tokens must never travel over plain http, and anything that isn't a host name is refused.
  it.each(['http://ghe.example.com', '', 'a b', 'ghe.example.com:abc', '-bad.example.com', 'exa_mple.com', 'javascript:alert(1)'])('rejects %j', (input) => expect(normalizeHost(input)).toBeUndefined())
})

describe('apiUrlFor / graphqlUrl', () => {
  it('uses api.github.com for github.com', () => expect(apiUrlFor('github.com')).toBe('https://api.github.com'))
  it('uses /api/v3 for Enterprise Server', () => expect(apiUrlFor('ghe.example.com')).toBe('https://ghe.example.com/api/v3'))
  it('uses api.<name>.ghe.com for GHE Cloud with data residency', () => expect(apiUrlFor('acme.ghe.com')).toBe('https://api.acme.ghe.com'))
  it('puts GraphQL beside the REST root', () => {
    expect(graphqlUrl('https://api.github.com')).toBe('https://api.github.com/graphql')
    expect(graphqlUrl('https://ghe.example.com/api/v3')).toBe('https://ghe.example.com/api/graphql')
    expect(graphqlUrl('https://api.acme.ghe.com')).toBe('https://api.acme.ghe.com/graphql')
  })
})

describe('repo hosts and URLs', () => {
  it('routes a repo to its account, else github.com', () => {
    expect(hostOf('corp/tools', { 'corp/tools': 'a1' }, [corp])).toBe('ghe.example.com')
    expect(hostOf('acme/api', { 'corp/tools': 'a1' }, [corp])).toBe('github.com')
    expect(repoUrl('corp/tools', { 'corp/tools': 'a1' }, [corp], '/pull/3')).toBe('https://ghe.example.com/corp/tools/pull/3')
    expect(repoUrl('acme/api', {}, [corp])).toBe('https://github.com/acme/api')
  })
})

describe('parseRepoInput', () => {
  it('reads owner/name and github.com URLs', () => {
    expect(parseRepoInput('acme/api', [corp])).toEqual({ repo: 'acme/api' })
    expect(parseRepoInput('https://github.com/acme/api.git', [corp])).toEqual({ repo: 'acme/api' })
    expect(parseRepoInput('https://github.com/acme/api/pull/3', [corp])).toEqual({ repo: 'acme/api' })
  })
  it('routes an Enterprise URL to the account with that host', () => expect(parseRepoInput('https://GHE.example.com/corp/tools/', [corp])).toEqual({ repo: 'corp/tools', accountId: 'a1' }))
  it('puts a bare owner/name on the account picked in the form', () => expect(parseRepoInput('corp/tools', [corp], 'a1')).toEqual({ repo: 'corp/tools', accountId: 'a1' }))
  it('explains an unknown host and bad input', () => {
    expect(parseRepoInput('https://git.other.com/a/b', [corp])).toEqual({ error: expect.stringContaining('No account for git.other.com') })
    expect(parseRepoInput('nonsense', [corp])).toEqual({ error: expect.stringContaining('owner/name') })
  })
})

describe('normalizeSettings accounts', () => {
  it('gives existing installs no accounts and no routing', () => {
    const s = normalizeSettings({})
    expect(s.accounts).toEqual([])
    expect(s.repoAccounts).toEqual({})
  })
  it('keeps valid accounts and drops malformed or duplicate ones', () => {
    const s = normalizeSettings({ accounts: [corp, { id: 'a1', name: 'dup', host: 'x', apiUrl: 'y' }, { id: 'bad' } as never, null as never] })
    expect(s.accounts).toEqual([corp])
  })
  it('drops routing to accounts that no longer exist', () => {
    const s = normalizeSettings({ accounts: [corp], repoAccounts: { 'corp/tools': 'a1', 'gone/repo': 'zzz' } })
    expect(s.repoAccounts).toEqual({ 'corp/tools': 'a1' })
  })
  it('survives garbage in the saved file', () => {
    const s = normalizeSettings({ accounts: 'nope' as never, repoAccounts: null as never })
    expect(s.accounts).toEqual([])
    expect(s.repoAccounts).toEqual({})
  })
})

describe('GitHub client against another host', () => {
  const calls: { url: string; auth: string }[] = []
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string>).Authorization })
    return new Response(JSON.stringify({ data: { ok: true }, login: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  afterEach(() => {
    calls.length = 0
    vi.unstubAllGlobals()
  })

  it('sends REST and GraphQL calls to its own server with its own token', async () => {
    vi.stubGlobal('fetch', fakeFetch)
    const gh = new GitHub('secret-token', 'https://ghe.example.com/api/v3')
    await gh.get('/user')
    await gh.graphql('query { x }', {})
    expect(calls).toEqual([
      { url: 'https://ghe.example.com/api/v3/user', auth: 'Bearer secret-token' },
      { url: 'https://ghe.example.com/api/graphql', auth: 'Bearer secret-token' }
    ])
  })

  it('defaults to api.github.com', async () => {
    vi.stubGlobal('fetch', fakeFetch)
    await new GitHub('t').get('/user')
    expect(calls[0].url).toBe('https://api.github.com/user')
  })
})
