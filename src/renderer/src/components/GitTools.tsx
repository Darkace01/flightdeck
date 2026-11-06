import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import type { BlameLine, CommitFile, GitAction, GitAnswer, GitQuery, GraphCommit } from '../../../shared/types'
import { matches, timeAgo, useNow } from '../lib/format'
import { api, toast } from '../lib/store'
import { invalidate, useLoad } from '../lib/useLoad'
import { CommitGraph, DiffView, RefChips } from './CommitGraph'
import { LinkClone } from './LocalGit'
import type { SectionProps } from './RepoWorkspace'
import { Empty, IconButton, Segmented, Skeleton } from './ui'

// History tools for a repo's linked clone. Each section is listed in RepoWorkspace's SECTIONS.

const useGit = <Q extends GitQuery>(repo: string, q: Q | null, deps: unknown[]) =>
  useLoad<GitAnswer[Q['kind']] | undefined>(repo, () => (q ? api.gitQuery(repo, q) : Promise.resolve(undefined)), deps)

/** Runs a history action, reports the outcome, and refreshes every view of the repo. */
async function run(repo: string, action: GitAction, arg: string | string[] | undefined, done: string): Promise<boolean> {
  const r = await api.gitRun(repo, action, arg)
  if (!r.ok) toast(r.error ?? `git ${action} failed`, 'error')
  else toast(done, 'ok')
  invalidate(repo)
  return r.ok
}

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast(`${what} copied`, 'ok'))

/** Wraps a local view: shows the link-or-clone card until the repo has a linked folder. */
function needsClone(View: ComponentType<SectionProps>) {
  return function Local(props: SectionProps) {
    const { data, error, reload } = useLoad(props.repo, () => api.gitStatus(props.repo), [])
    if (data === undefined) return error ? <LinkClone repo={props.repo} error={error} onDone={reload} /> : <Skeleton rows={6} />
    if (data === null) return <LinkClone repo={props.repo} onDone={reload} />
    return <View {...props} />
  }
}

const Err = ({ error }: { error?: string }) => (error ? <p className="del">{error}</p> : <Skeleton rows={8} />)

/* ------------------------------------------------------------------ commit details */

