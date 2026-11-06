import type { Account } from './types'

// Several accounts, and GitHub Enterprise Server. The signed-in github.com login (PAT or gh CLI) is the primary
// account and isn't listed; every other account is an Account with its own host. A repo belongs to the primary
// account unless Settings.repoAccounts says otherwise. Pure helpers: no Node or DOM APIs.

export const GITHUB_HOST = 'github.com'

/** "https://GHE.example.com/org/repo" or "ghe.example.com/" → "ghe.example.com". Undefined if it isn't a plain host name. */
export function normalizeHost(input: string): string | undefined {
  let h = input.trim().toLowerCase()
  if (/^http:\/\//.test(h)) return undefined // tokens are only ever sent over https
  h = h.replace(/^https:\/\//, '').split(/[/?#]/)[0]
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(h) ? h : undefined
}

/** The REST API base for a host: api.github.com, GHE Cloud with data residency (api.<name>.ghe.com), or GHES (/api/v3). */
export function apiUrlFor(host: string): string {
  if (host === GITHUB_HOST) return 'https://api.github.com'
  if (host.endsWith('.ghe.com')) return `https://api.${host}`
  return `https://${host}/api/v3`
}

/** The GraphQL endpoint that goes with a REST base (GHES keeps it at /api/graphql, next to /api/v3). */
export function graphqlUrl(apiUrl: string): string {
  return apiUrl.endsWith('/api/v3') ? `${apiUrl.slice(0, -'/v3'.length)}/graphql` : `${apiUrl}/graphql`
}

export const accountOf = (repo: string, repoAccounts: Record<string, string>, accounts: Account[]): Account | undefined =>
  accounts.find((a) => a.id === repoAccounts[repo])

/** The web host a repo lives on. */
export const hostOf = (repo: string, repoAccounts: Record<string, string>, accounts: Account[]): string => accountOf(repo, repoAccounts, accounts)?.host ?? GITHUB_HOST

/** https URL of a repo on its host, with an optional path such as "/pull/3". */
export const repoUrl = (repo: string, repoAccounts: Record<string, string>, accounts: Account[], path = ''): string =>
  `https://${hostOf(repo, repoAccounts, accounts)}/${repo}${path}`

export type ParsedRepo = { repo: string; accountId?: string } | { error: string }

/**
 * What the user typed when adding a repo: "owner/name", or a URL on github.com or on one of their accounts' hosts.
 * A bare owner/name belongs to `defaultAccountId` (the account picked in the form; none means github.com).
 */
export function parseRepoInput(input: string, accounts: Account[], defaultAccountId?: string): ParsedRepo {
  const text = input.trim().replace(/\.git$/, '').replace(/\/$/, '')
  const url = text.match(/^https:\/\/([^/]+)\/([\w.-]+)\/([\w.-]+)/i)
  if (url) {
    const host = url[1].toLowerCase()
    const repo = `${url[2]}/${url[3].replace(/\.git$/, '')}`
    if (host === GITHUB_HOST) return { repo }
    const account = accounts.find((a) => a.host === host)
    return account ? { repo, accountId: account.id } : { error: `No account for ${host}. Add it under Settings → Accounts first.` }
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) return defaultAccountId ? { repo: text, accountId: defaultAccountId } : { repo: text }
  return { error: 'Use the owner/name format, e.g. vercel/next.js, or paste a repository URL' }
}
