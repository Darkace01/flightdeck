import { rowHeight as gridRowHeight } from '../lib/layout'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from 'react-grid-layout'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import type { LayoutItem, SavedSearch, WidgetConfig, WidgetType } from '../../../shared/types'
import { getSettings, updateSettings, useSettings, useSnapshot } from '../lib/store'
import { openModal, useEditing } from '../lib/ui'
import { DeploymentsWidget } from '../widgets/DeploymentsWidget'
import { EventsWidget } from '../widgets/EventsWidget'
import { InboxWidget } from '../widgets/InboxWidget'
import { InsightsWidget } from '../widgets/InsightsWidget'
import { PrsWidget } from '../widgets/PrsWidget'
import { SearchWidget } from '../widgets/SearchWidget'
import { RunsWidget } from '../widgets/RunsWidget'
import { SummaryWidget } from '../widgets/SummaryWidget'
import type { WidgetProps } from '../widgets/types'
import { WorkflowsWidget } from '../widgets/WorkflowsWidget'
import { api } from '../lib/store'
import { activeFilters } from '../lib/filters'
import { FilterBar } from './FilterBar'
import { Icon, IconButton, Skeleton } from './ui'

export const WIDGETS: Record<WidgetType, { component: ComponentType<WidgetProps>; description: string }> = {
  search: { component: SearchWidget, description: 'A saved GitHub search across every repo and org, like your open PRs everywhere. Pin one from Saved searches.' },
  summary: { component: SummaryWidget, description: 'Health tile per repo: default-branch status, running jobs, open PRs.' },
  runs: { component: RunsWidget, description: 'Live workflow runs with cancel / re-run, filterable by status and branch.' },
  prs: { component: PrsWidget, description: 'Open pull requests with checks, review state, approve and merge.' },
  workflows: { component: WorkflowsWidget, description: 'Trigger workflow_dispatch workflows with their inputs.' },
  events: { component: EventsWidget, description: 'Feed of everything that changed — the same events you get notified about.' },
  inbox: { component: InboxWidget, description: 'Reviews requested from you, your PRs and assigned issues across all of GitHub.' },
  insights: { component: InsightsWidget, description: 'Pass rate, average duration and recent outcomes per workflow.' },
  deployments: {
    component: DeploymentsWidget,
    description: 'What version is live in each environment or for each client, and a history of every deployment (like Octopus Deploy).'
  }
}

export function addWidget(type: WidgetType): void {
  const s = getSettings()
  const id = `w-${type}-${Date.now().toString(36)}`
  const d = WIDGET_DEFAULTS[type]
  const bottom = s.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
  void updateSettings({
    widgets: [...s.widgets, { id, type, repos: [], options: { ...d.options } }],
    layout: [...s.layout, { i: id, x: 0, y: bottom, w: d.w, h: d.h }]
  })
}

/** Pins a saved search as a widget; the widget keeps its own copy of the query, so shared dashboards carry it too. */
export function pinSearch(s: Pick<SavedSearch, 'name' | 'query' | 'kind'>): void {
  const st = getSettings()
  const id = `w-search-${Date.now().toString(36)}`
  const d = WIDGET_DEFAULTS.search
  const bottom = st.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
  void updateSettings({
    widgets: [...st.widgets, { id, type: 'search', title: s.name, repos: [], options: { ...d.options, query: s.query, kind: s.kind } }],
    layout: [...st.layout, { i: id, x: 0, y: bottom, w: d.w, h: d.h }]
  })
}

export function removeWidget(id: string): void {
  const s = getSettings()
  void updateSettings({ widgets: s.widgets.filter((w) => w.id !== id), layout: s.layout.filter((l) => l.i !== id) })
}

