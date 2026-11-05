import type { LayoutItem, Settings, WidgetConfig, WidgetType } from './types'

export const WIDGET_DEFAULTS: Record<WidgetType, { title: string; w: number; h: number; options: WidgetConfig['options'] }> = {
  summary: { title: 'Repositories', w: 12, h: 3, options: {} },
  runs: { title: 'Workflow runs', w: 7, h: 9, options: { filter: 'all', branch: '', limit: 30 } },
  prs: { title: 'Pull requests', w: 5, h: 9, options: { filter: 'all', hideDrafts: false } },
  workflows: { title: 'Run a workflow', w: 5, h: 7, options: { dispatchableOnly: true } },
  events: { title: 'Activity', w: 7, h: 7, options: { unreadOnly: false } }
}

const widgets: WidgetConfig[] = [
  { id: 'w-summary', type: 'summary', repos: [], options: { ...WIDGET_DEFAULTS.summary.options } },
  { id: 'w-runs', type: 'runs', repos: [], options: { ...WIDGET_DEFAULTS.runs.options } },
  { id: 'w-prs', type: 'prs', repos: [], options: { ...WIDGET_DEFAULTS.prs.options } },
  { id: 'w-workflows', type: 'workflows', repos: [], options: { ...WIDGET_DEFAULTS.workflows.options } },
  { id: 'w-events', type: 'events', repos: [], options: { ...WIDGET_DEFAULTS.events.options } }
]

const layout: LayoutItem[] = [
  { i: 'w-summary', x: 0, y: 0, w: 12, h: 3 },
  { i: 'w-runs', x: 0, y: 3, w: 7, h: 9 },
  { i: 'w-prs', x: 7, y: 3, w: 5, h: 9 },
  { i: 'w-workflows', x: 0, y: 12, w: 5, h: 7 },
  { i: 'w-events', x: 5, y: 12, w: 7, h: 7 }
]

export const DEFAULT_SETTINGS: Settings = {
  repos: [],
  pollSeconds: 60,
  activePollSeconds: 10,
  notify: {
    runStarted: false,
    runSuccess: true,
    runFailure: true,
    prOpened: true,
    prClosed: true,
    prReady: true,
    reviewRequested: true,
    checksFailed: true,
    onlyMine: false
  },
  theme: 'dark',
  accent: '#58a6ff',
  density: 'comfortable',
  closeToTray: true,
  widgets,
  layout
}
