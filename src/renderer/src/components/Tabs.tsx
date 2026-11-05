import { useEffect, useMemo, useRef, useState } from 'react'
import type { RepoOption } from '../../../shared/types'
import { matches, timeAgo, useNow } from '../lib/format'
import { closeTab, HOME, moveTab, openRepoTab, selectTab } from '../lib/tabs'
import { api, useSettings, useSnapshot } from '../lib/store'
import { Icon, runTone, StatusIcon } from './ui'

/** Dashboard tab plus one tab per open repo. Drag to reorder, middle-click or × to close. */
export function TabBar() {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const [adding, setAdding] = useState(false)
  const [dragging, setDragging] = useState<string>()
  const dashboard = settings.dashboards.find((d) => d.id === settings.activeDashboard)

  // Warm the picker's repo list in the background, so it's ready when + is clicked.
  useEffect(() => {
    const t = setTimeout(() => void loadMyRepos().catch(() => {}), 4000)
    return () => clearTimeout(t)
  }, [])

  const add = (repo: string) => {
    setAdding(false)
    openRepoTab(repo)
  }

  return (
    <nav className="tabbar" role="tablist">
      <button role="tab" aria-selected={settings.activeTab === HOME} className={`tab${settings.activeTab === HOME ? ' on' : ''}`} onClick={() => selectTab(HOME)}>
        <Icon name="grid" />
        <span className="tab-name">{dashboard?.name ?? 'Dashboard'}</span>
      </button>
      {settings.openTabs.map((repo, i) => {
        const state = snapshot.repos[repo]
        const latest = state?.runs.find((r) => r.branch === state.defaultBranch)
        const running = state?.runs.some((r) => r.status !== 'completed')
        return (
          <button
            key={repo}
            role="tab"
            aria-selected={settings.activeTab === repo}
            className={`tab${settings.activeTab === repo ? ' on' : ''}${dragging === repo ? ' dragging' : ''}`}
            title={repo}
            draggable
            onDragStart={(e) => (setDragging(repo), e.dataTransfer.setData('text/plain', repo))}
            onDragEnd={() => setDragging(undefined)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = e.dataTransfer.getData('text/plain')
              if (from && from !== repo) moveTab(from, i)
            }}
            onClick={() => selectTab(repo)}
            onAuxClick={(e) => e.button === 1 && closeTab(repo)}
          >
            {latest ? <StatusIcon tone={running ? 'run' : runTone(latest)} size={12} /> : <span className="tab-dot" />}
            <span className="tab-name">
              <span className="dim">{repo.split('/')[0]}/</span>
              {repo.split('/')[1]}
            </span>
            <span
              className="tab-close"
              role="button"
              aria-label={`Close ${repo}`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(repo)
              }}
            >
              <Icon name="close" />
            </span>
          </button>
        )
      })}
      <div className="switcher">
        <button className="tab tab-add" title="Open a repository in a new tab" onClick={() => setAdding(!adding)}>
          <Icon name="plus" />
        </button>
        {adding && <RepoPicker onPick={add} onClose={() => setAdding(false)} />}
      </div>
    </nav>
  )
}

// The account's repos rarely change; fetch them once per session for the picker.
let myRepos: Promise<RepoOption[]> | undefined
function loadMyRepos(): Promise<RepoOption[]> {
  myRepos ??= api.listMyRepos().catch((e) => {
    myRepos = undefined // try again next time
    throw e
  })
  return myRepos
}

/** Searchable list of watched repos and every repo on the account, plus any owner/name or URL typed in. */
function RepoPicker({ onPick, onClose }: { onPick: (repo: string) => void; onClose: () => void }) {
  const settings = useSettings()
  const now = useNow()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [mine, setMine] = useState<RepoOption[]>()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMyRepos().then(setMine, () => setMine([]))
  }, [])

  const typed = q.trim().match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1]
  const items = useMemo(() => {
    const open = new Set(settings.openTabs)
    const watched = settings.repos.map((r) => ({ fullName: r, description: mine?.find((m) => m.fullName === r)?.description ?? null, watched: true }))
    const others = (mine ?? []).filter((m) => !settings.repos.includes(m.fullName)).map((m) => ({ ...m, watched: false }))
    const all = [...watched, ...others].filter((r) => !q.trim() || matches(`${r.fullName} ${r.description ?? ''}`, q.trim()))
    // Anything typed that isn't in the list (e.g. someone else's public repo) can still be opened.
    if (typed && !all.some((r) => r.fullName.toLowerCase() === typed.toLowerCase())) all.unshift({ fullName: typed, description: null, watched: false })
    return all.map((r) => ({ ...r, open: open.has(r.fullName), info: mine?.find((m) => m.fullName === r.fullName) }))
  }, [mine, settings.repos, settings.openTabs, q, typed])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu repo-picker" role="dialog" aria-label="Open a repository">
        <input
          autoFocus
          placeholder="Search your repos, or type owner/name or a GitHub URL"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, items.length - 1))
            else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
            else if (e.key === 'Enter' && items[sel]) onPick(items[sel].fullName)
            else if (e.key === 'Escape') onClose()
            else return
            e.preventDefault()
          }}
        />
        <div className="picker-list" ref={listRef} role="listbox">
          {items.map((r, i) => (
            <button key={r.fullName} role="option" aria-selected={i === sel} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(r.fullName)}>
              <span className="picker-main">
                <span className="picker-name">
                  <span className="dim">{r.fullName.split('/')[0]}/</span>
                  {r.fullName.split('/')[1]}
                  {r.info?.private && <span className="badge badge-muted">Private</span>}
                  {r.watched && <span className="badge badge-ok">Watching</span>}
                  {r.open && <span className="badge badge-muted">Open</span>}
                </span>
                {r.description && <span className="picker-desc">{r.description}</span>}
              </span>
              {r.info && <span className="dim small">{timeAgo(r.info.pushedAt, now)}</span>}
            </button>
          ))}
          {!mine && <p className="dim small picker-note">Loading your repositories…</p>}
          {mine && !items.length && <p className="dim small picker-note">No repositories match. Type owner/name to open any public repo.</p>}
        </div>
      </div>
    </>
  )
}
