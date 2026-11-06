import { describe, expect, it } from 'vitest'
import { WIDGET_DEFAULTS } from '../../src/shared/defaults'
import type { Snapshot, WidgetType } from '../../src/shared/types'
import { activeFilters, OPTIONS, suggestions, valueOf } from '../../src/renderer/src/lib/filters'

const run = (over: object) => ({
  repo: 'o/a', id: 1, workflowId: 1, name: 'CI', title: 't', status: 'completed', conclusion: 'success', event: 'push', branch: 'main', sha: 's',
  actor: 'ann', actorAvatar: '', runNumber: 1, attempt: 1, createdAt: '', startedAt: '', updatedAt: '', url: '', ...over
})
const pr = (over: object) => ({ repo: 'o/a', number: 1, title: 't', url: '', author: 'bob', authorAvatar: '', isDraft: false, createdAt: '', updatedAt: '', branch: 'feat', additions: 0, deletions: 0, comments: 0, reviewDecision: null, checks: null, labels: [{ name: 'bug', color: 'f00' }], reviewers: [], ...over })

const snapshot = {
  auth: 'ok',
  events: [],
  polling: false,
  repos: {
    'o/a': { runs: [run({}), run({ id: 2, name: 'Deploy', branch: 'release', actor: 'cy' })], prs: [pr({}), pr({ number: 2, author: 'dee', branch: 'fix', labels: [{ name: 'ui', color: '0f0' }] })], workflows: [], defaultBranch: 'main' },
    'o/b': { runs: [run({ repo: 'o/b', branch: 'dev', name: 'Lint' })], prs: [], workflows: [], defaultBranch: 'main' }
  }
} as unknown as Snapshot

describe('suggestions', () => {
  it('collects branches from runs and PRs, de-duplicated and sorted', () => {
    expect(suggestions('branches', snapshot, ['o/a'])).toEqual(['feat', 'fix', 'main', 'release'])
  })
  it('only looks at the given repos', () => {
    expect(suggestions('workflows', snapshot, ['o/b'])).toEqual(['Lint'])
  })
  it.each([
    ['workflows', ['CI', 'Deploy']],
    ['actors', ['ann', 'cy']],
    ['authors', ['bob', 'dee']],
    ['labels', ['bug', 'ui']]
  ] as const)('%s', (kind, expected) => {
    expect(suggestions(kind, snapshot, ['o/a'])).toEqual(expected)
  })
  it('copes with repos that have no data yet', () => {
    expect(suggestions('branches', snapshot, ['o/missing'])).toEqual([])
  })
})

describe('activeFilters', () => {
  const defaults = (t: WidgetType) => WIDGET_DEFAULTS[t].options as Record<string, unknown>

  it('is zero for every widget left at its defaults', () => {
    for (const t of Object.keys(WIDGET_DEFAULTS) as WidgetType[]) expect(activeFilters(t, [], { ...defaults(t) }, defaults(t))).toBe(0)
  })
  it('treats unset options the same as their neutral value', () => {
    expect(activeFilters('runs', [], {}, defaults('runs'))).toBe(0)
  })
  it('counts chosen repos as one filter', () => {
    expect(activeFilters('runs', ['o/a', 'o/b'], {}, defaults('runs'))).toBe(1)
  })
  it('counts each changed filter', () => {
    expect(activeFilters('runs', [], { ...defaults('runs'), event: 'push', latestOnly: true, branch: 'main' }, defaults('runs'))).toBe(3)
  })
  it('does not count the deployments view as a filter', () => {
    expect(activeFilters('deployments', [], { view: 'history' }, defaults('deployments'))).toBe(0)
  })
  it('ignores options that are not filters (row limit)', () => {
    expect(activeFilters('runs', [], { ...defaults('runs'), limit: 99 }, defaults('runs'))).toBe(0)
  })
})

describe('OPTIONS', () => {
  it('gives every select a first choice to fall back to', () => {
    for (const specs of Object.values(OPTIONS))
      for (const o of specs!) if (o.kind === 'select') expect(o.choices.length).toBeGreaterThan(0)
  })
  it('uses unique keys per widget', () => {
    for (const specs of Object.values(OPTIONS)) expect(new Set(specs!.map((o) => o.key)).size).toBe(specs!.length)
  })
  it('valueOf falls back by kind', () => {
    const [select, bool, text] = [OPTIONS.runs![0], OPTIONS.runs!.find((o) => o.kind === 'bool')!, OPTIONS.runs![1]]
    expect(valueOf(select, {})).toBe('all')
    expect(valueOf(bool, {})).toBe(false)
    expect(valueOf(text, {})).toBe('')
  })
})
