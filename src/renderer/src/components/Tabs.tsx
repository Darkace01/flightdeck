import { useState } from 'react'
import { closeTab, HOME, moveTab, openRepoTab, selectTab } from '../lib/tabs'
import { useSettings, useSnapshot } from '../lib/store'
import { Icon, runTone, StatusIcon } from './ui'

/** Dashboard tab plus one tab per open repo. Drag to reorder, middle-click or × to close. */
export function TabBar() {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const [dragging, setDragging] = useState<string>()
  const dashboard = settings.dashboards.find((d) => d.id === settings.activeDashboard)
  const closed = settings.repos.filter((r) => !settings.openTabs.includes(r))

  const add = (repo: string) => {
    setAdding(false)
    setTyped('')
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
        {adding && (
          <>
            <div className="menu-backdrop" onClick={() => setAdding(false)} />
            <div className="menu" role="menu">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const m = typed.trim().match(/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)
                  if (m) add(m[1])
                }}
              >
                <input autoFocus placeholder="owner/name or GitHub URL" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </form>
              {closed.length > 0 && <hr />}
              {closed.map((r) => (
                <button key={r} role="menuitem" onClick={() => add(r)}>
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  )
}
