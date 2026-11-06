import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../../src/main/github'
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