/** Details of one commit: message, refs, actions, changed files and their diffs. */
function CommitPanel({ repo, sha, file, onPick }: { repo: string; sha: string; file?: string; onPick?: (sha: string) => void }) {
  const now = useNow()
  const { data: c, error } = useGit(repo, { kind: 'commit', sha }, [sha])
  const [open, setOpen] = useState<string | undefined>(file)
  const [form, setForm] = useState<'branch' | 'tag'>()
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => setOpen(file), [sha, file])
  const { data: diff } = useGit(repo, open ? { kind: 'commit-diff', sha, path: open } : null, [sha, open])

  if (!c) return <div className="commit-panel">{error ? <p className="del">{error}</p> : <Skeleton kind="text" rows={4} />}</div>
  const add = c.files.reduce((n, f) => n + f.additions, 0)
  const del = c.files.reduce((n, f) => n + f.deletions, 0)
  const reset = (mode: 'soft' | 'mixed' | 'hard') => {
    const what = { soft: 'keeping its changes staged', mixed: 'keeping its changes as unstaged edits', hard: 'DISCARDING every uncommitted change and later commit' }[mode]
    if (confirm(`Reset the current branch to ${c.sha.slice(0, 7)}, ${what}?${mode === 'hard' ? ' This cannot be undone.' : ''}`)) void run(repo, `reset-${mode}`, c.sha, `Reset to ${c.sha.slice(0, 7)}`)
  }

  return (
    <div className="commit-panel">
      <h3 className="commit-title">{c.subject}</h3>
      <div className="inline wrap">
        <RefChips refs={c.refs} />
      </div>
      {c.body && <pre className="commit-body">{c.body}</pre>}
      <div className="row-meta wrap">
        <span title={c.email}>{c.author}</span>
        <span title={new Date(c.date).toLocaleString()}>authored {timeAgo(c.date, now)}</span>
        {c.committer !== c.author && <span>committed by {c.committer}</span>}
      </div>
      <div className="row-meta wrap">
        <button className="chip chip-btn mono" title="Copy full SHA" onClick={() => copy(c.sha, 'SHA')}>
          {c.sha.slice(0, 10)}
        </button>
        {c.parents.map((p) => (
          <button key={p} className="link mono small" title="Show parent commit" onClick={() => onPick?.(p)}>
            ← {p.slice(0, 7)}
          </button>
        ))}
        {c.parents.length > 1 && <span className="badge badge-muted">merge</span>}
      </div>

      <div className="commit-actions">
        <button className="btn btn-sm" onClick={() => setForm(form === 'branch' ? undefined : 'branch')}>
          Branch here
        </button>
        <button className="btn btn-sm" onClick={() => setForm(form === 'tag' ? undefined : 'tag')}>
          Tag
        </button>
        <button className="btn btn-sm" title="Apply this commit's changes on top of the current branch" onClick={() => void run(repo, 'cherry-pick', c.sha, 'Cherry-picked')}>
          Cherry-pick
        </button>
        <button
          className="btn btn-sm"
          title="Add a new commit that undoes this one"
          onClick={() => confirm(`Revert “${c.subject}” with a new commit on the current branch?`) && void run(repo, 'revert', c.sha, 'Reverted')}
        >
          Revert
        </button>
        <select
          className="btn-sm"
          value=""
          title="Move the current branch to this commit"
          onChange={(e) => e.target.value && reset(e.target.value as 'soft' | 'mixed' | 'hard')}
        >
          <option value="">Reset to here…</option>
          <option value="soft">Soft (keep changes staged)</option>
          <option value="mixed">Mixed (keep changes unstaged)</option>
          <option value="hard">Hard (discard changes)</option>
        </select>
        <IconButton icon="external" title="Open on GitHub" onClick={() => void api.openExternal(`https://github.com/${repo}/commit/${c.sha}`)} />
      </div>
      {form && (
        <form
          className="inline-form inline"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok =
              form === 'branch'
                ? await run(repo, 'branch-at', [name.trim(), c.sha], `Created branch ${name.trim()}`)
                : await run(repo, 'tag', [name.trim(), c.sha, message], `Tagged ${c.sha.slice(0, 7)} as ${name.trim()}`)
            if (ok) (setForm(undefined), setName(''), setMessage(''))
          }}
        >
          <input autoFocus placeholder={form === 'branch' ? 'new-branch-name' : 'v1.2.3'} value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))} />
          {form === 'tag' && <input placeholder="Message (optional: makes an annotated tag)" value={message} onChange={(e) => setMessage(e.target.value)} />}
          <button className="btn btn-primary btn-sm" disabled={!name.trim()}>
            {form === 'branch' ? 'Create branch' : 'Create tag'}
          </button>
        </form>
      )}

      <div className="git-list-head">
        <span className="strong">{c.files.length} files changed</span>
        <span className="add small">+{add}</span>
        <span className="del small">−{del}</span>
      </div>
      <FileList files={c.files} open={open} onOpen={(p) => setOpen(open === p ? undefined : p)} />
      {open && (
        <>
          <div className="git-diff-head mono">{open}</div>
          <DiffView text={diff} />
        </>
      )}
    </div>
  )
}

function FileList({ files, open, onOpen }: { files: CommitFile[]; open?: string; onOpen: (path: string) => void }) {
  return (
    <ul className="list file-list">
      {files.map((f) => (
        <li key={f.path} className={`row clickable git-file${open === f.path ? ' on' : ''}`} onClick={() => onOpen(f.path)}>
          <span className={`git-code git-${f.status}`}>{f.status}</span>
          <span className="mono git-path" title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}>
            {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
          </span>
          <span className="add small">+{f.additions}</span>
          <span className="del small">−{f.deletions}</span>
        </li>
      ))}
    </ul>
  )
}

