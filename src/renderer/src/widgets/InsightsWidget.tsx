import { memo, useMemo } from 'react'
import type { WorkflowRun } from '../../../shared/types'
import { Empty, runTone } from '../components/ui'
import { duration, matches, shortRepo } from '../lib/format'
import { useSettings, useSnapshot, widgetRepos } from '../lib/store'
import { pushModal } from '../lib/ui'
import type { WidgetProps } from './types'

interface Stat {
  key: string
  repo: string
  name: string
  runs: WorkflowRun[]
  successRate: number
  avgMs: number
}

/** Per-workflow health from the recent runs we already have: pass rate, typical duration, last N outcomes. */
export const InsightsWidget = memo(function InsightsWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const repos = widgetRepos(widget.repos, settings.repos)

  const stats = useMemo(() => {
    const out: Stat[] = []
    for (const repo of repos) {
      const byWf = new Map<number, WorkflowRun[]>()
      for (const run of snapshot.repos[repo]?.runs ?? []) {
        if (run.status !== 'completed') continue
        if (widget.options.branch && run.branch !== widget.options.branch) continue
        if (widget.options.workflow && !matches(run.name, String(widget.options.workflow))) continue
        byWf.set(run.workflowId, [...(byWf.get(run.workflowId) ?? []), run])
      }
      for (const [id, runs] of byWf) {
        const decided = runs.filter((r) => r.conclusion === 'success' || runTone(r) === 'bad')
        const ok = decided.filter((r) => r.conclusion === 'success')
        const avgMs = ok.length ? ok.reduce((s, r) => s + (Date.parse(r.updatedAt) - Date.parse(r.startedAt)), 0) / ok.length : 0
        out.push({
          key: `${repo}:${id}`,
          repo,
          name: runs[0].name,
          runs: runs.slice(0, 20).reverse(),
          successRate: decided.length ? ok.length / decided.length : 1,
          avgMs
        })
      }
    }
    return out
      .filter((s) => !filter || matches(`${s.repo} ${s.name}`, filter))
      .sort((a, b) => a.successRate - b.successRate || b.runs.length - a.runs.length)
  }, [snapshot.repos, repos.join(), filter, widget.options.branch, widget.options.workflow])

  if (!stats.length) return <Empty>No completed runs yet.</Empty>

  return (
    <table className="insights">
      <thead>
        <tr>
          <th>Workflow</th>
          <th className="num">Pass rate</th>
          <th className="num">Avg time</th>
          <th>Recent runs (oldest → newest)</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.key}>
            <td>
              <div className="strong">{s.name}</div>
              {repos.length > 1 && <div className="dim small">{shortRepo(s.repo)}</div>}
            </td>
            <td className={`num ${s.successRate < 0.7 ? 'del' : s.successRate < 0.95 ? 'warn-text' : 'add'}`}>{Math.round(s.successRate * 100)}%</td>
            <td className="num dim">{s.avgMs ? duration(new Date(0).toISOString(), s.avgMs) : '–'}</td>
            <td>
              <div className="spark">
                {s.runs.map((r) => (
                  <button
                    key={r.id}
                    className={`spark-bar status-${runTone(r)}`}
                    title={`#${r.runNumber} ${r.conclusion} · ${r.branch} · ${duration(r.startedAt, r.updatedAt)}`}
                    onClick={() => pushModal({ kind: 'run', run: r })}
                  />
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
})
