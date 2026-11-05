import { memo, useMemo } from 'react'
import type { PullRequest } from '../../../shared/types'
import { Avatar, checksTone, Empty, IconButton, StatusIcon } from '../components/ui'
import { matches, shortRepo, timeAgo, useNow } from '../lib/format'
import { api, toast, useSettings, useSnapshot, widgetRepos } from '../lib/store'
import { openModal } from '../lib/ui'
import type { WidgetProps } from './types'

const REVIEW_LABEL: Record<NonNullable<PullRequest['reviewDecision']>, [string, string]> = {
  APPROVED: ['Approved', 'ok'],
  CHANGES_REQUESTED: ['Changes requested', 'bad'],
  REVIEW_REQUIRED: ['Review required', 'warn']
}

export async function approve(pr: Pick<PullRequest, 'repo' | 'number'>): Promise<void> {
  const r = await api.approvePr(pr.repo, pr.number)
  toast(r.ok ? `Approved ${pr.repo}#${pr.number}` : `Approve failed: ${r.error}`, r.ok ? 'ok' : 'error')
}

export const PrsWidget = memo(function PrsWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const now = useNow()
  const repos = widgetRepos(widget.repos, settings.repos)
  const { filter: mode = 'all', hideDrafts = false } = widget.options
  const viewer = snapshot.viewer?.login

  const prs = useMemo(() => {
    let all = repos.flatMap((r) => snapshot.repos[r]?.prs ?? [])
    all.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    if (hideDrafts) all = all.filter((p) => !p.isDraft)
    if (mode === 'mine') all = all.filter((p) => p.author === viewer)
    if (mode === 'review') all = all.filter((p) => viewer && p.reviewers.includes(viewer))
    if (mode === 'failing') all = all.filter((p) => checksTone(p.checks) === 'bad')
    if (filter) all = all.filter((p) => matches(`${p.repo} #${p.number} ${p.title} ${p.author} ${p.branch} ${p.labels.map((l) => l.name).join(' ')}`, filter))
    return all
  }, [snapshot.repos, repos.join(), mode, hideDrafts, filter, viewer])

  if (!prs.length) return <Empty>No open pull requests.</Empty>
  const multiRepo = repos.length > 1

  return (
    <ul className="list">
      {prs.map((pr) => {
        const review = pr.reviewDecision ? REVIEW_LABEL[pr.reviewDecision] : null
        return (
          <li key={`${pr.repo}#${pr.number}`} className="row clickable" onClick={() => void api.openExternal(pr.url)}>
            <StatusIcon tone={checksTone(pr.checks)} title={`Checks: ${pr.checks?.toLowerCase() ?? 'none'}`} />
            <div className="row-main">
              <div className="row-title">
                {pr.isDraft && <span className="badge badge-muted">Draft</span>}
                <span className="strong">{pr.title}</span>
                {pr.labels.map((l) => (
                  <span key={l.name} className="label" style={{ ['--label' as string]: `#${l.color}` }}>
                    {l.name}
                  </span>
                ))}
              </div>
              <div className="row-meta">
                {multiRepo && <span className="chip">{shortRepo(pr.repo)}</span>}
                <span>#{pr.number}</span>
                <Avatar src={pr.authorAvatar} login={pr.author} size={14} />
                <span>{pr.author}</span>
                <span className="mono">{pr.branch}</span>
                <span className="add">+{pr.additions}</span>
                <span className="del">−{pr.deletions}</span>
                {pr.comments > 0 && <span>💬 {pr.comments}</span>}
              </div>
            </div>
            <div className="row-side">
              {review && <span className={`badge badge-${review[1]}`}>{review[0]}</span>}
              <span className="dim small">{timeAgo(pr.updatedAt, now)}</span>
            </div>
            <div className="row-actions">
              {pr.author !== viewer && <IconButton icon="check" title="Approve" onClick={() => void approve(pr)} />}
              {!pr.isDraft && <IconButton icon="branch" title="Merge…" onClick={() => openModal({ kind: 'merge', pr })} />}
              <IconButton icon="external" title="Open on GitHub" onClick={() => void api.openExternal(pr.url)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
})