/** A commit list (or graph) on the left and the selected commit's details on the right. */
function Split({ list, panel }: { list: ReactNode; panel: ReactNode }) {
  return (
    <div className="git-split">
      <div className="git-split-list">{list}</div>
      {panel}
    </div>
  )
}

/* ------------------------------------------------------------------ commit graph */

export const GraphSection = needsClone(function GraphSection({ repo }: SectionProps) {
  const [all, setAll] = useState(true)
  const [limit, setLimit] = useState(300)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>()
  const { data, error } = useGit(repo, { kind: 'graph', all, limit }, [all, limit])
  const highlight = useMemo(
    () => (q.trim() && data ? new Set(data.filter((c) => matches(`${c.sha} ${c.subject} ${c.author} ${c.refs.join(' ')}`, q.trim())).map((c) => c.sha)) : undefined),
    [data, q]
  )
  const selected = sel ?? data?.[0]?.sha
  return (
    <>
      <div className="ws-toolbar">
        <Segmented
          value={all ? 'all' : 'head'}
          onChange={(v) => setAll(v === 'all')}
          options={[
            ['all', 'All branches'],
            ['head', 'Current branch']
          ]}
        />
        <input className="ws-filter" placeholder="Highlight by message, author, SHA or branch…" value={q} onChange={(e) => setQ(e.target.value)} />
        {highlight && <span className="dim small">{highlight.size} match</span>}
      </div>
      {!data ? (
        <Err error={error} />
      ) : !data.length ? (
        <Empty>No commits yet.</Empty>
      ) : (
        <Split
          list={
            <>
              <CommitGraph commits={data} selected={selected} onSelect={(c) => setSel(c.sha)} highlight={highlight} />
              {data.length >= limit && (
                <button className="btn btn-sm load-more" onClick={() => setLimit(limit + 300)}>
                  Load more
                </button>
              )}
            </>
          }
          panel={selected && <CommitPanel repo={repo} sha={selected} onPick={setSel} />}
        />
      )}
    </>
  )
})

/* ------------------------------------------------------------------ file history and blame */

export const FileHistorySection = needsClone(function FileHistorySection({ repo }: SectionProps) {
  const [path, setPath] = useState<string>()
  const [view, setView] = useState<'history' | 'blame'>('history')
  return (
    <>
      <div className="ws-toolbar">
        <FilePicker repo={repo} value={path} onPick={setPath} />
        {path && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              ['history', 'History'],
              ['blame', 'Blame']
            ]}
          />
        )}
      </div>
      {!path ? (
        <Empty>Pick a file to see every commit that changed it, or who last changed each line.</Empty>
      ) : view === 'history' ? (
        <FileHistory repo={repo} path={path} />
      ) : (
        <Blame repo={repo} path={path} />
      )}
    </>
  )
})

