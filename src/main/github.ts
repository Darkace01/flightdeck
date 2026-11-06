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
    if (res.headers.get('x-ratelimit-resource') !== 'core') return
    const limit = Number(res.headers.get('x-ratelimit-limit'))
    const remaining = Number(res.headers.get('x-ratelimit-remaining'))
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (!Number.isNaN(limit)) this.rate = { limit, remaining, reset: reset * 1000 }
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
    const res = await fetch(API + '/graphql', {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, variables })
    })
    if (!res.ok) throw await toError(res)
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    // Partial data is still useful (e.g. one repo of many was renamed), so only fail with no data.
    if (!json.data) throw new GitHubError(json.errors?.map((e) => e.message).join('; ') ?? 'GraphQL error', 200)
    return json.data
  }
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
