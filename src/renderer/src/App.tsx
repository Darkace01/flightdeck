import { useEffect } from 'react'
import { DispatchModal, MergeModal, RunDetailsModal } from './components/ActionModals'
import { Dashboard } from './components/Dashboard'
import { DashboardTabs, ManageDashboardsModal, NewDashboardModal } from './components/Dashboards'
import { Palette } from './components/Palette'
import { PrModal } from './components/PrView'
import { NewIssueModal, NewPrModal, NewReleaseModal } from './components/CreateModals'
import { IssueModal } from './components/IssueView'
import { RepoWorkspace } from './components/RepoWorkspace'
import { FindClonesModal } from './components/FindClones'
import { RepoSidebar, TabBar } from './components/Tabs'
import { AccountSection, ReposSection, SettingsModal } from './components/SettingsModal'
import { Avatar, Icon, IconButton, Toasts } from './components/ui'
import { AddWidgetModal, WidgetSettingsModal } from './components/WidgetModals'
import { timeAgo, useNow } from './lib/format'
import { api, getSettings, useSettings, useSnapshot, useUpdate } from './lib/store'
import { switchDashboard } from './lib/dashboards'
import { openInApp } from './lib/open'
import { cycleTab, HOME, toggleSidebar } from './lib/tabs'
import { useApplyAppearance } from './lib/theme'
import { closeModal, openModal, setEditing, useEditing, useModal } from './lib/ui'

function useShortcuts(): void {
  const editing = useEditing()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openModal({ kind: 'palette' })
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const d = getSettings().dashboards[Number(e.key) - 1]
        if (d) switchDashboard(d.id)
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        openModal({ kind: 'settings' })
      } else if ((mod && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault() // refresh data, not the window
        void api.refresh()
      } else if (!typing && !mod && e.key.toLowerCase() === 'e') {
        setEditing(!editing)
      } else if (!typing && e.key === 'Escape' && editing) {
        setEditing(false)
      } else if (!typing && e.key === '/') {
        e.preventDefault()
        openModal({ kind: 'palette' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])
}

/** The app icon (a launch arrow over a runway), drawn in the theme's accent colour. */
function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden>
      <rect width="20" height="20" rx="4.4" fill="var(--accent)" />
      <g fill="var(--accent-fg)">
        <polygon transform="translate(10 9.2) rotate(45) translate(-10 -10)" points="10,2.4 14.2,8.4 11.4,8.4 11.4,14.8 8.6,14.8 8.6,8.4 5.8,8.4" />
        <g opacity="0.7">
          <rect x="4" y="15.6" width="2.4" height="1.2" />
          <rect x="8.8" y="15.6" width="2.4" height="1.2" />
          <rect x="13.6" y="15.6" width="2.4" height="1.2" />
        </g>
      </g>
    </svg>
  )
}

function UpdateButton() {
  const update = useUpdate()
  if (update.state === 'ready')
    return (
      <button className="btn btn-sm btn-primary" title="Restarts Pushback to finish updating" onClick={() => void api.installUpdate()}>
        Restart to update
      </button>
    )
  if (update.state === 'available' && !update.canInstall)
    return (
      <button className="btn btn-sm btn-primary" onClick={() => void api.openExternal(update.url!)}>
        Get v{update.version}
      </button>
    )
  return null
}

