import { useRef, useState } from 'react'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import { exportDashboard, exportTemplate } from '../../../shared/share'
import { TEMPLATES } from '../../../shared/templates'
import type { LayoutItem, WidgetConfig } from '../../../shared/types'
import { createDashboard, deleteDashboard, duplicateDashboard, moveDashboard, renameDashboard, setDashboardIcon, switchDashboard } from '../lib/dashboards'
import { api, toast, useSettings } from '../lib/store'
import { HOME } from '../lib/tabs'
import { closeModal, openModal, pushModal } from '../lib/ui'
import { DASHBOARD_ICONS, dashboardIcon, Icon, IconButton, Modal, Popover } from './ui'

// More tabs than this crowd the search box, so the rest go in the overflow menu.
const MAX_TABS = 5

/** Saved dashboards as tabs in the top bar; past MAX_TABS they spill into a dropdown with New and Manage. */
export function DashboardTabs() {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const isMac = navigator.userAgent.includes('Mac')
  const all = settings.dashboards
  const activeAt = all.findIndex((d) => d.id === settings.activeDashboard)
  // Keep the open dashboard visible even when it lives past the cut-off.
  const shown = activeAt >= MAX_TABS ? [...all.slice(0, MAX_TABS - 1), all[activeAt]] : all.slice(0, MAX_TABS)
  const hidden = all.filter((d) => !shown.includes(d))
  const crowded = shown.length > 3
  const show = (id: string) => {
    setOpen(false)
    switchDashboard(id)
  }
  const shortcut = (id: string) => {
    const i = all.findIndex((d) => d.id === id)
    return i < 9 ? `${isMac ? '⌘' : 'Ctrl'}+${i + 1}` : undefined
  }
  return (
    <div className="dash-tabs" role="tablist" aria-label="Dashboards">
      {shown.map((d) => {
        const on = d.id === settings.activeDashboard && settings.activeTab === HOME
        return (
          <button
            key={d.id}
            role="tab"
            aria-selected={on}
            className={`dash-tab${d.id === settings.activeDashboard ? ' on' : ''}`}
            title={[d.name, shortcut(d.id)].filter(Boolean).join(' · ')}
            onClick={() => show(d.id)}
          >
            <Icon name={dashboardIcon(d.icon)} />
            {/* Crowded bar: inactive tabs show just their icon (the name is in the tooltip) instead of a truncated name. */}
            {(!crowded || d.id === settings.activeDashboard) && <span>{d.name}</span>}
          </button>
        )
      })}
      <button ref={moreRef} className="dash-tab more" aria-expanded={open} title={hidden.length ? `${hidden.length} more dashboards` : 'Dashboards'} onClick={() => setOpen(!open)}>
        {hidden.length > 0 && <span>+{hidden.length}</span>}
        <span className="dim">▾</span>
      </button>
      {open && (
        <Popover anchor={moreRef.current} onClose={() => setOpen(false)}>
          <div role="menu" style={{ display: 'contents' }}>
            {hidden.map((d) => (
              <button key={d.id} role="menuitem" onClick={() => show(d.id)}>
                <span>
                  <Icon name={dashboardIcon(d.icon)} /> {d.name}
                </span>
                {shortcut(d.id) && <kbd>{shortcut(d.id)}</kbd>}
              </button>
            ))}
            {hidden.length > 0 && <hr />}
            <button role="menuitem" onClick={() => (setOpen(false), openModal({ kind: 'new-dashboard' }))}>
              <span>
                <Icon name="plus" /> New dashboard…
              </span>
            </button>
            <button role="menuitem" onClick={() => (setOpen(false), openModal({ kind: 'dashboards' }))}>
              <span>
                <Icon name="gear" /> Manage dashboards…
              </span>
            </button>
          </div>
        </Popover>
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
        {template && (
          <button className="btn" onClick={() => pushModal({ kind: 'share-dashboard', id: `template:${template.id}` })}>
            Share this template…
          </button>
        )}
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
                <div className="dash-icons" role="radiogroup" aria-label="Dashboard icon">
                  {DASHBOARD_ICONS.map((name) => (
                    <button
                      key={name}
                      role="radio"
                      aria-checked={dashboardIcon(d.icon) === name}
                      className={`dash-icon${dashboardIcon(d.icon) === name ? ' on' : ''}`}
                      title={name}
                      onClick={() => setDashboardIcon(d.id, name)}
                    >
                      <Icon name={name} />
                    </button>
                  ))}
                </div>
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
                <button className="btn btn-sm" onClick={() => pushModal({ kind: 'share-dashboard', id: d.id })}>
                  Share
                </button>
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
        <button className="btn" onClick={() => pushModal({ kind: 'import-dashboard' })}>
          Import…
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={closeModal}>
          Done
        </button>
      </footer>
    </Modal>
  )
}

/** Export a dashboard or template as text: copy it, or save it to a file. */
export function ShareDashboardModal({ id }: { id: string }) {
  const settings = useSettings()
  const [includeRepos, setIncludeRepos] = useState(false)
  const templateId = id.startsWith('template:') ? id.slice('template:'.length) : null
  const saved = settings.dashboards.find((d) => d.id === id)
  // The open dashboard's live widgets are in settings.widgets/layout, not its saved copy.
  const dashboard = saved && (saved.id === settings.activeDashboard ? { ...saved, widgets: settings.widgets, layout: settings.layout } : saved)
  const name = templateId ? (TEMPLATES.find((t) => t.id === templateId)?.name ?? 'Template') : (dashboard?.name ?? 'Dashboard')
  const payload = templateId ? exportTemplate(templateId) : dashboard ? exportDashboard(dashboard, { includeRepos }) : ''
  const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashboard'}.pushback.json`
  return (
    <Modal title={`Share “${name}”`} onClose={closeModal} width={620}>
      <p className="dim small">
        Anyone can import this in Pushback (Manage dashboards → Import). It holds the widgets and layout only, never your token or local folders.
      </p>
      {!templateId && (
        <label className="check">
          <input type="checkbox" checked={includeRepos} onChange={(e) => setIncludeRepos(e.target.checked)} />
          Include each widget's repo selection (may reveal private repo names)
        </label>
      )}
      <textarea rows={10} readOnly value={payload} aria-label="Dashboard payload" onFocus={(e) => e.currentTarget.select()} />
      <footer className="modal-actions">
        <span className="spacer" />
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(payload)
            toast('Dashboard copied to clipboard', 'ok')
          }}
        >
          Copy
        </button>
        <button
          className="btn btn-primary"
          onClick={async () => {
            const r = await api.saveTextFile(fileName, payload)
            if (r.ok) (toast(`Saved ${fileName}`, 'ok'), closeModal())
            else if (r.error) toast(`Couldn't save: ${r.error}`, 'error')
          }}
        >
          Save to file…
        </button>
      </footer>
    </Modal>
  )
}

/** Import a shared dashboard (or a full settings export) from pasted text or a file. */
export function ImportDashboardModal() {
  const [json, setJson] = useState('')
  const run = async (text: string) => {
    const r = await api.importSettings(text)
    toast(r.ok ? 'Imported' : `Import failed: ${r.error}`, r.ok ? 'ok' : 'error')
    if (r.ok) closeModal()
  }
  return (
    <Modal title="Import a dashboard" onClose={closeModal} width={620}>
      <p className="dim small">Paste a shared dashboard, or open a .json file. It's added as a new dashboard; yours are not changed.</p>
      <textarea rows={10} value={json} placeholder="Paste dashboard JSON…" aria-label="Dashboard JSON" onChange={(e) => setJson(e.target.value)} />
      <footer className="modal-actions">
        <button
          className="btn"
          onClick={async () => {
            const text = await api.openTextFile()
            if (text) setJson(text)
          }}
        >
          Open file…
        </button>
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!json.trim()} onClick={() => void run(json)}>
          Import
        </button>
      </footer>
    </Modal>
  )
}
