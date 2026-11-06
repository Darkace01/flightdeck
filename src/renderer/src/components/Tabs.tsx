import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { RepoOption } from '../../../shared/types'
import { matches, timeAgo, useNow } from '../lib/format'
import { api, toast, updateSettings, useSettings, useSnapshot } from '../lib/store'
import { closeOtherTabs, closeTab, HOME, moveTab, openRepoTab, pinTab, selectTab, setTabLayout, toggleSidebar, unpinTab } from '../lib/tabs'
import { Icon, IconButton, Popover, runTone, Skeleton, StatusIcon } from './ui'

/** A repo's CI state for its tab: running, or the latest default-branch run's result. */
function useRepoTone(repo: string) {
  const state = useSnapshot().repos[repo]
  const latest = state?.runs.find((r) => r.branch === state.defaultBranch)
  if (!latest) return undefined
  return state.runs.some((r) => r.status !== 'completed') ? 'run' : runTone(latest)
}

/** Two letters from a repo name: "xstar.react.common" → "XR", "blank-page" → "BP", "pushback" → "PU". */
const monogram = (name: string) => {
  const words = name.split(/[-_.\s]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

/** A stable colour per repo, so pinned tabs from the same owner still look different. */
const hue = (repo: string) => [...repo].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/** A pinned tab's icon: the repo's monogram, the owner's avatar as a badge, and the CI state as a dot. */
function RepoIcon({ repo, size = 22 }: { repo: string; size?: number }) {
  const tone = useRepoTone(repo)
  const [failed, setFailed] = useState(false)
  const [owner, name] = repo.split('/')
  return (
    <span className="repo-icon" style={{ width: size, height: size }}>
      <span className="repo-initial" style={{ background: `hsl(${hue(repo)} 55% 52%)`, fontSize: size * 0.42 }}>
        {monogram(name)}
      </span>
      {size >= 22 && !failed && <img className="repo-owner" src={`https://github.com/${owner}.png?size=32`} alt="" onError={() => setFailed(true)} />}
      {tone && <span className={`repo-dot tone-${tone}`} />}
    </span>
  )
}

const RepoName = ({ repo }: { repo: string }) => (
  <span className="tab-name">
    <span className="dim">{repo.split('/')[0]}/</span>
    {repo.split('/')[1]}
  </span>
)

type OnMenu = (e: MouseEvent<HTMLElement>) => void

/** Right-click menu shared by every repo tab, pinned tile and sidebar row. */
function useTabMenu() {
  const settings = useSettings()
  const [menu, setMenu] = useState<{ repo: string; anchor: HTMLElement }>()
  const open =
    (repo: string): OnMenu =>
    (e) => {
      e.preventDefault()
      setMenu({ repo, anchor: e.currentTarget })
    }
  let element = null
  if (menu) {
    const { repo } = menu
    const pinned = settings.pinnedTabs.includes(repo)
    const isOpen = settings.openTabs.includes(repo)
    const watched = settings.repos.includes(repo)
    const item = (label: string, fn: () => void) => (
      <button key={label} role="menuitem" onClick={() => (setMenu(undefined), fn())}>
        <span>{label}</span>
      </button>
    )
    element = (
      <Popover anchor={menu.anchor} onClose={() => setMenu(undefined)}>
        {pinned ? item('Unpin', () => unpinTab(repo)) : item('Pin tab', () => pinTab(repo))}
        {isOpen && item('Close tab', () => closeTab(repo))}
        {isOpen && settings.openTabs.length > 1 && item('Close other tabs', () => closeOtherTabs(repo))}
        <hr />
        {item(watched ? 'Stop watching' : 'Watch on the dashboard', () => {
          void updateSettings({ repos: watched ? settings.repos.filter((r) => r !== repo) : [...settings.repos, repo] })
          toast(watched ? `Stopped watching ${repo}` : `Watching ${repo}`, 'ok')
        })}
        {item('Open in browser', () => void api.openExternal(`https://github.com/${repo}`))}
        {item('Copy name', () => void navigator.clipboard.writeText(repo))}
      </Popover>
    )
  }
  return { open, element }
}

/** Drag-and-drop between tabs: `onDrop` gets the repo that was dropped on this one. */
const dragProps = (repo: string, onDrop?: (from: string) => void) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-repo', repo),
  ...(onDrop && {
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const from = e.dataTransfer.getData('text/x-repo')
      if (from && from !== repo) onDrop(from)
    }
  })
})