function TopBar() {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const editing = useEditing()
  const now = useNow(5000)
  const rate = snapshot.rateLimit
  const isMac = navigator.userAgent.includes('Mac')
  return (
    <header className="topbar">
      <IconButton icon="sidebar" title="Show or hide the repo sidebar (Ctrl+B)" active={settings.sidebarOpen} onClick={toggleSidebar} />
      <div className="brand">
        <Logo />
        Pushback
      </div>
      <DashboardTabs />
      <button className="search-trigger" onClick={() => openModal({ kind: 'palette' })}>
        <Icon name="search" />
        Search or run a command…
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <div className="topbar-status">
        <span title={snapshot.nextPoll ? `Next refresh ${new Date(snapshot.nextPoll).toLocaleTimeString()}` : undefined}>
          <span className={`pulse${snapshot.polling ? ' busy' : ''}`} />
          {snapshot.polling ? 'Refreshing…' : snapshot.lastPoll ? `Updated ${timeAgo(snapshot.lastPoll, now)}` : 'Waiting…'}
        </span>
        {rate && (
          <span title={`Resets ${new Date(rate.reset).toLocaleTimeString()}`} className={rate.remaining < rate.limit * 0.1 ? 'del' : undefined}>
            API {rate.remaining.toLocaleString()}/{rate.limit.toLocaleString()}
          </span>
        )}
      </div>
      <UpdateButton />
      <IconButton icon="refresh" title="Refresh now (Ctrl+R)" onClick={() => void api.refresh()} />
      <IconButton icon="grid" title={editing ? 'Done editing (E)' : 'Edit layout (E)'} active={editing} onClick={() => setEditing(!editing)} />
      <IconButton icon="gear" title="Settings (Ctrl+,)" onClick={() => openModal({ kind: 'settings' })} />
      {snapshot.viewer && <Avatar src={snapshot.viewer.avatarUrl} login={snapshot.viewer.login} size={24} />}
    </header>
  )
}

function Onboarding() {
  const snapshot = useSnapshot()
  const signedIn = snapshot.auth === 'ok'
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>{signedIn ? 'Pick repositories to watch' : 'Connect to GitHub'}</h1>
        {signedIn ? (
          <>
            <p className="dim">Choose the repos whose Actions and pull requests you want on your dashboard. You can change this any time in Settings.</p>
            <ReposSection />
          </>
        ) : (
          <>
            <p className="dim">The quickest way is the GitHub CLI — Pushback picks up its login automatically:</p>
            <pre>
              <code>gh auth login</code>
            </pre>
            <button className="btn" onClick={() => void api.refresh()}>
              I've signed in with gh — check again
            </button>
            <p className="dim">Or paste a personal access token:</p>
            <AccountSection />
          </>
        )}
      </div>
    </div>
  )
}

function Modals() {
  const modal = useModal()
  if (!modal) return null
  switch (modal.kind) {
    case 'settings':
      return <SettingsModal />
    case 'palette':
      return <Palette />
    case 'widget':
      return <WidgetSettingsModal id={modal.id} />
    case 'add-widget':
      return <AddWidgetModal />
    case 'dispatch':
      return <DispatchModal workflow={modal.workflow} />
    case 'run':
      return <RunDetailsModal run={modal.run} />
    case 'merge':
      return <MergeModal pr={modal.pr} />
    case 'pr':
      return <PrModal key={`${modal.repo}#${modal.number}`} repo={modal.repo} number={modal.number} />
    case 'issue':
      return <IssueModal key={`${modal.repo}#${modal.number}`} repo={modal.repo} number={modal.number} />
    case 'new-pr':
      return <NewPrModal repo={modal.repo} head={modal.head} />
    case 'new-issue':
      return <NewIssueModal repo={modal.repo} />
    case 'new-release':
      return <NewReleaseModal repo={modal.repo} />
    case 'new-dashboard':
      return <NewDashboardModal />
    case 'dashboards':
      return <ManageDashboardsModal />
    case 'find-clones':
      return <FindClonesModal />
  }
}

export function App() {
  const snapshot = useSnapshot()
  const settings = useSettings()
  useApplyAppearance()
  useShortcuts()
  useEffect(() => closeModal, [])
  useEffect(() => api.onNavigate(openInApp), [])

  // Until the first poll answers, auth reads as missing; show the dashboard's skeleton rather than flashing sign-in.
  const starting = !snapshot.lastPoll && settings.repos.length > 0
  const ready = starting || (snapshot.auth === 'ok' && settings.repos.length > 0)
  return (
    <div className="app">
      <TopBar />
      {ready ? (
        <div className="app-body">
          {settings.sidebarOpen && <RepoSidebar />}
          <div className="app-main">
            {settings.tabLayout === 'horizontal' && <TabBar />}
            {settings.activeTab === HOME ? <Dashboard /> : <RepoWorkspace key={settings.activeTab} repo={settings.activeTab} />}
          </div>
        </div>
      ) : (
        <Onboarding />
      )}
      <Modals />
      <Toasts />
    </div>
  )
}
