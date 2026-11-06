import { useCallback, useEffect, useState } from 'react'
import type { GitAction, GitFile, GitStatus } from '../../../shared/types'
import { timeAgo, useNow } from '../lib/format'
import { editorName, useEditors } from '../lib/editors'
import { api, toast, useSettings } from '../lib/store'
import { useLoad } from '../lib/useLoad'
import type { SectionProps } from './RepoWorkspace'
import { Empty, IconButton, Segmented, Skeleton } from './ui'

const LABEL: Record<string, string> = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Conflict', T: 'Type changed', '?': 'Untracked' }

/** Status for the linked clone, refreshed every few seconds and whenever the window regains focus. */
function useGitStatus(repo: string) {
  const [status, setStatus] = useState<GitStatus | null>()
  const [error, setError] = useState<string>()
  const refresh = useCallback(
    () =>
      api.gitStatus(repo).then(
        (s) => (setStatus(s), setError(undefined)),
        (e: Error) => setError(e.message)
      ),
    [repo]
  )
  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  return { status, error, refresh }
}

export function LocalSection({ repo }: SectionProps) {
  const settings = useSettings()
  const editors = useEditors()
  const { status, error, refresh } = useGitStatus(repo)
  const [view, setView] = useState<'changes' | 'history' | 'branches'>('changes')
  const [busy, setBusy] = useState<string>()

  /** Runs a git action; on success optionally toasts git's last line of output (pull/push/fetch summaries). */
  const act = async (action: GitAction, arg?: string | string[], done?: string) => {
    setBusy(action)
    const r = await api.gitRun(repo, action, arg)
    setBusy(undefined)
    if (!r.ok) toast(r.error ?? `git ${action} failed`, 'error')
    else if (done) toast(done + (r.output ? ` — ${r.output.split('\n').filter(Boolean).pop()}` : ''), 'ok')
    await refresh()
    return r.ok
  }
  const open = async (where: 'editor' | 'terminal' | 'folder') => {
    const r = await api.gitOpen(repo, where)
    if (!r.ok) toast(where === 'editor' ? `Couldn't open ${editorName(settings.editorCommand, editors)}: ${r.error}. Choose another editor in Settings → Advanced.` : (r.error ?? 'Failed'), 'error')
  }

  if (status === undefined && !error) return <Skeleton rows={6} />
  if (!status)
    return (
      <div className="link-card">
        <h3>Work on {repo} locally</h3>
        <p className="dim">Link the folder where you've cloned this repo, or clone it now. Pushback then shows its changes, lets you commit, switch branches, pull and push, and opens it in your editor or a terminal.</p>
        {error && <p className="del small">{error}</p>}
        <div className="inline">
          <button
            className="btn btn-primary"
            onClick={async () => {
              const r = await api.gitLink(repo)
              if (r.error) toast(r.error, 'error')
              await refresh()
            }}
          >
            Link existing clone…
          </button>
          <button
            className="btn"
            disabled={busy === 'clone'}
            onClick={async () => {
              setBusy('clone')
              const r = await api.gitClone(repo)
              setBusy(undefined)
              if (r.error) toast(`Clone failed: ${r.error}`, 'error')
              else if (r.ok) toast(`Cloned ${repo}`, 'ok')
              await refresh()
            }}
          >
            {busy === 'clone' ? 'Cloning…' : 'Clone into…'}
          </button>
        </div>
      </div>
    )

  const staged = status.files.filter((f) => f.index !== ' ' && f.index !== '?')
  const changed = status.files.filter((f) => f.worktree !== ' ')

  return (
    <>
      <div className="git-bar">
        <button className="link mono" title="Open folder" onClick={() => void open('folder')}>
          {status.path}
        </button>
        <span className="chip mono">⎇ {status.branch ?? 'detached HEAD'}</span>
        <span className="dim small">
          {status.upstream ? (
            <>
              {status.upstream}
              {status.ahead > 0 && <span className="add"> ↑{status.ahead}</span>}
              {status.behind > 0 && <span className="del"> ↓{status.behind}</span>}
              {!status.ahead && !status.behind && ' · up to date'}
            </>
          ) : (
            'not pushed yet'
          )}
        </span>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={!!busy} onClick={() => void act('fetch', undefined, 'Fetched')}>
          {busy === 'fetch' ? 'Fetching…' : 'Fetch'}
        </button>
        <button className="btn btn-sm" disabled={!!busy || !status.upstream} onClick={() => void act('pull', undefined, 'Pulled')} title="Fast-forward only">
          {busy === 'pull' ? 'Pulling…' : `Pull${status.behind ? ` ↓${status.behind}` : ''}`}
        </button>
        <button className={`btn btn-sm${status.ahead || !status.upstream ? ' btn-primary' : ''}`} disabled={!!busy || !status.branch} onClick={() => void act('push', undefined, 'Pushed')}>
          {busy === 'push' ? 'Pushing…' : status.upstream ? `Push${status.ahead ? ` ↑${status.ahead}` : ''}` : 'Publish branch'}
        </button>
      </div>
      <div className="git-bar">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            ['changes', `Changes ${status.files.length || ''}`],
            ['history', 'History'],
            ['branches', 'Branches']
          ]}
        />
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => void open('editor')}>
          Open in {editorName(settings.editorCommand, editors)}
        </button>
        <button className="btn btn-sm" onClick={() => void open('terminal')}>
          Terminal
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            if (confirm(`Unlink ${status.path}? The folder itself isn't touched.`)) void api.gitUnlink(repo).then(refresh)
          }}
        >
          Unlink
        </button>
      </div>
      {view === 'changes' && <Changes repo={repo} status={status} staged={staged} changed={changed} act={act} busy={busy} />}
      {view === 'history' && <History repo={repo} />}
      {view === 'branches' && <Branches repo={repo} act={act} dirty={status.files.length > 0} />}
    </>
  )
}

