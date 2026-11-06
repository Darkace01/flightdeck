import { describe, expect, it } from 'vitest'
import type { GitHub } from '../../src/main/github'
import { releaseDraft } from '../../src/main/repoTools'
import { draftReleaseNotes, sectionOf } from '../../src/shared/releaseNotes'
import type { MergedPr } from '../../src/shared/types'

const pr = (number: number, title: string, labels: string[] = [], author = 'alice', mergedAt = `2026-02-0${number}T00:00:00Z`): MergedPr => ({
  number, title, labels, author, mergedAt, url: `https://github.com/o/r/pull/${number}`
})

describe('sectionOf', () => {
  it('prefers labels, then a conventional-commit prefix', () => {
    expect(sectionOf(pr(1, 'Anything', ['bug']))).toBe('Fixes')
    expect(sectionOf(pr(2, 'feat(ui): dark mode'))).toBe('Features')
    expect(sectionOf(pr(3, 'refactor!: drop v1'))).toBe('Breaking changes')
    expect(sectionOf(pr(4, 'Tidy things'))).toBe('Other changes')
  })
})

describe('draftReleaseNotes', () => {
  it('groups PRs under headings, oldest first, and credits authors once', () => {
    const md = draftReleaseNotes([pr(3, 'fix: crash on start', [], 'bob'), pr(1, 'feat: add tray'), pr(2, 'Add export', ['enhancement']), pr(4, 'bump', [], 'dependabot[bot]')], {
      repo: 'o/r', since: 'v1.0.0', tag: 'v1.1.0'
    })
    expect(md.indexOf('## Features')).toBeLessThan(md.indexOf('## Fixes'))
    expect(md).toContain('- add tray ([#1](https://github.com/o/r/pull/1)) by @alice')
    expect(md.indexOf('add tray')).toBeLessThan(md.indexOf('Add export'))
    expect(md).toContain('## Other changes')
    expect(md).toContain('Thanks to @alice, @bob.')
    expect(md).toContain('compare/v1.0.0...v1.1.0')
  })
  it('says so when nothing merged', () => {
    expect(draftReleaseNotes([], { repo: 'o/r' })).toMatch(/No merged/)
  })
})

describe('releaseDraft', () => {
  const fake = (pulls: object[]): GitHub => ({
    get: async (path: string) => {
      if (path.includes('/releases')) return [{ tag_name: 'v1.0.0', created_at: '2026-01-10T00:00:00Z', draft: false, prerelease: false }]
      return pulls
    }
  }) as unknown as GitHub
  const p = (number: number, merged: string | null) => ({
    number, title: `PR ${number}`, html_url: '', merged_at: merged, updated_at: merged ?? '2026-02-01T00:00:00Z', user: { login: 'a' }, labels: [{ name: 'bug' }]
  })
  it('keeps only PRs merged after the last release', async () => {
    const d = await releaseDraft(fake([p(3, '2026-02-01T00:00:00Z'), p(2, null), p(1, '2026-01-05T00:00:00Z')]), 'o/r', 'main')
    expect(d.since).toBe('v1.0.0')
    expect(d.prs.map((x) => x.number)).toEqual([3])
    expect(d.prs[0].labels).toEqual(['bug'])
  })
})
