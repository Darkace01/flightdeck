import { useState } from 'react'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import { TEMPLATES } from '../../../shared/templates'
import type { LayoutItem, WidgetConfig } from '../../../shared/types'
import { createDashboard, deleteDashboard, duplicateDashboard, moveDashboard, renameDashboard, switchDashboard } from '../lib/dashboards'
import { useSettings } from '../lib/store'
import { closeModal, openModal } from '../lib/ui'
import { Icon, IconButton, Modal } from './ui'

/** Top-bar menu for switching between saved dashboards. */
export function DashboardSwitcher() {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const current = settings.dashboards.find((d) => d.id === settings.activeDashboard)
  const isMac = navigator.userAgent.includes('Mac')
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="switcher">
      <button className="switcher-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Switch dashboard">
        {current?.name ?? 'Dashboard'} <span className="dim">▾</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            {settings.dashboards.map((d, i) => (
              <button key={d.id} role="menuitem" className={d.id === settings.activeDashboard ? 'on' : ''} onClick={go(() => switchDashboard(d.id))}>
                <span>{d.name}</span>
                {i < 9 && <kbd>{isMac ? '⌘' : 'Ctrl'} {i + 1}</kbd>}
              </button>
            ))}
            <hr />
            <button role="menuitem" onClick={go(() => openModal({ kind: 'new-dashboard' }))}>
              <span>
                <Icon name="plus" /> New dashboard…
              </span>
            </button>
            <button role="menuitem" onClick={go(() => openModal({ kind: 'dashboards' }))}>
              <span>
                <Icon name="gear" /> Manage dashboards…
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** A thumbnail of a layout: one box per widget on the 12-column grid. */
export function LayoutPreview({ widgets, layout }: { widgets: Pick<WidgetConfig, 'id' | 'type' | 'title'>[]; layout: LayoutItem[] }) {
  const rows = Math.max(1, ...layout.map((l) => l.y + l.h))
  return (
    <div className="layout-preview">
      {layout.map((l) => {
        const w = widgets.find((x) => x.id === l.i)
        if (!w) return null
        return (
          <div
            key={l.i}
            className={`lp-box lp-${w.type}`}
            style={{ left: `${(l.x / 12) * 100}%`, top: `${(l.y / rows) * 100}%`, width: `${(l.w / 12) * 100}%`, height: `${(l.h / rows) * 100}%` }}
          >
            <span>{w.title || WIDGET_DEFAULTS[w.type].title}</span>
          </div>
        )
      })}
      {!layout.length && <span className="dim small lp-empty">Empty</span>}
    </div>
  )
}

const templatePreview = (t: (typeof TEMPLATES)[number]) => {
  const widgets = t.widgets.map((w, i) => ({ id: String(i), type: w.type, title: w.title }))
  const layout = t.widgets.map((w, i) => ({ i: String(i), x: w.at[0], y: w.at[1], w: w.at[2], h: w.at[3] }))
  return <LayoutPreview widgets={widgets} layout={layout} />
}

export function NewDashboardModal() {
  const settings = useSettings()
  const [source, setSource] = useState('overview')
  const template = TEMPLATES.find((t) => t.id === source)
  const current = settings.dashboards.find((d) => d.id === settings.activeDashboard)
  const [name, setName] = useState('')
  const finalName = name.trim() || (template ? template.name : `${current?.name ?? 'Dashboard'} copy`)

  return (
    <Modal title="New dashboard" onClose={closeModal} width={820}>
      <label className="field">
        <span>Name</span>
        <input value={name} placeholder={finalName} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="field">
        <span>Start from</span>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`template-card${source === t.id ? ' on' : ''}`} onClick={() => setSource(t.id)}>
              {templatePreview(t)}
              <span className="strong">{t.name}</span>
              <span className="dim small">{t.description}</span>
            </button>
          ))}
          {current && (
            <button className={`template-card${source === current.id ? ' on' : ''}`} onClick={() => setSource(current.id)}>
              <LayoutPreview widgets={settings.widgets} layout={settings.layout} />
              <span className="strong">Copy of “{current.name}”</span>
              <span className="dim small">Duplicate the dashboard you're on, widget settings and all.</span>
            </button>
          )}
        </div>
      </div>
      <footer className="modal-actions">
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            createDashboard(finalName, source)
            closeModal()
          }}
        >
          Create dashboard
        </button>
      </footer>
    </Modal>
  )
}

export function ManageDashboardsModal() {
  const settings = useSettings()
  return (
    <Modal title="Dashboards" onClose={closeModal} width={620}>
      <p className="dim small">Each dashboard has its own widgets and layout. Switch between them from the top bar or with Ctrl+1…9.</p>
      <ul className="list dash-list">
        {settings.dashboards.map((d, i) => {
          const active = d.id === settings.activeDashboard
          // The open dashboard's live layout is in settings.widgets/layout, not the saved copy.
          const widgets = active ? settings.widgets : d.widgets
          const layout = active ? settings.layout : d.layout
          return (
            <li key={d.id} className="row">
              <div className="dash-thumb">
                <LayoutPreview widgets={widgets} layout={layout} />
              </div>
              <div className="row-main">
                <input
                  className="dash-name"
                  defaultValue={d.name}
                  aria-label="Dashboard name"
                  onBlur={(e) => renameDashboard(d.id, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <div className="row-meta">
                  <span>
                    {widgets.length} widget{widgets.length === 1 ? '' : 's'}
                  </span>
                  {active && <span className="badge badge-ok">Open</span>}
                </div>
              </div>
              <div className="inline">
                {!active && (
                  <button className="btn btn-sm" onClick={() => (switchDashboard(d.id), closeModal())}>
                    Open
                  </button>
                )}
                <IconButton icon="up" title="Move up" disabled={i === 0} onClick={() => moveDashboard(d.id, -1)} />
                <IconButton icon="plus" title="Duplicate" onClick={() => duplicateDashboard(d.id)} />
                <IconButton icon="trash" title="Delete" disabled={settings.dashboards.length < 2} onClick={() => confirm(`Delete “${d.name}”?`) && deleteDashboard(d.id)} />
              </div>
            </li>
          )
        })}
      </ul>
      <footer className="modal-actions">
        <button className="btn" onClick={() => openModal({ kind: 'new-dashboard' })}>
          <Icon name="plus" /> New dashboard…
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={closeModal}>
          Done
        </button>
      </footer>
    </Modal>
  )
}
