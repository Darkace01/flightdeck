import { describe, expect, it } from 'vitest'
import { applyCleanup, listOpenPrs, validBranchName } from '../../src/main/cleanup'
import type { GitHub } from '../../src/main/github'
import { ageInDays, findOldPrs, findStaleBranches } from '../../src/shared/cleanup'
import type { BranchInfo, StalePr } from '../../src/shared/types'

const NOW = Date.parse('2026-06-01T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

const branch = (name: string, over: Partial<BranchInfo> = {}): BranchInfo => ({ name, sha: 'x', isDefault: false, date: daysAgo(30), message: '', author: 'a', ahead: 0, behind: 0, ...over })

describe('findStaleBranches', () => {
  it('offers merged branches and stale ones with unmerged work, merged first then oldest first', () => {
    const found = findStaleBranches(
      [branch('merged-new', { date: daysAgo(10) }), branch('stale-a', { ahead: 3, date: daysAgo(100) }), branch('merged-old', { date: daysAgo(60) }), branch('stale-b', { ahead: 1, date: daysAgo(400) })],
      { now: NOW, staleDays: 90 }
    )
    expect(found.map((b) => [b.name, b.reason])).toEqual([
      ['merged-old', 'merged'],
      ['merged-new', 'merged'],
      ['stale-b', 'stale'],
      ['stale-a', 'stale']
    ])
  })

  it('never offers the default branch, branches with an open PR, long-lived names or extra keeps', () => {
    const found = findStaleBranches(
      [branch('trunk-x', { isDefault: true }), branch('has-pr', { openPr: 4 }), branch('develop'), branch('main'), branch('keep-me'), branch('ok')],
      { now: NOW, staleDays: 90, keep: ['keep-me'] }
    )
    expect(found.map((b) => b.name)).toEqual(['ok'])
  })

  it('leaves alone fresh work and branches too new to call merged', () => {
    const found = findStaleBranches([branch('wip', { ahead: 2, date: daysAgo(5) }), branch('just-created', { ahead: 0, date: daysAgo(1) })], { now: NOW, staleDays: 90 })
    expect(found).toEqual([])
  })

  it('respects the stale threshold', () => {
    const b = [branch('old', { ahead: 1, date: daysAgo(40) })]
    expect(findStaleBranches(b, { now: NOW, staleDays: 30 })).toHaveLength(1)
    expect(findStaleBranches(b, { now: NOW, staleDays: 60 })).toHaveLength(0)
  })
})

describe('findOldPrs / ageInDays', () => {
  const pr = (number: number, updated: number): StalePr => ({ number, title: `PR ${number}`, url: '', author: 'a', createdAt: daysAgo(updated + 5), updatedAt: daysAgo(updated), draft: false })
  it('keeps PRs idle for the threshold, oldest first', () => expect(findOldPrs([pr(1, 10), pr(2, 120), pr(3, 95)], { now: NOW, days: 90 }).map((p) => p.number)).toEqual([2, 3]))
  it('computes whole days, and treats bad dates as brand new', () => {
    expect(ageInDays(daysAgo(3.5), NOW)).toBe(3)
    expect(ageInDays('nonsense', NOW)).toBe(0)
  })
})

describe('validBranchName', () => {
  it.each(['feat/login', 'a', 'release-1.2', 'user/名前'])('accepts %s', (n) => expect(validBranchName(n)).toBe(true))
  it.each(['', '-rm', '/lead', 'trail/', 'a..b', 'a//b', 'a b', 'a~1', 'a^', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'x.lock', 'end.', 'a@{b', 'tab\tname'])('rejects %j', (n) => expect(validBranchName(n)).toBe(false))
})

describe('applyCleanup', () => {
  /** A client that records writes and answers the repo, open-PR and DELETE/PATCH calls. */
  const client = (openPrBranches: string[] = [], failOn?: string) => {
    const writes: string[] = []
    const gh = {
      get: async (path: string) => {
        if (path.includes('/pulls?')) return openPrBranches.some((b) => decodeURIComponent(path).includes(`head=o:${b}`)) ? [{ number: 1 }] : []
        return { default_branch: 'main' }
      },
      send: async (method: string, path: string) => {
        if (failOn && path.includes(failOn)) throw new Error('Reference does not exist')
        writes.push(`${method} ${path}`)
        return null
      }
    } as unknown as GitHub
    return { gh, writes }
  }

  it('deletes branches and closes PRs, reporting each', async () => {
    const { gh, writes } = client()
    const r = await applyCleanup(gh, 'o/r', { branches: ['old/feature', 'x'], closePrs: [3] })
    expect(r).toEqual({ ok: true, done: ['branch old/feature', 'branch x', 'PR #3'], failed: [] })
    expect(writes).toEqual(['DELETE /repos/o/r/git/refs/heads/old/feature', 'DELETE /repos/o/r/git/refs/heads/x', 'PATCH /repos/o/r/pulls/3'])
  })

  it('refuses the default branch, protected names and invalid names without calling GitHub', async () => {
    const { gh, writes } = client()
    const r = await applyCleanup(gh, 'o/r', { branches: ['main', 'develop', '../evil', ''], closePrs: [0, 1.5] })
    expect(writes).toEqual([])
    expect(r.ok).toBe(false)
    expect(r.failed.map((f) => f.item)).toEqual(['branch main', 'branch develop', 'branch ../evil', 'branch ', 'PR #0', 'PR #1.5'])
  })

  it('skips a branch that has gained an open PR since the list was loaded', async () => {
    const { gh, writes } = client(['busy'])
    const r = await applyCleanup(gh, 'o/r', { branches: ['busy', 'free'], closePrs: [] })
    expect(r.done).toEqual(['branch free'])
    expect(r.failed).toEqual([{ item: 'branch busy', error: 'it now has an open pull request' }])
    expect(writes).toEqual(['DELETE /repos/o/r/git/refs/heads/free'])
  })

  it('carries on after a failure and reports it', async () => {
    const { gh } = client([], 'heads/b')
    const r = await applyCleanup(gh, 'o/r', { branches: ['a', 'b', 'c'], closePrs: [] })
    expect(r.done).toEqual(['branch a', 'branch c'])
    expect(r.failed).toEqual([{ item: 'branch b', error: 'Reference does not exist' }])
  })
})

describe('listOpenPrs', () => {
  it('maps the pull list', async () => {
    const gh = { get: async () => [{ number: 2, title: 'T', html_url: 'u', user: null, created_at: 'c', updated_at: 'up', draft: true }] } as unknown as GitHub
    expect(await listOpenPrs(gh, 'o/r')).toEqual([{ number: 2, title: 'T', url: 'u', author: 'ghost', createdAt: 'c', updatedAt: 'up', draft: true }])
  })
})
