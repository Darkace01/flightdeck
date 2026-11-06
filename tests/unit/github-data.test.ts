import { describe, expect, it } from 'vitest'
import { listDeployments } from '../../src/main/deployments'
import type { GitHub } from '../../src/main/github'
import { parseBlame, parseLog, parseRefs } from '../../src/main/gitTools'
import { branchGraph } from '../../src/main/repoTools'
import { githubRepo } from '../../src/main/scan'

describe('githubRepo', () => {
  it.each([
    ['https://github.com/acme/api.git', 'acme/api'],
    ['https://github.com/acme/api', 'acme/api'],
    ['https://github.com/acme/api/', 'acme/api'],
    ['git@github.com:acme/api.git', 'acme/api'],
    ['ssh://git@github.com/acme/api.git', 'acme/api'],
    ['git@github.com-work:acme/my.repo.git', 'acme/my.repo'],
    ['https://user:token@github.com/acme/api.git', 'acme/api']
  ])('%s → %s', (url, repo) => expect(githubRepo(url)).toBe(repo))

  it.each(['https://gitlab.com/acme/api.git', 'git@bitbucket.org:acme/api.git', '/local/path', ''])('ignores %s', (url) => expect(githubRepo(url)).toBeUndefined())
})

describe('parseRefs', () => {
  it('classifies each kind of ref', () => {
    expect(parseRefs('HEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0, refs/heads/feat/x')).toEqual([
      'head:main',
      'remote:origin/main',
      'tag:v1.0',
      'branch:feat/x'
    ])
  })
  it('marks a detached HEAD', () => expect(parseRefs('HEAD, tag: refs/tags/v2')).toEqual(['head:HEAD', 'tag:v2']))
  it('handles no refs', () => expect(parseRefs('')).toEqual([]))
})

describe('parseLog', () => {
  it('reads the fields git log prints, including root commits and merges', () => {
    const out = ['a1\x1fb1 b2\x1fMerge it\x1fAnn\x1fann@x\x1f2026-01-02T00:00:00Z\x1fHEAD -> refs/heads/main\x1e', '\nb1\x1f\x1fFirst\x1fBob\x1fbob@x\x1f2026-01-01T00:00:00Z\x1f\x1e'].join('')
    expect(parseLog(out)).toEqual([
      { sha: 'a1', parents: ['b1', 'b2'], subject: 'Merge it', author: 'Ann', email: 'ann@x', date: '2026-01-02T00:00:00Z', refs: ['head:main'] },
      { sha: 'b1', parents: [], subject: 'First', author: 'Bob', email: 'bob@x', date: '2026-01-01T00:00:00Z', refs: [] }
    ])
  })
  it('handles subjects with tabs and empty output', () => {
    expect(parseLog('')).toEqual([])
    expect(parseLog('a\x1f\x1fhas\ttab\x1fA\x1fa@x\x1fd\x1f\x1e')[0].subject).toBe('has\ttab')
  })
})

describe('parseBlame', () => {
  const sha1 = '1'.repeat(40)
  const sha2 = '2'.repeat(40)
  const porcelain = [
    `${sha1} 1 1 2`,
    'author Ann',
    'author-time 1700000000',
    'summary First commit',
    '\tline one\r',
    `${sha1} 2 2`,
    '\tline two',
    `${sha2} 3 3 1`,
    'author Bob',
    'author-time 1710000000',
    'summary Second',
    '\t'
  ].join('\n')

  it('describes each line with its commit, reusing details git only prints once', () => {
    const lines = parseBlame(porcelain)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toEqual({ line: 2, sha: sha1, author: 'Ann', date: new Date(1700000000 * 1000).toISOString(), summary: 'First commit', text: 'line two' })
    expect(lines[2].author).toBe('Bob')
  })
  it('strips Windows line endings and keeps empty lines', () => {
    const lines = parseBlame(porcelain)
    expect(lines[0].text).toBe('line one')
    expect(lines[2].text).toBe('')
  })
})

/** A GitHub client that answers from canned data. */
const fakeGh = (answer: (path: string, vars?: Record<string, unknown>) => unknown) =>
  ({
    get: async (path: string) => answer(path),
    graphql: async (_q: string, vars: Record<string, unknown>) => answer('graphql', vars)
  }) as unknown as GitHub

