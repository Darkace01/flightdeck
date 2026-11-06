import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../../src/main/github'
import { paceForBudget } from '../../src/main/poller'
import { groupRepoErrors } from '../../src/shared/deploy'

const reply = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers })
const graphqlHeaders = (remaining: number, resetSeconds: number) => ({
  'x-ratelimit-resource': 'graphql',
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-reset': String(resetSeconds)
})

describe('GitHub.graphql rate limit', () => {
  afterEach(() => vi.unstubAllGlobals())
  const inAnHour = Math.floor(Date.now() / 1000) + 3600

  it('tracks the GraphQL budget separately from REST', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ data: { ok: 1 } }, graphqlHeaders(4321, inAnHour))))
    const gh = new GitHub('t')
    await gh.graphql('q', {})
    expect(gh.graphqlRate).toEqual({ limit: 5000, remaining: 4321, reset: inAnHour * 1000 })
    expect(gh.rate).toBeUndefined()
  })

  it('stops sending queries once the budget is spent, until it resets', async () => {
    const fetch = vi.fn(async () => reply({ data: { ok: 1 } }, graphqlHeaders(0, inAnHour)))
    vi.stubGlobal('fetch', fetch)
    const gh = new GitHub('t')
    await gh.graphql('q', {})
    await expect(gh.graphql('q', {})).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/used up until/) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(gh.graphqlBlockedUntil(inAnHour * 1000 + 1)).toBeUndefined()
  })

  it('treats a RATE_LIMITED error as a spent budget', async () => {
    const fetch = vi.fn(async () => reply({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit already exceeded for user ID 1.' }] }))
    vi.stubGlobal('fetch', fetch)
    const gh = new GitHub('t')
    await expect(gh.graphql('q', {})).rejects.toMatchObject({ status: 429 })
    await expect(gh.graphql('q', {})).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('groupRepoErrors', () => {
  it('keeps one repo’s error as it was', () => expect(groupRepoErrors([{ repo: 'o/a', error: 'boom' }])).toEqual(['o/a: boom']))
  it('folds a shared error into one line', () => {
    const errors = ['o/a', 'o/b', 'o/c', 'o/d'].map((repo) => ({ repo, error: 'limit' }))
    expect(groupRepoErrors([...errors, { repo: 'o/e', error: 'gone' }])).toEqual(['limit (o/a, o/b and 2 more)', 'o/e: gone'])
    expect(groupRepoErrors(errors.slice(0, 2))).toEqual(['limit (o/a, o/b)'])
  })
})

describe('GitHub REST caching and back-off', () => {
  afterEach(() => vi.unstubAllGlobals())
  const inAnHour = Math.floor(Date.now() / 1000) + 3600
  const coreHeaders = (remaining: number, extra: Record<string, string> = {}) => ({
    'x-ratelimit-resource': 'core',
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(inAnHour),
    ...extra
  })

  it('shares one request between identical GETs made at the same time', async () => {
    const fetch = vi.fn(async () => reply({ n: 1 }, coreHeaders(4000, { etag: '"a"' })))
    vi.stubGlobal('fetch', fetch)
    const gh = new GitHub('t')
    const [a, b] = await Promise.all([gh.get('/x'), gh.get('/x')])
    expect(a).toEqual(b)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('serves cached data without calling GitHub while the core budget is spent', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ n: 1 }, coreHeaders(0, { etag: '"a"' })))
      .mockResolvedValue(reply({ n: 2 }))
    vi.stubGlobal('fetch', fetch)
    const gh = new GitHub('t')
    await gh.get('/x')
    await expect(gh.get('/x')).resolves.toEqual({ n: 1 })
    await expect(gh.get('/y')).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('honours Retry-After from a secondary limit', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 403, headers: { 'retry-after': '60' } }))
    vi.stubGlobal('fetch', fetch)
    const gh = new GitHub('t')
    await expect(gh.get('/x')).rejects.toBeDefined()
    await expect(gh.get('/x')).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('paceForBudget', () => {
  const now = 1_000_000
  const gh = (remaining: number, blocked?: number) => ({ rate: { limit: 5000, remaining, reset: now + 3_600_000 }, restBlockedUntil: () => blocked })
  it('leaves the interval alone with plenty of budget', () => expect(paceForBudget(30_000, gh(4000), now)).toBe(30_000))
  it('stretches it when the budget runs low', () => expect(paceForBudget(30_000, gh(100), now)).toBeGreaterThan(30_000))
  it('waits out a pause', () => expect(paceForBudget(30_000, gh(0, now + 120_000), now)).toBe(121_000))
})
