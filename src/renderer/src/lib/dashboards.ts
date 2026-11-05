import { duplicate, fromTemplate, TEMPLATES } from '../../../shared/templates'
import type { SavedDashboard, Settings } from '../../../shared/types'
import { getSettings, toast, updateSettings } from './store'

/** The saved list with the open dashboard's live widgets/layout written back into it. */
function synced(s: Settings): SavedDashboard[] {
  return s.dashboards.map((d) => (d.id === s.activeDashboard ? { ...d, widgets: s.widgets, layout: s.layout } : d))
}

export function switchDashboard(id: string): void {
  const s = getSettings()
  const target = s.dashboards.find((d) => d.id === id)
  if (!target || id === s.activeDashboard) return
  void updateSettings({ dashboards: synced(s), activeDashboard: id, widgets: target.widgets, layout: target.layout })
}

/** `source` is a template id, or the id of a saved dashboard to copy. */
export function createDashboard(name: string, source: string): void {
  const s = getSettings()
  const list = synced(s)
  const template = TEMPLATES.find((t) => t.id === source)
  const copyOf = list.find((d) => d.id === source)
  const d = template ? fromTemplate(template, name) : duplicate(copyOf ?? s, name)
  void updateSettings({ dashboards: [...list, d], activeDashboard: d.id, widgets: d.widgets, layout: d.layout })
  toast(`Created “${name}”`, 'ok')
}

export function renameDashboard(id: string, name: string): void {
  const s = getSettings()
  if (!name.trim()) return
  void updateSettings({ dashboards: synced(s).map((d) => (d.id === id ? { ...d, name: name.trim() } : d)) })
}

export function duplicateDashboard(id: string): void {
  const source = getSettings().dashboards.find((d) => d.id === id)
  if (source) createDashboard(`${source.name} copy`, id)
}

export function deleteDashboard(id: string): void {
  const s = getSettings()
  if (s.dashboards.length < 2) return
  const rest = synced(s).filter((d) => d.id !== id)
  // Deleting the open dashboard switches to its neighbour.
  const next = id === s.activeDashboard ? rest[Math.max(0, s.dashboards.findIndex((d) => d.id === id) - 1)] : null
  void updateSettings({ dashboards: rest, ...(next && { activeDashboard: next.id, widgets: next.widgets, layout: next.layout }) })
}

export function moveDashboard(id: string, by: -1 | 1): void {
  const list = synced(getSettings())
  const i = list.findIndex((d) => d.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  void updateSettings({ dashboards: list })
}

/** Replaces the open dashboard's widgets with a template's, keeping its name. */
export function applyTemplate(templateId: string): void {
  const template = TEMPLATES.find((t) => t.id === templateId)
  if (!template) return
  const { widgets, layout } = fromTemplate(template, '')
  void updateSettings({ widgets, layout })
}