function WidgetFrame({ widget, editing }: { widget: WidgetConfig; editing: boolean }) {
  const [filter, setFilter] = useState('')
  const [searching, setSearching] = useState(false)
  const snapshot = useSnapshot()
  const { component: Body } = WIDGETS[widget.type]
  const title = widget.title || WIDGET_DEFAULTS[widget.type].title
  const unread = widget.type === 'events' ? snapshot.events.filter((e) => !e.read).length : 0
  const defaults = WIDGET_DEFAULTS[widget.type].options as Record<string, string | number | boolean>
  const options = widget.options as Record<string, string | number | boolean>
  const active = activeFilters(widget.type, widget.repos, options, defaults)
  const [filtering, setFiltering] = useState(active > 0)
  const settings = useSettings()

  return (
    <div className="widget">
      <header className="widget-head">
        <h3>
          {title}
          {unread > 0 && <span className="count">{unread}</span>}
        </h3>
        <div className="widget-tools" onMouseDown={(e) => e.stopPropagation()}>
          {searching || filter ? (
            <input
              autoFocus
              className="widget-filter"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onBlur={() => setSearching(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFilter('')
                  setSearching(false)
                }
              }}
            />
          ) : (
            <IconButton icon="search" title="Filter" onClick={() => setSearching(true)} />
          )}
          {widget.type !== 'inbox' && (
            <span className="filter-toggle">
              <IconButton icon="filter" title="Filters" active={filtering} onClick={() => setFiltering(!filtering)} />
              {active > 0 && <span className="filter-count">{active}</span>}
            </span>
          )}
          {widget.type === 'events' && (
            <>
              <IconButton icon="check" title="Mark all read" onClick={() => void api.markRead()} />
              <IconButton icon="trash" title="Clear activity" onClick={() => void api.clearEvents()} />
            </>
          )}
          <IconButton icon="gear" title="Widget settings" onClick={() => openModal({ kind: 'widget', id: widget.id })} />
          {editing && <IconButton icon="close" title="Remove widget" onClick={() => removeWidget(widget.id)} />}
        </div>
      </header>
      {filtering && widget.type !== 'inbox' && (
        <FilterBar
          type={widget.type}
          repos={widget.type === 'search' ? undefined : widget.repos}
          scope={widget.repos.length ? widget.repos : settings.repos}
          options={options}
          defaults={defaults}
          onChange={(patch) =>
            void updateSettings({ widgets: getSettings().widgets.map((w) => (w.id === widget.id ? { ...w, repos: patch.repos ?? w.repos, options: patch.options ?? w.options } : w)) })
          }
        />
      )}
      <div className="widget-body">
        {/* Activity comes from disk, so it can show at once; everything else waits for the first poll. */}
        {!snapshot.lastPoll && widget.type !== 'events' ? <Skeleton /> : <Body widget={widget} filter={filter} />}
      </div>
    </div>
  )
}

const strip = (layout: Layout): LayoutItem[] => layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))

export function Dashboard() {
  const settings = useSettings()
  const editing = useEditing()
  const { width, containerRef, mounted } = useContainerWidth()
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const rowHeight = gridRowHeight(settings.density)
  // Make sure every widget has a layout slot even if settings were hand-edited.
  const layout: LayoutItem[] = settings.widgets.map(
    (w) => settings.layout.find((l) => l.i === w.id) ?? { i: w.id, x: 0, y: 999, w: WIDGET_DEFAULTS[w.type].w, h: WIDGET_DEFAULTS[w.type].h }
  )

  const onLayoutChange = (next: Layout) => {
    const items = strip(next)
    if (JSON.stringify(items) === JSON.stringify(strip(layout))) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void updateSettings({ layout: items }), 250)
  }

  return (
    <div ref={containerRef} className={`dashboard${editing ? ' editing' : ''}`}>
      {mounted && (
        <ReactGridLayout
          key={settings.activeDashboard}
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight, margin: [12, 12], containerPadding: [16, 12] }}
          dragConfig={{ enabled: editing, handle: '.widget-head' }}
          resizeConfig={{ enabled: editing }}
          compactor={verticalCompactor}
          onLayoutChange={onLayoutChange}
        >
          {settings.widgets.map((w) => (
            <div key={w.id}>
              <WidgetFrame widget={w} editing={editing} />
            </div>
          ))}
        </ReactGridLayout>
      )}
      {editing && (
        <button className="add-widget" onClick={() => openModal({ kind: 'add-widget' })}>
          <Icon name="plus" /> Add widget
        </button>
      )}
    </div>
  )
}
