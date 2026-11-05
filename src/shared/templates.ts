import { DEFAULT_SETTINGS, WIDGET_DEFAULTS } from './defaults'
import type { LayoutItem, SavedDashboard, WidgetConfig, WidgetType } from './types'

interface TemplateWidget {
  type: WidgetType
  /** x, y, w, h on the 12-column grid. */
  at: [number, number, number, number]
  title?: string
  options?: WidgetConfig['options']
}

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  widgets: TemplateWidget[]
}

const overview: TemplateWidget[] = DEFAULT_SETTINGS.widgets.map((w) => {
  const l = DEFAULT_SETTINGS.layout.find((x) => x.i === w.id)!
  return { type: w.type, at: [l.x, l.y, l.w, l.h], options: w.options }
})

export const TEMPLATES: DashboardTemplate[] = [
  { id: 'overview', name: 'Overview', description: 'A bit of everything: repo health, runs, PRs, workflows, activity and insights.', widgets: overview },
  {
    id: 'ci',
    name: 'CI monitor',
    description: "What's running and what broke, with pass rates per workflow.",
    widgets: [
      { type: 'summary', at: [0, 0, 12, 3] },
      { type: 'runs', at: [0, 3, 6, 8], title: 'Running now', options: { filter: 'active' } },
      { type: 'runs', at: [6, 3, 6, 8], title: 'Failures', options: { filter: 'failed' } },
      { type: 'insights', at: [0, 11, 7, 8] },
      { type: 'events', at: [7, 11, 5, 8] }
    ]
  },
  {
    id: 'review',
    name: 'Code review',
    description: 'Reviews waiting on you, your own PRs and anything with failing checks.',
    widgets: [
      { type: 'inbox', at: [0, 0, 5, 10], options: { tab: 'reviewRequests' } },
      { type: 'prs', at: [5, 0, 7, 5], title: 'Awaiting my review', options: { filter: 'review' } },
      { type: 'prs', at: [5, 5, 7, 5], title: 'My pull requests', options: { filter: 'mine' } },
      { type: 'prs', at: [0, 10, 6, 7], title: 'Failing checks', options: { filter: 'failing' } },
      { type: 'events', at: [6, 10, 6, 7] }
    ]
  },
  {
    id: 'release',
    name: 'Release manager',
    description: 'Trigger deploys and releases, then watch the latest run of each workflow.',
    widgets: [
      { type: 'summary', at: [0, 0, 12, 3] },
      { type: 'workflows', at: [0, 3, 5, 9] },
      { type: 'runs', at: [5, 3, 7, 9], title: 'Latest runs', options: { latestOnly: true } },
      { type: 'insights', at: [0, 12, 12, 7] }
    ]
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'Just the essentials: repo health, your work and the activity feed.',
    widgets: [
      { type: 'summary', at: [0, 0, 12, 3] },
      { type: 'inbox', at: [0, 3, 6, 11] },
      { type: 'events', at: [6, 3, 6, 11] }
    ]
  },
  { id: 'blank', name: 'Blank', description: 'Start empty and add the widgets you want.', widgets: [] }
]

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function fromTemplate(template: DashboardTemplate, name: string): SavedDashboard {
  const widgets: WidgetConfig[] = []
  const layout: LayoutItem[] = []
  for (const t of template.widgets) {
    const id = uid(`w-${t.type}`)
    widgets.push({ id, type: t.type, title: t.title, repos: [], options: { ...WIDGET_DEFAULTS[t.type].options, ...t.options } })
    layout.push({ i: id, x: t.at[0], y: t.at[1], w: t.at[2], h: t.at[3] })
  }
  return { id: uid('d'), name, widgets, layout }
}

/** A copy with fresh widget ids, so the two dashboards never share widget settings. */
export function duplicate(d: Pick<SavedDashboard, 'widgets' | 'layout'>, name: string): SavedDashboard {
  const ids = new Map(d.widgets.map((w) => [w.id, uid(`w-${w.type}`)]))
  return {
    id: uid('d'),
    name,
    widgets: d.widgets.map((w) => ({ ...w, id: ids.get(w.id)!, repos: [...w.repos], options: { ...w.options } })),
    layout: d.layout.filter((l) => ids.has(l.i)).map((l) => ({ ...l, i: ids.get(l.i)! }))
  }
}
