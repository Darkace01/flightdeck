import { useEffect } from 'react'
import { DispatchModal, MergeModal, RunDetailsModal } from './components/ActionModals'
import { Dashboard } from './components/Dashboard'
import { Palette } from './components/Palette'
import { AccountSection, ReposSection, SettingsModal } from './components/SettingsModal'
import { Avatar, Icon, IconButton, Toasts } from './components/ui'
import { AddWidgetModal, WidgetSettingsModal } from './components/WidgetModals'
import { timeAgo, useNow } from './lib/format'
import { api, useSettings, useSnapshot } from './lib/store'
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

function TopBar() {
  const snapshot = useSnapshot()
  const editing = useEditing()
  const now = useNow(5000)
  const rate = snapshot.rateLimit
  const isMac = navigator.userAgent.includes('Mac')
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <i style={{ width: 12 }} />
          <i style={{ width: 9 }} />
          <i style={{ width: 10 }} />
        </span>
        RepoDeck
      </div>
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
            <p className="dim">The quickest way is the GitHub CLI — RepoDeck picks up its login automatically:</p>
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
  }
}

export function App() {
  const snapshot = useSnapshot()
  const settings = useSettings()
  useApplyAppearance()
  useShortcuts()
  useEffect(() => closeModal, [])

  const ready = snapshot.auth === 'ok' && settings.repos.length > 0
  return (
    <div className="app">
      <TopBar />
      {ready ? <Dashboard /> : <Onboarding />}
      <Modals />
      <Toasts />
    </div>
  )
}
