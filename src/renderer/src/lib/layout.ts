import { getSettings, updateSettings } from './store'

// Must match the grid in components/Dashboard.tsx.
const MARGIN = 12
export const rowHeight = (density: string) => (density === 'compact' ? 30 : 38)

/** Resizes a dashboard widget's grid slot so the widget is `px` tall (rounded up to whole grid rows). */
export function fitWidgetHeight(id: string, px: number): void {
  const s = getSettings()
  const item = s.layout.find((l) => l.i === id)
  if (!item) return
  const h = Math.max(2, Math.ceil((px + MARGIN) / (rowHeight(s.density) + MARGIN)))
  if (h !== item.h) void updateSettings({ layout: s.layout.map((l) => (l.i === id ? { ...l, h } : l)) })
}
