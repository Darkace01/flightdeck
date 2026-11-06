import type { BranchInfo, StalePr } from './types'

// Finding branches and pull requests worth cleaning up. Pure, so the rules are unit-tested: nothing here talks to GitHub,
// and nothing here deletes anything. The UI shows the result and asks before the main process acts on it.

/** Branches that are never offered, whatever their age: long-lived ones people point deployments and docs at. */
export const KEEP_BRANCHES = ['main', 'master', 'develop', 'dev', 'trunk', 'staging', 'production', 'prod', 'gh-pages']

/** A merged-looking branch must have a tip older than this, so a branch someone has just created isn't offered. */
export const MERGED_MIN_DAYS = 7

export interface StaleBranch {
  name: string
  /** merged: everything on it is already in the default branch. stale: it has unmerged commits and nobody has touched it. */
  reason: 'merged' | 'stale'
  ageDays: number
  /** Commits not in the default branch: what deleting a stale branch would lose. */
  ahead: number
  author: string
  date: string
}

export interface OldPr extends StalePr {
  ageDays: number
}

const DAY = 86_400_000

export function ageInDays(iso: string, now: number): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : 0
}

/** Merged and stale branches, merged first, each oldest first. Open-PR branches, the default branch and KEEP_BRANCHES are skipped. */
export function findStaleBranches(branches: BranchInfo[], opts: { now: number; staleDays: number; keep?: string[] }): StaleBranch[] {
  const keep = new Set([...KEEP_BRANCHES, ...(opts.keep ?? [])])
  const found: StaleBranch[] = []
  for (const b of branches) {
    if (b.isDefault || b.openPr || keep.has(b.name)) continue
    const ageDays = ageInDays(b.date, opts.now)
    const base = { name: b.name, ageDays, ahead: b.ahead, author: b.author, date: b.date }
    if (b.ahead === 0 && ageDays >= MERGED_MIN_DAYS) found.push({ ...base, reason: 'merged' })
    else if (b.ahead > 0 && ageDays >= opts.staleDays) found.push({ ...base, reason: 'stale' })
  }
  return found.sort((a, b) => Number(b.reason === 'merged') - Number(a.reason === 'merged') || b.ageDays - a.ageDays)
}

/** Open PRs nobody has touched for `days`, oldest first. */
export function findOldPrs(prs: StalePr[], opts: { now: number; days: number }): OldPr[] {
  return prs
    .map((p) => ({ ...p, ageDays: ageInDays(p.updatedAt, opts.now) }))
    .filter((p) => p.ageDays >= opts.days)
    .sort((a, b) => b.ageDays - a.ageDays)
}
