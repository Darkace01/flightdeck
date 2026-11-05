import { memo } from 'react'
import { checksTone, Empty, runTone, StatusIcon } from '../components/ui'
import { matches } from '../lib/format'
import { api, useSettings, useSnapshot, widgetRepos } from '../lib/store'
import type { WidgetProps } from './types'

export const SummaryWidget = memo(function SummaryWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const repos = widgetRepos(widget.repos, settings.repos).filter((r) => !filter || matches(r, filter))

  if (!repos.length) return <Empty>Add repositories in Settings to get started.</Empty>

  return (
    <div className="tiles">
      {repos.map((repo) => {
        const s = snapshot.repos[repo]
        const main = s?.runs.find((r) => r.branch === s.defaultBranch && r.status === 'completed')
        const running = s?.runs.filter((r) => r.status !== 'completed').length ?? 0
        const failingPrs = s?.prs.filter((p) => checksTone(p.checks) === 'bad').length ?? 0
        const [owner, name] = repo.split('/')
        return (
          <button key={repo} className={`tile${s?.error ? ' tile-error' : ''}`} onClick={() => void api.openExternal(`https://github.com/${repo}`)} title={s?.error ?? repo}>
            <div className="tile-head">
              {main ? <StatusIcon tone={runTone(main)} title={`${s?.defaultBranch}: ${main.conclusion}`} /> : <StatusIcon tone="muted" title="No runs on default branch" />}
              <span className="tile-name">
                <span className="dim">{owner}/</span>
                {name}
              </span>
            </div>
            <div className="tile-stats">
              {s?.error ? (
                <span className="del small">{s.error}</span>
              ) : (
                <>
                  <span title="Runs in progress" className={running ? 'live' : ''}>
                    {running} running
                  </span>
                  <span title="Open pull requests">{s?.prs.length ?? '–'} PRs</span>
                  {failingPrs > 0 && <span className="del">{failingPrs} failing</span>}
                </>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
})