/** Search-as-you-type over the repo's tracked files. */
function FilePicker({ repo, value, onPick }: { repo: string; value?: string; onPick: (path: string) => void }) {
  const { data } = useGit(repo, { kind: 'files' }, [])
  const [q, setQ] = useState(value ?? '')
  const [open, setOpen] = useState(!value)
  const hits = useMemo(() => (data ?? []).filter((f) => !q || matches(f, q)).slice(0, 80), [data, q])
  return (
    <div className="file-picker">
      <input
        placeholder={data ? `Find a file (${data.length.toLocaleString()} tracked)…` : 'Loading files…'}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) (onPick(hits[0]), setQ(hits[0]), setOpen(false))
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && q && hits.length > 0 && (
        <div className="menu file-hits">
          {hits.map((f) => (
            <button key={f} className="mono" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(f), setQ(f), setOpen(false))}>
              <span>{f}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FileHistory({ repo, path }: { repo: string; path: string }) {
  const { data, error } = useGit(repo, { kind: 'file-history', path }, [path])
  const [sel, setSel] = useState<string>()
  if (!data) return <Err error={error} />
  if (!data.length) return <Empty>No commits touch {path}. Is it new and not committed yet?</Empty>
  const selected = sel && data.some((c) => c.sha === sel) ? sel : data[0].sha
  return <Split list={<CommitGraph commits={data} graph={false} selected={selected} onSelect={(c) => setSel(c.sha)} />} panel={<CommitPanel repo={repo} sha={selected} file={path} onPick={setSel} />} />
}

/** The file with who last changed each line, grouped into runs of lines from the same commit and shaded by age. */
function Blame({ repo, path }: { repo: string; path: string }) {
  const now = useNow()
  const { data, error } = useGit(repo, { kind: 'blame', path }, [path])
  const [sel, setSel] = useState<string>()
  const ages = useMemo(() => {
    const times = (data ?? []).map((l) => new Date(l.date).getTime()).filter(Boolean)
    return { min: Math.min(...times), max: Math.max(...times) }
  }, [data])
  if (!data) return <Err error={error} />
  // Newer lines get a warmer bar, so recent churn stands out as a heatmap.
  const heat = (l: BlameLine) => (ages.max > ages.min ? (new Date(l.date).getTime() - ages.min) / (ages.max - ages.min) : 1)
  return (
    <Split
      list={
        <div className="blame">
          {data.map((l, i) => {
            const first = i === 0 || data[i - 1].sha !== l.sha
            const uncommitted = /^0+$/.test(l.sha)
            return (
              <div key={l.line} className={`blame-line${first ? ' first' : ''}${sel === l.sha ? ' on' : ''}`} onClick={() => !uncommitted && setSel(l.sha)}>
                <span className="blame-info" title={first ? `${l.summary}\n${l.author}, ${new Date(l.date).toLocaleString()}` : undefined}>
                  {first && (uncommitted ? <span className="dim">Not committed yet</span> : <>
                    <span className="blame-author">{l.author}</span>
                    <span className="dim">{timeAgo(l.date, now)}</span>
                    <span className="blame-summary">{l.summary}</span>
                  </>)}
                </span>
                <span className="blame-heat" style={{ opacity: 0.15 + heat(l) * 0.85 }} />
                <span className="blame-no">{l.line}</span>
                <code className="blame-text">{l.text || ' '}</code>
              </div>
            )
          })}
        </div>
      }
      panel={sel ? <CommitPanel repo={repo} sha={sel} file={path} onPick={setSel} /> : <div className="commit-panel dim small">Click a line to see the commit that last changed it.</div>}
    />
  )
}

/* ------------------------------------------------------------------ compare */

export const CompareSection = needsClone(function CompareSection({ repo }: SectionProps) {
  const { data: refs } = useGit(repo, { kind: 'refs' }, [])
  const [base, setBase] = useState('')
  const [head, setHead] = useState('')
  const [view, setView] = useState<'ahead' | 'behind' | 'files'>('ahead')
  const [sel, setSel] = useState<string>()
  const [file, setFile] = useState<string>()
  // Default to comparing the current branch against the default remote branch (or main/master).
  useEffect(() => {
    if (!refs || base) return
    const def = refs.remoteBranches.find((r) => /^origin\/(main|master)$/.test(r)) ?? refs.branches.find((b) => /^(main|master)$/.test(b)) ?? refs.branches[0] ?? ''
    setBase(def)
    setHead(refs.current ?? refs.branches[0] ?? '')
  }, [refs, base])
  const ready = base && head && base !== head
  const { data, error } = useGit(repo, ready ? { kind: 'compare', base, head } : null, [base, head])
  const { data: diff } = useGit(repo, ready && file ? { kind: 'compare-diff', base, head, path: file } : null, [base, head, file])

  const options = refs && (
    <>
      <optgroup label="Branches">{refs.branches.map((b) => <option key={b}>{b}</option>)}</optgroup>
      <optgroup label="Remote branches">{refs.remoteBranches.map((b) => <option key={b}>{b}</option>)}</optgroup>
      <optgroup label="Tags">{refs.tags.map((t) => <option key={t}>{t}</option>)}</optgroup>
    </>
  )
  return (
    <>
      <div className="ws-toolbar">
        <select value={base} onChange={(e) => setBase(e.target.value)} title="Base">
          {options}
        </select>
        <IconButton icon="refresh" title="Swap" onClick={() => (setBase(head), setHead(base))} />
        <select value={head} onChange={(e) => setHead(e.target.value)} title="Compare">
          {options}
        </select>
        {data && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              ['ahead', `${data.ahead.length} only in ${head}`],
              ['behind', `${data.behind.length} only in ${base}`],
              ['files', `${data.files.length} files changed`]
            ]}
          />
        )}
      </div>
      {!refs || (ready && !data) ? (
        <Err error={error} />
      ) : !ready ? (
        <Empty>Pick two different branches or tags to compare.</Empty>
      ) : view === 'files' ? (
        <div className="compare-files">
          <FileList files={data!.files} open={file} onOpen={(p) => setFile(file === p ? undefined : p)} />
          {file && (
            <>
              <div className="git-diff-head mono">{file}</div>
              <DiffView text={diff} />
            </>
          )}
        </div>
      ) : (
        (() => {
          const list = view === 'ahead' ? data!.ahead : data!.behind
          if (!list.length) return <Empty>{view === 'ahead' ? `${head} has nothing ${base} doesn't.` : `${base} has nothing ${head} doesn't.`}</Empty>
          const selected = sel && list.some((c) => c.sha === sel) ? sel : list[0].sha
          return <Split list={<CommitGraph commits={list} selected={selected} onSelect={(c) => setSel(c.sha)} />} panel={<CommitPanel repo={repo} sha={selected} onPick={setSel} />} />
        })()
      )}
    </>
  )
})

