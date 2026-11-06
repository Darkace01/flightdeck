import type { RateLimit } from '../shared/types'

// PUSHBACK_API_URL points the app at a fake GitHub for the end-to-end tests.
const API = process.env.PUSHBACK_API_URL || 'https://api.github.com'

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface Cached {
  etag: string
  data: unknown
}

/**
 * Thin GitHub client. REST GETs use ETag conditional requests: a 304 reply
 * does not count against the rate limit, which is what lets us poll often.
 */
export class GitHub {
  private cache = new Map<string, Cached>()
  rate?: RateLimit
  /** GraphQL has its own hourly budget (points, not requests), separate from REST's `core`. */
  graphqlRate?: RateLimit

  constructor(private readonly token: string) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Pushback',
      ...extra
    }
  }

  private trackRate(res: Response): void {
    const resource = res.headers.get('x-ratelimit-resource')
    if (resource !== 'core' && resource !== 'graphql') return
    const limit = Number(res.headers.get('x-ratelimit-limit'))
    const remaining = Number(res.headers.get('x-ratelimit-remaining'))
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (Number.isNaN(limit) || !res.headers.has('x-ratelimit-limit')) return
    const rate = { limit, remaining, reset: reset * 1000 }
    if (resource === 'core') this.rate = rate
    else this.graphqlRate = rate
  }

  /** When GraphQL's budget is spent, the time it resets. Until then every query would fail, so we don't send any. */
  graphqlBlockedUntil(now = Date.now()): number | undefined {
    const r = this.graphqlRate
    return r && r.remaining <= 0 && r.reset > now ? r.reset : undefined
  }

  /** `accept` can ask for GitHub's rendered, sanitised HTML of markdown bodies (`application/vnd.github.html+json`). */
  async get<T>(path: string, accept?: string): Promise<T> {
    const key = accept ? `${accept} ${path}` : path
    const cached = this.cache.get(key)
    const res = await fetch(API + path, {
      headers: this.headers({ ...(accept && { Accept: accept }), ...(cached && { 'If-None-Match': cached.etag }) })
    })
    this.trackRate(res)
    if (res.status === 304 && cached) return cached.data as T
    if (!res.ok) throw await toError(res)
    const data = await res.json()
    const etag = res.headers.get('etag')
    if (etag) this.cache.set(key, { etag, data })
    return data as T
  }

  /** GET a plain-text resource (e.g. job logs, which redirect to blob storage, or a README as HTML). */
  async text(path: string, accept?: string): Promise<string> {
    const res = await fetch(API + path, { headers: this.headers(accept ? { Accept: accept } : undefined) })
    this.trackRate(res)
    if (!res.ok) throw await toError(res)
    return res.text()
  }

  async send(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(API + path, {
      method,
      headers: this.headers(body ? { 'Content-Type': 'application/json' } : undefined),
      body: body ? JSON.stringify(body) : undefined
    })
    this.trackRate(res)
    if (!res.ok) throw await toError(res)
    return res.status === 204 ? null : res.json().catch(() => null)
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const blocked = this.graphqlBlockedUntil()
    if (blocked) throw rateLimited(blocked)
    const res = await fetch(API + '/graphql', {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, variables })
    })
    this.trackRate(res)
    if (!res.ok) {
      const blockedNow = this.graphqlBlockedUntil()
      throw blockedNow ? rateLimited(blockedNow) : await toError(res)
    }
    const json = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] }
    // GitHub can answer a spent budget with 200 and a RATE_LIMITED error; hold off until the reset it gave (or a minute).
    if (json.errors?.some((e) => e.type === 'RATE_LIMITED')) {
      const reset = this.graphqlRate && this.graphqlRate.reset > Date.now() ? this.graphqlRate.reset : Date.now() + 60_000
      this.graphqlRate = { limit: this.graphqlRate?.limit ?? 5000, remaining: 0, reset }
      throw rateLimited(reset)
    }
    // Partial data is still useful (e.g. one repo of many was renamed), so only fail with no data.
    if (!json.data) throw new GitHubError(json.errors?.map((e) => e.message).join('; ') ?? 'GraphQL error', 200)
    return json.data
  }
}

/** Status 429 so callers can tell a spent budget from a broken query. */
export function rateLimited(reset: number): GitHubError {
  const at = new Date(reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new GitHubError(`GitHub's GraphQL limit is used up until ${at}. Pushback carries on by itself then.`, 429)
}

async function toError(res: Response): Promise<GitHubError> {
  let message = `${res.status} ${res.statusText}`
  try {
    // Validation failures (422) put the useful reason in `errors`, e.g. "Can not approve your own pull request".
    const body = (await res.json()) as { message?: string; errors?: (string | { message?: string; code?: string })[] }
    const details = (body.errors ?? []).map((e) => (typeof e === 'string' ? e : (e.message ?? e.code))).filter(Boolean)
    if (body.message) message = `${details.length ? details.join('; ') : body.message} (${res.status})`
  } catch {
    // non-JSON error body
  }
  return new GitHubError(message, res.status)
}
