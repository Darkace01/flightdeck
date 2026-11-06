import { describe, expect, it } from 'vitest'
import { computeCiHealth, rankWorkflows, runDurationMs } from '../../src/shared/cihealth'
import type { WorkflowRun } from '../../src/shared/types'

const NOW = Date.parse('2026-03-10T12:00:00Z')
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

let id = 0
const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  repo: 'o/r',
  id: ++id,
  workflowId: 1,
  name: 'CI',
  title: '',
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  branch: 'main',
  sha: `sha${id}`,
  actor: 'a',
  actorAvatar: '',
  runNumber: id,
  attempt: 1,
  createdAt: iso(60),
  startedAt: iso(60),
  updatedAt: iso(58),
  url: '',
  ...over
})

describe('runDurationMs', () => {
  it('is the time from start to last update', () => expect(runDurationMs(run())).toBe(120_000))
  it('is 0 for unusable timestamps', () => {
    expect(runDurationMs(run({ startedAt: '', updatedAt: iso(1) }))).toBe(0)
    expect(runDurationMs(run({ startedAt: iso(1), updatedAt: iso(5) }))).toBe(0)
  })
})

describe('computeCiHealth', () => {
  it('computes failure rate per workflow, ignoring cancelled and running runs', () => {
    const h = computeCiHealth(
      [run(), run(), run({ conclusion: 'failure' }), run({ conclusion: 'cancelled' }), run({ status: 'in_progress', conclusion: null }), run({ workflowId: 2, name: 'Deploy' })],
      { now: NOW }
    )
    const ci = h.workflows.find((w) => w.name === 'CI')!
    expect(ci).toMatchObject({ runs: 4, failures: 1 })
    expect(ci.failureRate).toBeCloseTo(1 / 3)
    expect(h.workflows.find((w) => w.name === 'Deploy')!.failureRate).toBe(0)
    expect(h.runs).toBe(5)
    expect(h.failureRate).toBeCloseTo(1 / 4)
  })

  it('finds flaky commits: failed then passed on one commit, or passed only on a retry', () => {
    const h = computeCiHealth(
      [
        run({ sha: 'x', conclusion: 'failure' }),
        run({ sha: 'x', conclusion: 'success' }),
        run({ sha: 'y', conclusion: 'success', attempt: 2 }),
        run({ sha: 'z', conclusion: 'success' }),
        run({ sha: 'w', conclusion: 'failure' })
      ],
      { now: NOW }
    )
    expect(h.workflows[0].flakyCommits).toBe(2)
    expect(h.workflows[0].flakyRate).toBeCloseTo(2 / 4)
  })

  it('sums wall-clock minutes and tracks average and max duration', () => {
    const h = computeCiHealth([run(), run({ startedAt: iso(60), updatedAt: iso(54) })], { now: NOW })
    expect(h.workflows[0]).toMatchObject({ avgMs: 4 * 60_000, maxMs: 6 * 60_000, minutes: 8 })
    expect(h.minutes).toBe(8)
  })

  it('limits to a time window and a branch', () => {
    const old = run({ createdAt: new Date(NOW - 10 * 86_400_000).toISOString() })
    const feat = run({ branch: 'feat' })
    expect(computeCiHealth([old, run(), feat], { now: NOW, days: 7 }).runs).toBe(2)
    expect(computeCiHealth([old, run(), feat], { now: NOW, days: 7, branch: 'feat' }).runs).toBe(1)
  })

  it('handles no runs', () => expect(computeCiHealth([])).toEqual({ runs: 0, failures: 0, failureRate: 0, minutes: 0, workflows: [] }))
})

describe('rankWorkflows', () => {
  const h = computeCiHealth(
    [
      run({ workflowId: 1, name: 'A', conclusion: 'failure' }),
      run({ workflowId: 1, name: 'A' }),
      run({ workflowId: 2, name: 'B', startedAt: iso(70), updatedAt: iso(58) }),
      run({ workflowId: 3, name: 'C', conclusion: 'failure' })
    ],
    { now: NOW }
  )
  const names = (v: Parameters<typeof rankWorkflows>[1]) => rankWorkflows(h.workflows, v).map((w) => w.name)

  it('puts the worst failure rate first and drops workflows that never failed', () => expect(names('failing')).toEqual(['C', 'A']))
  it('puts the slowest first', () => expect(names('slowest')).toEqual(['B', 'A', 'C']))
  it('orders by minutes used', () => expect(names('minutes')[0]).toBe('B'))
  it('keeps only workflows with flaky commits', () => expect(names('flaky')).toEqual([]))
})
