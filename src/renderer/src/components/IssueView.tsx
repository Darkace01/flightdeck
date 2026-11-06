import { useState } from 'react'
import { timeAgo, useNow } from '../lib/format'
import { openRepo } from '../lib/open'
import { api, toast } from '../lib/store'
import { closeModal } from '../lib/ui'
import { invalidate, useLoad } from '../lib/useLoad'
import { Markdown } from './Markdown'
import { Avatar, Modal, Skeleton } from './ui'

export function IssueModal({ repo, number }: { repo: string; number: number }) {
  const now = useNow()
  const { data: issue, error, reload } = useLoad(repo, () => api.issueDetail(repo, number), [number])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const url = `https://github.com/${repo}/issues/${number}`

  const setState = async (state: 'open' | 'closed', reason?: 'completed' | 'not_planned') => {
    const r = await api.setIssueState(repo, number, state, reason)
    if (!r.ok) return toast(`Couldn't update the issue: ${r.error}`, 'error')
    toast(state === 'closed' ? `Closed #${number}` : `Reopened #${number}`, 'ok')
    invalidate(repo)
  }

  const comment = async (andClose = false) => {
    setBusy(true)
    const r = await api.commentPr(repo, number, text.trim())
    setBusy(false)
    if (!r.ok) return toast(`Comment failed: ${r.error}`, 'error')
    setText('')
    if (andClose) await setState('closed', 'completed')
    else reload()
  }

  const open = issue?.state === 'open'
  return (
    <Modal title={`${repo} #${number}`} onClose={closeModal} width={900}>
      <div className="pr-head">
        <h1 className="pr-title">
          {issue?.title ?? `Issue #${number}`} <span className="dim">#{number}</span>
        </h1>
        {issue && (
          <div className="row-meta">
            <span className={`badge badge-state-${open ? 'open' : issue.stateReason === 'not_planned' ? 'draft' : 'merged'}`}>
              {open ? 'Open' : issue.stateReason === 'not_planned' ? 'Closed · not planned' : 'Closed'}
            </span>
            <Avatar src={issue.authorAvatar} login={issue.author} size={16} />
            <span>
              <span className="strong">{issue.author}</span> opened {timeAgo(issue.createdAt, now)}
            </span>
            {issue.assignees.length > 0 && <span>assigned to {issue.assignees.join(', ')}</span>}
            <button className="link" onClick={() => openRepo(repo)}>
              {repo}
            </button>
          </div>
        )}
        {issue && issue.labels.length > 0 && (
          <div className="inline">
            {issue.labels.map((l) => (
              <span key={l.name} className="label" style={{ ['--label' as string]: `#${l.color}` }} title={l.description ?? undefined}>
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="inline">
        {issue &&
          (open ? (
            <>
              <button className="btn" onClick={() => void setState('closed', 'completed')}>
                ✓ Close as completed
              </button>
              <button className="btn" onClick={() => void setState('closed', 'not_planned')}>
                Close as not planned
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => void setState('open')}>
              Reopen
            </button>
          ))}
        <span className="spacer" />
        <button className="btn" onClick={() => void navigator.clipboard.writeText(url).then(() => toast('Link copied', 'ok'))}>
          Copy link
        </button>
        <button className="btn" onClick={() => void api.openExternal(url)}>
          Open in browser
        </button>
      </div>

      {error && <p className="del">Couldn't load this issue: {error}</p>}
      {!issue && !error && <Skeleton kind="text" rows={6} />}
      {issue && (
        <div className="timeline">
          <article className="comment">
            <header>
              <Avatar src={issue.authorAvatar} login={issue.author} size={20} />
              <span className="strong">{issue.author}</span>
              <span className="dim">opened {timeAgo(issue.createdAt, now)}</span>
            </header>
            <Markdown html={issue.bodyHtml} />
          </article>
          {issue.timeline.map((c, i) => (
            <article key={i} className="comment">
              <header>
                <Avatar src={c.authorAvatar} login={c.author} size={20} />
                <span className="strong">{c.author}</span>
                <span className="dim">{timeAgo(c.createdAt, now)}</span>
              </header>
              <Markdown html={c.bodyHtml} />
            </article>
          ))}
          <div className="comment-box">
            <textarea
              rows={3}
              placeholder="Leave a comment (Markdown supported) — Ctrl+Enter to send"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) void comment()
              }}
            />
            <div className="inline">
              {open && (
                <button className="btn" disabled={busy || !text.trim()} onClick={() => void comment(true)}>
                  Comment and close
                </button>
              )}
              <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void comment()}>
                {busy ? 'Sending…' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
