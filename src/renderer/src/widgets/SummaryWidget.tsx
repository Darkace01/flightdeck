import { memo, useLayoutEffect, useRef } from 'react'
import { checksTone, Empty, runTone, StatusIcon } from '../components/ui'
import { matches } from '../lib/format'
import { useSettings, useSnapshot, widgetRepos } from '../lib/store'
import { fitWidgetHeight } from '../lib/layout'
import { openRepo } from '../lib/open'
import type { WidgetProps } from './types'

// Rows of tiles shown before the widget stops growing and scrolls instead.
const MAX_ROWS = 3

export const SummaryWidget = memo(function SummaryWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const repos = widgetRepos(widget.repos, settings.repos).filter((r) => !filter || matches(r, filter))
  const tilesRef = useRef<HTMLDivElement>(null)

  // Grow (or shrink) the widget to show every row of tiles, up to MAX_ROWS; past that the tiles scroll.
  useLayoutEffect(() => {
    const el = tilesRef.current
    const frame = el?.closest<HTMLElement>('.widget')
    if (!el || !frame) return
    const fit = () => {
      const tiles = [...el.children] as HTMLElement[]
      if (!tiles.length) return
      const perRow = tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length
      const rows = Math.min(MAX_ROWS, Math.ceil(tiles.length / perRow))
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0
      const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom)
      const wanted = rows * tiles[0].offsetHeight + (rows - 1) * gap + pad
      const body = el.parentElement!.clientHeight
      fitWidgetHeight(widget.id, frame.offsetHeight + wanted - body)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [widget.id, repos.length, settings.density])

  if (!repos.length) return <Empty>Add repositories in Settings to get started.</Empty>

  return (
    <div className="tiles" ref={tilesRef}>
      {repos.map((repo) => {
        const s = snapshot.repos[repo]
        const main = s?.runs.find((r) => r.branch === s.defaultBranch && r.status === 'completed')
        const running = s?.runs.filter((r) => r.status !== 'completed').length ?? 0
        const failingPrs = s?.prs.filter((p) => checksTone(p.checks) === 'bad').length ?? 0
        const [owner, name] = repo.split('/')
        return (
          <button key={repo} className={`tile${s?.error ? ' tile-error' : ''}`} onClick={() => openRepo(repo)} title={s?.error ?? repo}>
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
