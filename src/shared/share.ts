import { WIDGET_DEFAULTS } from './defaults'
import { duplicate, fromTemplate, TEMPLATES } from './templates'
import type { LayoutItem, SavedDashboard, Settings, WidgetConfig, WidgetType } from './types'

// Sharing a dashboard (or a template) as text: a small JSON payload that can be saved to a file, pasted in chat
// and imported on another machine. It only ever carries widgets and layout: no folders, tokens or other settings.

export const SHARE_KIND = 'pushback-dashboard'

export interface SharedDashboard {
  kind: typeof SHARE_KIND
  version: 1
  name: string
  widgets: WidgetConfig[]
  layout: LayoutItem[]
}

/**
 * The payload for a dashboard. Widget repo selections are left out unless asked for, since repo names (and
 * saved-search queries) can be private to your org.
 */
export function exportDashboard(d: Pick<SavedDashboard, 'name' | 'widgets' | 'layout'>, opts: { includeRepos?: boolean } = {}): string {
  const payload: SharedDashboard = {
    kind: SHARE_KIND,
    version: 1,
    name: d.name,
    widgets: d.widgets.map((w) => ({ ...w, repos: opts.includeRepos ? [...w.repos] : [], options: { ...w.options } })),
    layout: d.layout.map((l) => ({ ...l }))
  }
  return JSON.stringify(payload, null, 2)
}

/** A built-in template as a payload, so templates can be shared the same way as dashboards. */
export function exportTemplate(templateId: string): string {
  const t = TEMPLATES.find((x) => x.id === templateId)
  if (!t) throw new Error(`Unknown template ${templateId}`)
  return exportDashboard(fromTemplate(t, t.name))
}

export function isSharedDashboard(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === SHARE_KIND
}

const isPrimitive = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v)
const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null)

/**
 * Reads a payload from someone else, trusting nothing in it: only known widget types, string/number/boolean
 * options, layout clamped to the 12-column grid, and fresh ids so it can't collide with (or overwrite) anything.
 */
export function parseSharedDashboard(input: unknown): SavedDashboard {
  const p = (typeof input === 'string' ? JSON.parse(input) : input) as Partial<SharedDashboard> | null
  if (!p || !isSharedDashboard(p)) throw new Error('Not a Pushback dashboard')
  if (p.version !== 1) throw new Error('This dashboard was made by a newer version of Pushback')
  if (!Array.isArray(p.widgets) || !Array.isArray(p.layout)) throw new Error('The dashboard is missing its widgets')
  const widgets: WidgetConfig[] = []
  const layout: LayoutItem[] = []
  for (const w of p.widgets) {
    if (!w || typeof w.id !== 'string' || !(w.type in WIDGET_DEFAULTS)) continue
    const options: WidgetConfig['options'] = { ...WIDGET_DEFAULTS[w.type as WidgetType].options }
    for (const [k, v] of Object.entries(w.options ?? {})) if (isPrimitive(v)) options[k] = v
    widgets.push({
      id: w.id,
      type: w.type,
      ...(typeof w.title === 'string' && { title: w.title.slice(0, 80) }),
      repos: (Array.isArray(w.repos) ? w.repos : []).filter((r): r is string => typeof r === 'string' && /^[\w.-]+\/[\w.-]+$/.test(r)),
      options
    })
    const l = p.layout.find((x) => x?.i === w.id)
    const x = int(l?.x, 0, 11)
    const y = int(l?.y, 0, 1000)
    const lw = int(l?.w, 1, 12)
    const h = int(l?.h, 1, 100)
    // A widget with no usable slot goes at the bottom, rather than being dropped.
    layout.push(x === null || y === null || lw === null || h === null ? { i: w.id, x: 0, y: 1000, w: 12, h: WIDGET_DEFAULTS[w.type as WidgetType].h } : { i: w.id, x: Math.min(x, 12 - lw), y, w: lw, h })
  }
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : 'Imported dashboard'
  return duplicate({ widgets, layout }, name)
}

/** Adds an imported dashboard next to the existing ones and opens it. Everything else in `current` is untouched, including localPaths. */
export function addSharedDashboard(current: Settings, input: unknown): Settings {
  const d = parseSharedDashboard(input)
  const live = current.dashboards.map((x) => (x.id === current.activeDashboard ? { ...x, widgets: current.widgets, layout: current.layout } : x))
  return { ...current, dashboards: [...live, d], activeDashboard: d.id, widgets: d.widgets, layout: d.layout, activeTab: 'home' }
}
