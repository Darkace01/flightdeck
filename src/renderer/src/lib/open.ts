import { api, getSnapshot } from './store'
import { pushModal } from './ui'

// github.com/<these>/… are site pages, not owner/repo.
const RESERVED = new Set([
  'settings', 'orgs', 'organizations', 'users', 'marketplace', 'notifications', 'apps', 'sponsors', 'topics', 'features',
  'login', 'about', 'pricing', 'enterprise', 'explore', 'codespaces', 'search', 'new', 'issues', 'pulls', 'collections'
])

/**
 * Opens a GitHub link inside Flightdeck when there's a view for it (PR, workflow run, repo),
 * otherwise in the browser. Every click on GitHub content should go through here.
 */
export function openInApp(url: string): void {
  const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(\/[^?#]*)?(?:[?#].*)?$/)
  if (!m || RESERVED.has(m[1])) return void api.openExternal(url)
  const repo = `${m[1]}/${m[2]}`
  const rest = m[3] ?? ''

  const pr = rest.match(/^\/pull\/(\d+)/)
  if (pr) return pushModal({ kind: 'pr', repo, number: Number(pr[1]) })

  const run = rest.match(/^\/actions\/runs\/(\d+)/)
  if (run) {
    const found = getSnapshot().repos[repo]?.runs.find((r) => r.id === Number(run[1]))
    // Runs we haven't polled (old, or untracked repo) have no data to show yet.
    return found ? pushModal({ kind: 'run', run: found }) : void api.openExternal(url)
  }

  if (rest === '' || rest === '/') return pushModal({ kind: 'repo', repo })
  void api.openExternal(url)
}

export const openPr = (repo: string, number: number) => pushModal({ kind: 'pr', repo, number })
export const openRepo = (repo: string) => pushModal({ kind: 'repo', repo })
