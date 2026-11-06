import { memo, useMemo } from 'react'
import { computeCiHealth, rankWorkflows, type HealthView } from '../../../shared/cihealth'
import { Empty } from '../components/ui'
import { duration, matches, shortRepo } from '../lib/format'
import { useSettings, useSnapshot, widgetRepos } from '../lib/store'
import type { WidgetProps } from './types'

const pct = (n: number) => `${Math.round(n * 100)}%`
const mins = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1))
const length = (ms: number) => duration(new Date(0).toISOString(), ms)

const HEADS: Record<HealthView, string> = { failing: 'Failure rate', flaky: 'Flaky commits', slowest: 'Average time', minutes: 'Minutes (est.)' }

/** Failure rates, flaky workflows, slowest workflows and estimated Actions minutes, from the runs already polled. */
export const CiHealthWidget = memo(function CiHealthWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const repos = widgetRepos(widget.repos, settings.repos)
  const view = (String(widget.options.view ?? 'failing') as HealthView) in HEADS ? (String(widget.options.view ?? 'failing') as HealthView) : 'failing'
  const days = Number(widget.options.days) || 14
  const branch = String(widget.options.branch ?? '')

  const health = useMemo(
    () => computeCiHealth(repos.flatMap((r) => snapshot.repos[r]?.runs ?? []), { days, branch: branch || undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.repos, repos.join(), days, branch]
  )
  const rows = rankWorkflows(health.workflows, view).filter((w) => !filter || matches(`${w.repo} ${w.name}`, filter))
  if (!health.workflows.length) return <Empty>No completed runs in the last {days} days.</Empty>

  return (
    <div className="cihealth">
      <div className="health-tiles">
        <div className="health-tile">
          <b className={health.failureRate > 0.3 ? 'del' : health.failureRate > 0.1 ? 'warn-text' : 'add'}>{pct(health.failureRate)}</b>
          <span className="dim small">failure rate</span>
        </div>
        <div className="health-tile">
          <b>{health.runs}</b>
          <span className="dim small">runs</span>
        </div>
        <div className="health-tile">
          <b>{health.workflows.filter((w) => w.flakyCommits > 0).length}</b>
          <span className="dim small">flaky workflows</span>
        </div>
        <div className="health-tile">
          <b>{mins(health.minutes)}</b>
          <span className="dim small">Actions minutes (est.)</span>
        </div>
      </div>
      {!rows.length ? (
        <Empty>{view === 'flaky' ? 'No flaky workflows. Nothing failed then passed on the same commit.' : view === 'failing' ? 'No failures in this period.' : 'Nothing to show.'}</Empty>
      ) : (
        <table className="insights">
          <thead>
            <tr>
              <th>Workflow</th>
              <th className="num">Runs</th>
              <th className="num">{HEADS[view]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={`${w.repo}:${w.workflowId}`}>
                <td>
                  <div className="strong">{w.name}</div>
                  {repos.length > 1 && <div className="dim small">{shortRepo(w.repo)}</div>}
                </td>
                <td className="num dim">{w.runs}</td>
                <td className="num">
                  {view === 'failing' && (
                    <span className={w.failureRate > 0.3 ? 'del' : w.failureRate > 0.1 ? 'warn-text' : 'add'}>
                      {pct(w.failureRate)} <span className="dim small">({w.failures})</span>
                    </span>
                  )}
                  {view === 'flaky' && (
                    <span className="warn-text">
                      {w.flakyCommits} <span className="dim small">({pct(w.flakyRate)})</span>
                    </span>
                  )}
                  {view === 'slowest' && (
                    <span>
                      {length(w.avgMs)} <span className="dim small">max {length(w.maxMs)}</span>
                    </span>
                  )}
                  {view === 'minutes' && mins(w.minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dim small health-note">Based on the latest runs Pushback polls (up to 40 per repo). Minutes are wall-clock time, not billed minutes.</div>
    </div>
  )
})