describe('listDeployments', () => {
  const node = (over: object) => ({
    databaseId: 1,
    environment: 'prod-acme',
    task: 'deploy',
    description: null,
    state: 'ACTIVE',
    createdAt: '2026-01-02T00:00:00Z',
    commitOid: 'c1',
    ref: { name: 'main' },
    creator: { login: 'ann', avatarUrl: 'u' },
    latestStatus: { state: 'SUCCESS', createdAt: '2026-01-02T00:01:30Z', logUrl: 'https://github.com/o/r/actions/runs/77/job/1', environmentUrl: '', description: '' },
    ...over
  })
  const gh = fakeGh(() => ({
    repository: {
      environments: { nodes: [{ name: 'dev' }, { name: 'prod-acme' }] },
      deployments: {
        nodes: [
          node({}),
          // A second job of the same run deploying to the same environment: should be merged away.
          node({ databaseId: 2 }),
          node({ databaseId: 3, environment: 'dev', state: 'FAILURE', commitOid: 'c2', latestStatus: { state: 'FAILURE', createdAt: '2026-01-01T00:00:10Z', logUrl: null, environmentUrl: null, description: 'boom' } }),
          node({ databaseId: 4, environment: 'staging-acme', state: 'IN_PROGRESS', latestStatus: { state: 'IN_PROGRESS', createdAt: '', logUrl: 'https://github.com/o/r/actions/runs/88/job/1', environmentUrl: null, description: null } }),
          node({ databaseId: 5, environment: null })
        ]
      },
      refs: { nodes: [{ name: 'v1.0', target: { oid: 'tagobj', target: { oid: 'c1' } } }, { name: 'light', target: { oid: 'c2' } }] }
    }
  }))

  it('maps states, versions, runs and clients, and merges per-job duplicates', async () => {
    const r = await listDeployments(gh, 'o/r')
    expect(r.deployments.map((d) => d.id)).toEqual([1, 3, 4])
    const [prod, dev, staging] = r.deployments
    expect(prod).toMatchObject({ state: 'success', current: true, version: 'v1.0', runId: 77, stage: 'prod', client: 'acme', finishedAt: '2026-01-02T00:01:30Z' })
    expect(dev).toMatchObject({ state: 'failure', current: false, version: 'light', runId: null, client: null, description: 'boom' })
    expect(staging).toMatchObject({ state: 'in_progress', finishedAt: null, runId: 88, stage: 'staging' })
  })

  it('lists configured environments plus any only seen in deployments', async () => {
    expect((await listDeployments(gh, 'o/r')).environments).toEqual(['dev', 'prod-acme', 'staging-acme'])
  })

  it('explains a repo GitHub can’t find instead of crashing on null', async () => {
    await expect(listDeployments(fakeGh(() => ({ repository: null })), 'o/gone')).rejects.toThrow(/not found/)
  })

  it('copes with missing connections and null nodes', async () => {
    const r = await listDeployments(fakeGh(() => ({ repository: { environments: null, deployments: { nodes: [null] }, refs: { nodes: [null] } } })), 'o/r')
    expect(r).toEqual({ repo: 'o/r', environments: [], deployments: [] })
  })
})

describe('branchGraph', () => {
  const commit = (sha: string, parents: string[], date: string) => ({ sha, html_url: `u/${sha}`, parents: parents.map((p) => ({ sha: p })), commit: { message: `${sha}\nbody`, author: { name: 'n', date } }, author: null })
  it('merges branches, labels tips, and orders children before parents even with clock skew', async () => {
    const gh = fakeGh((path) => {
      if (path.includes('sha=main')) return [commit('m2', ['m1'], '2026-01-03'), commit('m1', ['base'], '2026-01-02'), commit('base', [], '2026-01-01')]
      // f1's parent "base" claims to be newer than f1 (a skewed clock).
      if (path.includes('sha=feat')) return [commit('f1', ['base'], '2025-12-31'), commit('base', [], '2026-01-01')]
      throw new Error('unexpected ' + path)
    })
    const g = await branchGraph(gh, 'o/r', ['main', 'feat'])
    const order = g.map((c) => c.sha)
    expect(new Set(order).size).toBe(order.length)
    for (const c of g) for (const p of c.parents) if (order.includes(p)) expect(order.indexOf(p)).toBeGreaterThan(order.indexOf(c.sha))
    expect(g.find((c) => c.sha === 'm2')!.refs).toEqual(['head:main'])
    expect(g.find((c) => c.sha === 'f1')!.refs).toEqual(['branch:feat'])
    expect(g[0].subject).toBe('m2')
  })
  it('asks for at most 8 branches', async () => {
    const asked: string[] = []
    const gh = fakeGh((path) => (asked.push(path), []))
    await branchGraph(gh, 'o/r', Array.from({ length: 12 }, (_, i) => `b${i}`))
    expect(asked).toHaveLength(8)
  })
})