/* ------------------------------------------------------------------ search */

type SearchMode = Extract<GitQuery, { kind: 'search' }>['mode']

const MODES: [SearchMode, string][] = [
  ['message', 'Message'],
  ['author', 'Author'],
  ['sha', 'SHA'],
  ['file', 'File'],
  ['change', 'Code change']
]

export const SearchSection = needsClone(function SearchSection({ repo }: SectionProps) {
  const [mode, setMode] = useState<SearchMode>('message')
  const [text, setText] = useState('')
  const [query, setQuery] = useState<{ mode: SearchMode; text: string }>()
  const [sel, setSel] = useState<string>()
  const { data, error } = useGit(repo, query ? { kind: 'search', ...query } : null, [query?.mode, query?.text])
  const hint = { message: 'fix login', author: 'name or email', sha: 'a1b2c3d', file: 'package.json', change: 'text added or removed in the code' }[mode]
  return (
    <>
      <form
        className="ws-toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) (setQuery({ mode, text: text.trim() }), setSel(undefined))
        }}
      >
        <Segmented value={mode} onChange={setMode} options={MODES} />
        <input className="ws-filter" autoFocus placeholder={`Search commits by ${mode === 'change' ? 'code change' : mode}: ${hint}`} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!text.trim()}>
          Search
        </button>
      </form>
      {!query ? (
        <Empty>Search every branch's history by message, author, SHA, file, or code that was added or removed.</Empty>
      ) : !data ? (
        <Err error={error} />
      ) : !data.length ? (
        <Empty>No commits match.</Empty>
      ) : (
        <Split
          list={
            <>
              <p className="dim small">{data.length >= 300 ? 'First 300 matches' : `${data.length} matches`}</p>
              <CommitGraph commits={data} graph={false} selected={sel ?? data[0].sha} onSelect={(c) => setSel(c.sha)} />
            </>
          }
          panel={<CommitPanel repo={repo} sha={sel ?? data[0].sha} onPick={setSel} />}
        />
      )}
    </>
  )
})

