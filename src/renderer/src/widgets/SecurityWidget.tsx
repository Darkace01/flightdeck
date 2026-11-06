import { memo, useMemo } from 'react'
import { countBySeverity, filterAlerts, isDependabot, SEVERITY_ORDER } from '../../../shared/security'
import type { AlertKind } from '../../../shared/types'
import { Avatar, Empty, Skeleton } from '../components/ui'
import { matches, shortRepo, timeAgo, useNow } from '../lib/format'
import { openPr } from '../lib/open'
import { useSecurity } from '../lib/security'
import { api, useSettings, useSnapshot, widgetRepos } from '../lib/store'
import type { WidgetProps } from './types'

const KIND_LABEL: Record<AlertKind, string> = { dependabot: 'Dependabot', 'code-scanning': 'Code scanning', 'secret-scanning': 'Secret scanning' }

/** Open security alerts, or the open Dependabot PRs (taken from the polled PRs, so they cost no extra requests). */
export const SecurityWidget = memo(function SecurityWidget({ widget, filter }: WidgetProps) {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const now = useNow()
  const repos = widgetRepos(widget.repos, settings.repos)
  const view = String(widget.options.view ?? 'alerts')
  const { data, loading, errors } = useSecurity(view === 'alerts' ? repos : [])
  const multiRepo = repos.length > 1

  const alerts = useMemo(
    () =>
      filterAlerts(
        data.flatMap((d) => d.alerts),
        String(widget.options.kind ?? ''),
        String(widget.options.severity ?? '')
      ).filter((a) => !filter || matches(`${a.repo} ${a.title} ${a.detail} ${KIND_LABEL[a.kind]} ${a.severity}`, filter)),
    [data, widget.options.kind, widget.options.severity, filter]
  )
  const prs = useMemo(
    () =>
      repos
        .flatMap((r) => snapshot.repos[r]?.prs ?? [])
        .filter((p) => isDependabot(p.author) && (!filter || matches(`${p.repo} ${p.title}`, filter)))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.repos, repos.join(), filter]
  )

  if (view === 'dependabot-prs') {
    if (!prs.length) return <Empty>No open Dependabot pull requests.</Empty>
    return (
      <ul className="list">
        {prs.map((pr) => (
          <li key={`${pr.repo}#${pr.number}`} className="row clickable" onClick={() => openPr(pr.repo, pr.number)}>
            <Avatar src={pr.authorAvatar} login={pr.author} size={18} />
            <div className="row-main">
              <div className="row-title strong">{pr.title}</div>
              <div className="row-meta">
                {multiRepo && <span className="chip">{shortRepo(pr.repo)}</span>}
                <span>#{pr.number}</span>
                <span>{timeAgo(pr.createdAt, now)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (loading && !data.length) return <Skeleton />
  const all = data.flatMap((d) => d.alerts)
  const counts = countBySeverity(all)
  const unavailable = [...new Set(data.flatMap((d) => Object.entries(d.unavailable).map(([k, why]) => `${KIND_LABEL[k as AlertKind]}: ${why}`)))]

  return (
    <div className="security">
      <div className="sec-summary">
        {SEVERITY_ORDER.map((s) => (
          <span key={s} className={`sev sev-${s}${counts[s] ? '' : ' zero'}`} title={`${counts[s]} ${s}`}>
            {counts[s]} {s}
          </span>
        ))}
      </div>
      {!alerts.length ? (
        <Empty>{all.length ? 'No alerts match the filters.' : 'No open security alerts.'}</Empty>
      ) : (
        <ul className="list">
          {alerts.map((a) => (
            <li key={`${a.repo}:${a.kind}:${a.number}`} className="row clickable" onClick={() => void api.openExternal(a.url)}>
              <span className={`sev sev-${a.severity}`}>{a.severity}</span>
              <div className="row-main">
                <div className="row-title strong">{a.title}</div>
                <div className="row-meta">
                  {multiRepo && <span className="chip">{shortRepo(a.repo)}</span>}
                  <span>{KIND_LABEL[a.kind]}</span>
                  {a.detail && <span className="mono">{a.detail}</span>}
                  <span>{timeAgo(a.createdAt, now)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {unavailable.length > 0 && <div className="dim small sec-note">{unavailable.join(' · ')}</div>}
      {errors.length > 0 && <div className="dim small sec-note">{errors.join(' · ')}</div>}
    </div>
  )
})
