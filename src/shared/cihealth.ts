import type { WorkflowRun } from './types'

// CI health analytics from runs the poller already fetched (no extra requests): failure rates, flaky and slow
// workflows, and an estimate of Actions minutes. The poller keeps the latest 40 runs per repo, so this describes
// recent history, not a full audit.

export interface WorkflowHealth {
  repo: string
  workflowId: number
  name: string
  /** Completed runs in the window, cancelled and skipped ones included. */
  runs: number
  failures: number
  /** failures / (failures + successes); cancelled and skipped runs don't count either way. */
  failureRate: number
  /** Commits where this workflow both failed and passed (or passed only on a retry). */
  flakyCommits: number
  /** Share of this workflow's commits that were flaky. */
  flakyRate: number
  avgMs: number
  maxMs: number
  /** Wall-clock minutes of the runs: an estimate, as billing rounds each job up and weights by runner OS. */
  minutes: number
}

export interface CiHealth {
  runs: number
  failures: number
  failureRate: number
  minutes: number
  workflows: WorkflowHealth[]
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure'])

export function runDurationMs(run: Pick<WorkflowRun, 'startedAt' | 'updatedAt'>): number {
  const ms = Date.parse(run.updatedAt) - Date.parse(run.startedAt)
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

export function computeCiHealth(runs: WorkflowRun[], opts: { now?: number; days?: number; branch?: string } = {}): CiHealth {
  const since = opts.days ? (opts.now ?? Date.now()) - opts.days * 86_400_000 : 0
  const groups = new Map<string, WorkflowRun[]>()
  for (const r of runs) {
    if (r.status !== 'completed') continue
    if (opts.branch && r.branch !== opts.branch) continue
    if (since && Date.parse(r.createdAt) < since) continue
    const key = `${r.repo}:${r.workflowId}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }

  const workflows: WorkflowHealth[] = []
  for (const list of groups.values()) {
    const failures = list.filter((r) => FAILED.has(r.conclusion ?? '')).length
    const successes = list.filter((r) => r.conclusion === 'success').length
    const bySha = new Map<string, WorkflowRun[]>()
    for (const r of list) bySha.set(r.sha, [...(bySha.get(r.sha) ?? []), r])
    let flakyCommits = 0
    for (const same of bySha.values()) {
      const failed = same.some((r) => FAILED.has(r.conclusion ?? ''))
      const passed = same.some((r) => r.conclusion === 'success')
      // A run that passed on attempt 2+ failed before it: GitHub only keeps the latest attempt's result.
      const retried = same.some((r) => r.conclusion === 'success' && r.attempt > 1)
      if ((failed && passed) || retried) flakyCommits++
    }
    const durations = list.map(runDurationMs).filter((ms) => ms > 0)
    const total = durations.reduce((s, ms) => s + ms, 0)
    workflows.push({
      repo: list[0].repo,
      workflowId: list[0].workflowId,
      name: list[0].name,
      runs: list.length,
      failures,
      failureRate: failures + successes ? failures / (failures + successes) : 0,
      flakyCommits,
      flakyRate: flakyCommits / bySha.size,
      avgMs: durations.length ? total / durations.length : 0,
      maxMs: durations.length ? Math.max(...durations) : 0,
      minutes: total / 60_000
    })
  }

  const failures = workflows.reduce((s, w) => s + w.failures, 0)
  const successes = [...groups.values()].flat().filter((r) => r.conclusion === 'success').length
  return {
    runs: workflows.reduce((s, w) => s + w.runs, 0),
    failures,
    failureRate: failures + successes ? failures / (failures + successes) : 0,
    minutes: workflows.reduce((s, w) => s + w.minutes, 0),
    workflows
  }
}

export type HealthView = 'failing' | 'flaky' | 'slowest' | 'minutes'

/** The workflows worth showing for a view, worst first; workflows with nothing to report in it are dropped. */
export function rankWorkflows(workflows: WorkflowHealth[], view: HealthView): WorkflowHealth[] {
  const copy = [...workflows]
  switch (view) {
    case 'failing':
      return copy.filter((w) => w.failures > 0).sort((a, b) => b.failureRate - a.failureRate || b.failures - a.failures)
    case 'flaky':
      return copy.filter((w) => w.flakyCommits > 0).sort((a, b) => b.flakyRate - a.flakyRate || b.flakyCommits - a.flakyCommits)
    case 'slowest':
      return copy.filter((w) => w.avgMs > 0).sort((a, b) => b.avgMs - a.avgMs)
    case 'minutes':
      return copy.filter((w) => w.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  }
}