/* ------------------------------------------------------------------ stashes */

export const StashesSection = needsClone(function StashesSection({ repo }: SectionProps) {
  const now = useNow()
  const { data, error } = useGit(repo, { kind: 'stashes' }, [])
  const [sel, setSel] = useState<number>()
  const selected = sel ?? data?.[0]?.index
  const { data: diff } = useGit(repo, selected !== undefined ? { kind: 'stash-diff', index: selected } : null, [selected])
  if (!data) return <Err error={error} />
  if (!data.length) return <Empty>No stashes. Stash your changes from Working copy to put them aside.</Empty>
  return (
    <Split
      list={
        <ul className="list">
          {data.map((s) => (
            <li key={s.index} className={`row clickable${selected === s.index ? ' on' : ''}`} onClick={() => setSel(s.index)}>
              <span className="chip mono">stash@{`{${s.index}}`}</span>
              <div className="row-main">
                <div className="row-title">{s.message}</div>
                <div className="row-meta">{timeAgo(s.date, now)}</div>
              </div>
              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-sm" onClick={() => void run(repo, 'stash-apply', String(s.index), 'Applied stash')}>
                  Apply
                </button>
                <button className="btn btn-sm" onClick={() => void run(repo, 'stash-pop-at', String(s.index), 'Popped stash').then(() => setSel(undefined))}>
                  Pop
                </button>
                <IconButton
                  icon="trash"
                  title="Drop this stash"
                  onClick={() => confirm(`Drop stash@{${s.index}}? Its changes are lost.`) && void run(repo, 'stash-drop', String(s.index), 'Dropped stash').then(() => setSel(undefined))}
                />
              </div>
            </li>
          ))}
        </ul>
      }
      panel={
        <div className="commit-panel">
          <DiffView text={diff} />
        </div>
      }
    />
  )
})

/* ------------------------------------------------------------------ tags */

export const TagsSection = needsClone(function TagsSection({ repo }: SectionProps) {
  const now = useNow()
  const { data, error } = useGit(repo, { kind: 'tags' }, [])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string>()
  if (!data) return <Err error={error} />
  const tags = data.filter((t) => !q || matches(`${t.name} ${t.subject}`, q))
  return (
    <>
      <div className="ws-toolbar">
        <input className="ws-filter" placeholder="Filter tags…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dim small">Create tags from any commit in the Commit graph.</span>
      </div>
      {!tags.length ? (
        <Empty>No tags{q ? ' match' : ' yet'}.</Empty>
      ) : (
        <Split
          list={
            <ul className="list">
              {tags.map((t) => (
                <li key={t.name} className={`row clickable${sel === t.sha ? ' on' : ''}`} onClick={() => setSel(t.sha)}>
                  <span className="ref-chip ref-tag">◆ {t.name}</span>
                  <div className="row-main">
                    <div className="row-title">{t.subject}</div>
                    <div className="row-meta">
                      <span className="mono">{t.sha.slice(0, 7)}</span>
                      <span>{timeAgo(t.date, now)}</span>
                    </div>
                  </div>
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => void run(repo, 'push-tag', t.name, `Pushed ${t.name}`)}>
                      Push
                    </button>
                    <IconButton icon="trash" title="Delete the local tag" onClick={() => confirm(`Delete the local tag ${t.name}? A pushed tag stays on GitHub.`) && void run(repo, 'delete-tag', t.name, `Deleted ${t.name}`)} />
                  </div>
                </li>
              ))}
            </ul>
          }
          panel={sel ? <CommitPanel repo={repo} sha={sel} onPick={setSel} /> : <div className="commit-panel dim small">Click a tag to see its commit.</div>}
        />
      )}
    </>
  )
})