/** Warm the picker's repo list in the background, so it's ready when + is clicked. */
function usePrefetchRepos() {
  useEffect(() => {
    const t = setTimeout(() => void loadMyRepos().catch(() => {}), 4000)
    return () => clearTimeout(t)
  }, [])
}

/** Horizontal tabs: the dashboard, pinned repos as icons, then one tab per open repo. */
export function TabBar() {
  const settings = useSettings()
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const menu = useTabMenu()
  const dashboard = settings.dashboards.find((d) => d.id === settings.activeDashboard)
  usePrefetchRepos()

  return (
    <nav className="tabbar" role="tablist">
      <button role="tab" aria-selected={settings.activeTab === HOME} className={`tab${settings.activeTab === HOME ? ' on' : ''}`} onClick={() => selectTab(HOME)}>
        <Icon name="grid" />
        <span className="tab-name">{dashboard?.name ?? 'Dashboard'}</span>
      </button>
      {settings.pinnedTabs.map((repo, i) => (
        <button
          key={repo}
          role="tab"
          aria-selected={settings.activeTab === repo}
          className={`tab tab-pinned${settings.activeTab === repo ? ' on' : ''}`}
          title={`${repo} (pinned)`}
          onClick={() => selectTab(repo)}
          onContextMenu={menu.open(repo)}
          {...dragProps(repo, (from) => pinTab(from, i))}
        >
          <RepoIcon repo={repo} size={18} />
        </button>
      ))}
      {settings.openTabs.map((repo, i) => (
        <RepoTab key={repo} repo={repo} on={settings.activeTab === repo} onMenu={menu.open(repo)} onDrop={(from) => moveTab(from, i)} className="tab" />
      ))}
      <button ref={addRef} className="tab tab-add" title="Open a repository in a new tab" aria-expanded={adding} onClick={() => setAdding(!adding)}>
        <Icon name="plus" />
      </button>
      {adding && <RepoPicker anchor={addRef.current} onPick={(r) => (setAdding(false), openRepoTab(r))} onClose={() => setAdding(false)} />}
      <span className="spacer" />
      <IconButton icon="tabs" title="Switch to vertical tabs" onClick={() => setTabLayout('vertical')} />
      {menu.element}
    </nav>
  )
}

/** One repo as a tab (horizontal) or a sidebar row (vertical, watched list). */
function RepoTab({ repo, on, onMenu, onDrop, onClick, className, closable = true }: {
  repo: string
  on: boolean
  onMenu: OnMenu
  onDrop?: (from: string) => void
  onClick?: () => void
  className: string
  closable?: boolean
}) {
  const tone = useRepoTone(repo)
  return (
    <button
      role="tab"
      aria-selected={on}
      className={`${className}${on ? ' on' : ''}`}
      title={repo}
      onClick={onClick ?? (() => selectTab(repo))}
      onAuxClick={(e) => closable && e.button === 1 && closeTab(repo)}
      onContextMenu={onMenu}
      {...dragProps(repo, onDrop)}
    >
      {tone ? <StatusIcon tone={tone} size={12} /> : <span className="tab-dot" />}
      <RepoName repo={repo} />
      {closable && (
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
      )}
    </button>
  )
}

/**
 * The left sidebar. Pinned repos sit at the top as a grid of tiles (like a browser's pinned tabs); in
 * vertical-tab mode the dashboard and open tabs follow; then every other watched repo, one click away.
 */
