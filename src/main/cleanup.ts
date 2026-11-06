import { KEEP_BRANCHES } from '../shared/cleanup'
import type { CleanupRequest, CleanupResult, StalePr } from '../shared/types'
import type { GitHub } from './github'
import { refPath } from './repoTools'

// Bulk cleanup of branches and pull requests. The renderer picks the items after a confirm step, but the main
// process still re-checks each one right before acting: the repo may have changed since the list was loaded.

interface GhPull {
  number: number
  title: string
  html_url: string
  user: { login: string } | null
  created_at: string
  updated_at: string
  draft: boolean
}

/** Open PRs, least recently updated first. One page of 100 is plenty for a cleanup pass. */
export async function listOpenPrs(gh: GitHub, repo: string): Promise<StalePr[]> {
  const items = await gh.get<GhPull[]>(`/repos/${repo}/pulls?state=open&sort=updated&direction=asc&per_page=100`)
  return items.map((p) => ({ number: p.number, title: p.title, url: p.html_url, author: p.user?.login ?? 'ghost', createdAt: p.created_at, updatedAt: p.updated_at, draft: p.draft }))
}

/** True for names git accepts as a branch and that don't try to smuggle in path tricks. */
export function validBranchName(name: string): boolean {
  if (!name || name.length > 250) return false
  for (const ch of name) if (ch.charCodeAt(0) <= 32 || ch.charCodeAt(0) === 127 || '~^:?*[\\'.includes(ch)) return false
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false
  return !/^[-/]|[/.]$|\.lock$/.test(name)
}

export async function applyCleanup(gh: GitHub, repo: string, req: CleanupRequest): Promise<CleanupResult> {
  const done: string[] = []
  const failed: CleanupResult['failed'] = []
  const [owner] = repo.split('/')
  const { default_branch } = await gh.get<{ default_branch: string }>(`/repos/${repo}`)
  const keep = new Set([default_branch, ...KEEP_BRANCHES])

  for (const name of req.branches) {
    const item = `branch ${name}`
    try {
      if (!validBranchName(name)) throw new Error('not a valid branch name')
      if (keep.has(name)) throw new Error('this branch is never deleted in a cleanup')
      // Someone may have opened a PR from it since the list was loaded; deleting its branch would close that PR.
      const open = await gh.get<unknown[]>(`/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${name}`)}&per_page=1`)
      if (open.length) throw new Error('it now has an open pull request')
      await gh.send('DELETE', `/repos/${repo}/git/refs/heads/${refPath(name)}`)
      done.push(item)
    } catch (err) {
      failed.push({ item, error: (err as Error).message })
    }
  }

  for (const num of req.closePrs) {
    const item = `PR #${num}`
    try {
      if (!Number.isInteger(num) || num <= 0) throw new Error('not a pull request number')
      await gh.send('PATCH', `/repos/${repo}/pulls/${num}`, { state: 'closed' })
      done.push(item)
    } catch (err) {
      failed.push({ item, error: (err as Error).message })
    }
  }
  return { ok: failed.length === 0, done, failed }
}