/* ------------------------------------------------------------------ remotes and worktrees */

export const RemotesSection = needsClone(function RemotesSection({ repo }: SectionProps) {
  const { data: remotes, error } = useGit(repo, { kind: 'remotes' }, [])
  const { data: trees } = useGit(repo, { kind: 'worktrees' }, [])
  const { data: refs } = useGit(repo, { kind: 'refs' }, [])
  const [branch, setBranch] = useState('')
  if (!remotes) return <Err error={error} />
  const free = refs?.branches.filter((b) => !trees?.some((t) => t.branch === b)) ?? []
  return (
    <>
      <h4 className="group-head">Remotes</h4>
      <ul className="list">
        {remotes.map((r) => (
          <li key={r.name} className="row">
            <span className="chip mono">{r.name}</span>
            <div className="row-main">
              <div className="row-title mono small">{r.fetchUrl}</div>
              {r.pushUrl !== r.fetchUrl && <div className="row-meta mono">push: {r.pushUrl}</div>}
            </div>
            <button className="btn btn-sm" onClick={() => void run(repo, 'fetch-remote', r.name, `Fetched ${r.name}`)}>
              Fetch
            </button>
          </li>
        ))}
      </ul>
      <h4 className="group-head">Worktrees</h4>
      <p className="dim small">Check out several branches at once, each in its own folder, sharing one repository.</p>
      <ul className="list">
        {trees?.map((t) => (
          <li key={t.path} className="row">
            <span className="chip mono">⎇ {t.branch ?? t.head.slice(0, 7)}</span>
            <div className="row-main">
              <div className="row-title mono small">{t.path}</div>
              <div className="row-meta">
                {t.main && <span>main worktree</span>}
                {t.locked && <span className="warn-text">locked</span>}
              </div>
            </div>
            <IconButton icon="copy" title="Copy path" onClick={() => copy(t.path, 'Path')} />
            {!t.main && (
              <IconButton
                icon="trash"
                title="Remove this worktree"
                onClick={() => confirm(`Remove the worktree at ${t.path}? Its folder is deleted (git refuses if it has uncommitted changes).`) && void run(repo, 'worktree-remove', t.path, 'Removed worktree')}
              />
            )}
          </li>
        ))}
      </ul>
      <form
        className="ws-toolbar inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await api.gitAddWorktree(repo, branch)
          if (r.error) toast(r.error, 'error')
          else if (r.ok) toast(`Added a worktree for ${branch}`, 'ok')
          invalidate(repo)
        }}
      >
        <span className="dim small">New worktree for</span>
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">choose a branch…</option>
          {free.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <button className="btn btn-sm" disabled={!branch}>
          Choose folder…
        </button>
      </form>
    </>
  )
})

/* ------------------------------------------------------------------ contributors */

export const ContributorsSection = needsClone(function ContributorsSection({ repo }: SectionProps) {
  const { data, error } = useGit(repo, { kind: 'contributors' }, [])
  if (!data) return <Err error={error} />
  if (!data.length) return <Empty>No commits yet.</Empty>
  const total = data.reduce((n, c) => n + c.commits, 0)
  return (
    <ul className="list contributors">
      {data.map((c) => (
        <li key={c.email + c.name} className="row">
          <div className="row-main">
            <div className="row-title">
              <span className="strong">{c.name}</span> <span className="dim small">{c.email}</span>
            </div>
            <div className="contrib-bar">
              <span style={{ width: `${(c.commits / data[0].commits) * 100}%` }} />
            </div>
          </div>
          <span className="small">
            {c.commits.toLocaleString()} <span className="dim">({Math.round((c.commits / total) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  )
})

/** Commits from GitHub for repos without a clone: the selected commit opens on GitHub. */
export function GitHubGraph({ commits }: { commits: GraphCommit[] }) {
  return <CommitGraph commits={commits} onSelect={(c) => c.url && void api.openExternal(c.url)} />
}