type Act = (action: GitAction, arg?: string | string[], done?: string) => Promise<boolean>

function Changes({ repo, status, staged, changed, act, busy }: { repo: string; status: GitStatus; staged: GitFile[]; changed: GitFile[]; act: Act; busy?: string }) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean }>()
  const [message, setMessage] = useState('')
  const [diff, setDiff] = useState<string>()

  // Show the first changed file's diff by default; follow the selection as files move between lists.
  const current = selected && (selected.staged ? staged : changed).some((f) => f.path === selected.path) ? selected : staged[0] ? { path: staged[0].path, staged: true } : changed[0] ? { path: changed[0].path, staged: false } : undefined
  const fileKey = current && `${current.staged}:${current.path}`
  useEffect(() => {
    if (!current) return setDiff(undefined)
    api.gitDiff(repo, current.path, current.staged).then(setDiff, (e: Error) => setDiff(`@@ ${e.message} @@`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, fileKey, status])

  const commit = async () => {
    if (await act('commit', message, 'Committed')) setMessage('')
  }

  // Start at the first hunk: git's header lines (diff --git, index, ---/+++) repeat the file name shown above.
  const diffLines = (diff ?? '').split('\n')
  const diffBody = diffLines.slice(Math.max(0, diffLines.findIndex((l) => l.startsWith('@@'))))

  const row = (f: GitFile, isStaged: boolean) => {
    const code = isStaged ? f.index : f.worktree === '?' ? '?' : f.worktree
    const on = current?.path === f.path && current.staged === isStaged
    return (
      <li key={`${isStaged}${f.path}`} className={`row clickable git-file${on ? ' on' : ''}`} onClick={() => setSelected({ path: f.path, staged: isStaged })}>
        <span className={`git-code git-${code === '?' ? 'new' : code}`} title={LABEL[code] ?? code}>
          {code === '?' ? 'U' : code}
        </span>
        <span className="mono git-path" title={f.path}>
          {f.path}
        </span>
        <div className="row-actions">
          {isStaged ? (
            <IconButton icon="up" title="Unstage" onClick={() => void act('unstage', f.path)} />
          ) : (
            <>
              <IconButton
                icon="trash"
                title={code === '?' ? 'Delete this new file' : 'Discard changes'}
                onClick={() => {
                  if (confirm(code === '?' ? `Delete ${f.path}? It has never been committed, so this can't be undone.` : `Discard your changes to ${f.path}? This can't be undone.`))
                    void act('discard', f.path)
                }}
              />
              <IconButton icon="plus" title="Stage" onClick={() => void act('stage', f.path)} />
            </>
          )}
        </div>
      </li>
    )
  }

  if (!status.files.length)
    return (
      <>
        <Empty>No local changes. {status.stashes > 0 && `(${status.stashes} stash${status.stashes === 1 ? '' : 'es'} saved.)`}</Empty>
        {status.stashes > 0 && (
          <div className="inline">
            <button className="btn btn-sm" onClick={() => void act('stash-pop', undefined, 'Restored stash')}>
              Pop latest stash
            </button>
          </div>
        )}
      </>
    )

  return (
    <div className="git-changes">
      <div className="git-files">
        <div className="git-list-head">
          <span className="strong">Staged</span> <span className="dim">{staged.length}</span>
          <span className="spacer" />
          {staged.length > 0 && (
            <button className="link small" onClick={() => void act('unstage-all')}>
              Unstage all
            </button>
          )}
        </div>
        <ul className="list">{staged.length ? staged.map((f) => row(f, true)) : <li className="dim small git-hint">Stage files to include them in the next commit.</li>}</ul>
        <div className="git-list-head">
          <span className="strong">Changes</span> <span className="dim">{changed.length}</span>
          <span className="spacer" />
          {changed.length > 0 && (
            <button className="link small" onClick={() => void act('stage-all')}>
              Stage all
            </button>
          )}
        </div>
        <ul className="list">{changed.map((f) => row(f, false))}</ul>

        <div className="commit-box">
          <textarea
            rows={3}
            placeholder={`Commit message (Ctrl+Enter to commit to ${status.branch ?? 'HEAD'})`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && message.trim() && staged.length) void commit()
            }}
          />
          <div className="inline">
            <button className="btn btn-sm" disabled={!!busy} onClick={() => void act('stash', undefined, 'Stashed your changes')} title="Put all changes aside (including new files)">
              Stash
            </button>
            {status.stashes > 0 && (
              <button className="btn btn-sm" disabled={!!busy} onClick={() => void act('stash-pop', undefined, 'Restored stash')}>
                Pop stash ({status.stashes})
              </button>
            )}
            <span className="spacer" />
            <button className="btn btn-primary btn-sm" disabled={!!busy || !message.trim() || !staged.length} onClick={() => void commit()}>
              Commit {staged.length} file{staged.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
      <div className="git-diff">
        {current && <div className="git-diff-head mono">{current.path}</div>}
        <pre className="diff">
          {diffBody.map((l, i) => (
            <div key={i} className={l.startsWith('@@') ? 'hunk' : l.startsWith('+') && !l.startsWith('+++') ? 'ins' : l.startsWith('-') && !l.startsWith('---') ? 'rem' : undefined}>
              {l || ' '}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

function History({ repo }: { repo: string }) {
  const now = useNow()
  const { data, error } = useLoad(repo, () => api.gitLog(repo), [])
  if (!data) return error ? <p className="del">{error}</p> : <Skeleton rows={6} />
  if (!data.length) return <Empty>No commits yet.</Empty>
  return (
    <ul className="list repo-tab">
      {data.map((c) => (
        <li key={c.sha} className="row">
          <div className="row-main">
            <div className="row-title">
              <span className="strong">{c.subject}</span>
              {c.refs
                .split(', ')
                .filter(Boolean)
                .map((r) => (
                  <span key={r} className={`chip mono${r.startsWith('HEAD') ? ' chip-head' : ''}`}>
                    {r.replace('HEAD -> ', '⎇ ')}
                  </span>
                ))}
            </div>
            <div className="row-meta">
              <span>{c.author}</span>
              <span>{timeAgo(c.date, now)}</span>
            </div>
          </div>
          <button className="chip chip-btn mono" title="Copy full SHA" onClick={() => void navigator.clipboard.writeText(c.sha).then(() => toast('SHA copied', 'ok'))}>
            {c.sha.slice(0, 7)}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Branches({ repo, act, dirty }: { repo: string; act: Act; dirty: boolean }) {
  const now = useNow()
  const { data, error, reload } = useLoad(repo, () => api.gitBranches(repo), [])
  const [name, setName] = useState('')
  const run = async (action: GitAction, arg: string, done: string) => {
    if (await act(action, arg, done)) reload()
  }
  if (!data) return error ? <p className="del">{error}</p> : <Skeleton rows={6} />
  return (
    <>
      <form
        className="ws-toolbar inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void run('create-branch', name.trim(), `Created and switched to ${name.trim()}`).then(() => setName(''))
        }}
      >
        <input placeholder="new-branch-name (created from the current branch)" value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))} />
        <button className="btn btn-primary btn-sm" disabled={!name.trim()}>
          Create and switch
        </button>
      </form>
      {dirty && <p className="dim small">You have uncommitted changes; git carries them over when switching if they don't conflict.</p>}
      <ul className="list repo-tab">
        {data.map((b) => (
          <li key={b.name} className="row">
            <span className={b.current ? 'add' : 'dim'}>{b.current ? '●' : '○'}</span>
            <div className="row-main">
              <div className="row-title">
                <span className="strong mono">{b.name}</span>
                {b.current && <span className="badge badge-ok">current</span>}
              </div>
              <div className="row-meta">
                {b.upstream ? <span className="mono">{b.upstream}</span> : <span>local only</span>}
                {b.track && <span className={b.track === 'gone' ? 'del' : ''}>{b.track === 'gone' ? 'remote branch deleted' : b.track}</span>}
                <span>{timeAgo(b.date, now)}</span>
              </div>
            </div>
            {!b.current && (
              <button className="btn btn-sm" onClick={() => void run('switch', b.name, `Switched to ${b.name}`)}>
                Switch
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