export function RepoSidebar() {
  const settings = useSettings()
  const vertical = settings.tabLayout === 'vertical'
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const menu = useTabMenu()
  const dashboard = settings.dashboards.find((d) => d.id === settings.activeDashboard)
  usePrefetchRepos()
  const others = settings.repos.filter((r) => !settings.pinnedTabs.includes(r) && !(vertical && settings.openTabs.includes(r)))
  const dropAtEnd = (e: DragEvent, fn: (from: string) => void) => {
    e.preventDefault()
    const from = e.dataTransfer.getData('text/x-repo')
    if (from) fn(from)
  }

  return (
    <aside className="repo-sidebar" aria-label="Repositories">
      <div className={`pinned-grid${settings.pinnedTabs.length ? '' : ' empty'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropAtEnd(e, (r) => pinTab(r))}>
        {settings.pinnedTabs.map((repo, i) => (
          <button
            key={repo}
            className={`pinned-tile${settings.activeTab === repo ? ' on' : ''}`}
            title={repo}
            onClick={() => selectTab(repo)}
            onContextMenu={menu.open(repo)}
            {...dragProps(repo, (from) => pinTab(from, i))}
          >
            <RepoIcon repo={repo} size={24} />
            <span className="pinned-name">{repo.split('/')[1]}</span>
          </button>
        ))}
        {!settings.pinnedTabs.length && <span className="dim small">Drag a repo here, or right-click one and choose Pin tab.</span>}
      </div>

      {vertical && (
        <>
          <button className={`side-row${settings.activeTab === HOME ? ' on' : ''}`} onClick={() => selectTab(HOME)}>
            <Icon name="grid" />
            <span className="tab-name">{dashboard?.name ?? 'Dashboard'}</span>
          </button>
          <div className="side-list" onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropAtEnd(e, (r) => moveTab(r, settings.openTabs.length))}>
            {settings.openTabs.map((repo, i) => (
              <RepoTab key={repo} repo={repo} on={settings.activeTab === repo} onMenu={menu.open(repo)} onDrop={(from) => moveTab(from, i)} className="side-row" />
            ))}
            <button ref={addRef} className="side-row side-add" aria-expanded={adding} onClick={() => setAdding(!adding)}>
              <Icon name="plus" />
              <span>Open a repo…</span>
            </button>
          </div>
          {adding && <RepoPicker anchor={addRef.current} onPick={(r) => (setAdding(false), openRepoTab(r))} onClose={() => setAdding(false)} />}
        </>
      )}

      {others.length > 0 && (
        <>
          <div className="side-head">Watched</div>
          <div className="side-list">
            {others.map((repo) => (
              <RepoTab key={repo} repo={repo} on={settings.activeTab === repo} onMenu={menu.open(repo)} onClick={() => openRepoTab(repo)} className="side-row" closable={false} />
            ))}
          </div>
        </>
      )}

      <span className="spacer" />
      <div className="side-foot">
        <IconButton icon="tabs" title={vertical ? 'Switch to tabs across the top' : 'Switch to vertical tabs'} onClick={() => setTabLayout(vertical ? 'horizontal' : 'vertical')} />
        <span className="dim small">{vertical ? 'Vertical tabs' : 'Horizontal tabs'}</span>
        <span className="spacer" />
        <IconButton icon="sidebar" title="Hide sidebar (Ctrl+B)" onClick={toggleSidebar} />
      </div>
      {menu.element}
    </aside>
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
function RepoPicker({ anchor, onPick, onClose }: { anchor: HTMLElement | null; onPick: (repo: string) => void; onClose: () => void }) {
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
    const open = new Set([...settings.openTabs, ...settings.pinnedTabs])
    const watched = settings.repos.map((r) => ({ fullName: r, description: mine?.find((m) => m.fullName === r)?.description ?? null, watched: true }))
    const others = (mine ?? []).filter((m) => !settings.repos.includes(m.fullName)).map((m) => ({ ...m, watched: false }))
    const all = [...watched, ...others].filter((r) => !q.trim() || matches(`${r.fullName} ${r.description ?? ''}`, q.trim()))
    // Anything typed that isn't in the list (e.g. someone else's public repo) can still be opened.
    if (typed && !all.some((r) => r.fullName.toLowerCase() === typed.toLowerCase())) all.unshift({ fullName: typed, description: null, watched: false })
    return all.map((r) => ({ ...r, open: open.has(r.fullName), info: mine?.find((m) => m.fullName === r.fullName) }))
  }, [mine, settings.repos, settings.openTabs, settings.pinnedTabs, q, typed])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return (
    <Popover anchor={anchor} onClose={onClose} className="repo-picker">
      <div role="dialog" aria-label="Open a repository" style={{ display: 'contents' }}>
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
          {!mine && <Skeleton rows={5} />}
          {mine && !items.length && <p className="dim small picker-note">No repositories match. Type owner/name to open any public repo.</p>}
        </div>
      </div>
    </Popover>
  )
}
