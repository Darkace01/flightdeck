import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))

const { DEFAULT_SETTINGS } = await import('../../src/shared/defaults')
const { exportDashboard, exportTemplate, parseSharedDashboard, addSharedDashboard } = await import('../../src/shared/share')
const { TEMPLATES, fromTemplate } = await import('../../src/shared/templates')
const { exportSettingsJson, importSettingsJson } = await import('../../src/main/importer')

const sample = () => {
  const d = fromTemplate(TEMPLATES[0], 'Team view')
  d.widgets[0].repos = ['acme/api']
  return d
}

describe('exportDashboard / parseSharedDashboard', () => {
  it('round-trips widgets and layout with fresh ids', () => {
    const d = sample()
    const back = parseSharedDashboard(exportDashboard(d))
    expect(back.name).toBe('Team view')
    expect(back.widgets.map((w) => w.type)).toEqual(d.widgets.map((w) => w.type))
    expect(back.layout.map((l) => [l.x, l.y, l.w, l.h])).toEqual(d.layout.map((l) => [l.x, l.y, l.w, l.h]))
    expect(back.id).not.toBe(d.id)
    for (const w of back.widgets) expect(d.widgets.map((x) => x.id)).not.toContain(w.id)
    expect(back.layout.map((l) => l.i).sort()).toEqual(back.widgets.map((w) => w.id).sort())
  })
  it('leaves repo selections out unless asked', () => {
    expect(parseSharedDashboard(exportDashboard(sample())).widgets.every((w) => w.repos.length === 0)).toBe(true)
    expect(parseSharedDashboard(exportDashboard(sample(), { includeRepos: true })).widgets[0].repos).toEqual(['acme/api'])
  })
  it('exports every built-in template', () => {
    for (const t of TEMPLATES) expect(parseSharedDashboard(exportTemplate(t.id)).widgets).toHaveLength(t.widgets.length)
  })
  it('rejects things that are not dashboards, and newer versions', () => {
    expect(() => parseSharedDashboard('{"repos":[]}')).toThrow(/Not a Pushback dashboard/)
    expect(() => parseSharedDashboard('nope')).toThrow()
    expect(() => parseSharedDashboard({ kind: 'pushback-dashboard', version: 2, widgets: [], layout: [] })).toThrow(/newer/)
  })
  it('sanitises hostile payloads: unknown widgets, odd options, out-of-grid layout, bad repo names', () => {
    const d = parseSharedDashboard({
      kind: 'pushback-dashboard',
      version: 1,
      name: '  ',
      localPaths: { 'acme/api': '/etc' },
      widgets: [
        { id: 'a', type: 'runs', repos: ['ok/repo', '../../x', 5], options: { limit: 5, evil: { x: 1 }, fn: 'ok' } },
        { id: 'b', type: 'not-a-widget', repos: [], options: {} }
      ],
      layout: [{ i: 'a', x: 50, y: -3, w: 99, h: 0 }]
    })
    expect(d.name).toBe('Imported dashboard')
    expect(d.widgets).toHaveLength(1)
    expect(d.widgets[0].repos).toEqual(['ok/repo'])
    expect(d.widgets[0].options.evil).toBeUndefined()
    expect(d.widgets[0].options.limit).toBe(5)
    const l = d.layout[0]
    expect(l.x + l.w).toBeLessThanOrEqual(12)
    expect(l.y).toBeGreaterThanOrEqual(0)
    expect(l.h).toBeGreaterThanOrEqual(1)
  })
})

describe('importing', () => {
  const current = { ...DEFAULT_SETTINGS, repos: ['o/a'], localPaths: { 'o/a': '/home/me/a' } }
  it('adds a shared dashboard without touching anything else, and never takes localPaths from it', () => {
    const json = JSON.stringify({ ...JSON.parse(exportDashboard(sample())), localPaths: { 'o/a': '/evil' } })
    const next = importSettingsJson(current, json)
    expect(next.localPaths).toEqual({ 'o/a': '/home/me/a' })
    expect(next.repos).toEqual(['o/a'])
    expect(next.dashboards).toHaveLength(current.dashboards.length + 1)
    expect(next.dashboards.at(-1)?.name).toBe('Team view')
    expect(next.activeDashboard).toBe(next.dashboards.at(-1)?.id)
    expect(next.widgets).toEqual(next.dashboards.at(-1)?.widgets)
  })
  it('keeps live edits to the open dashboard when another is added', () => {
    const edited = { ...current, widgets: current.widgets.slice(0, 1), layout: current.layout.slice(0, 1) }
    const next = addSharedDashboard(edited, exportDashboard(sample()))
    expect(next.dashboards.find((d) => d.id === edited.activeDashboard)?.widgets).toHaveLength(1)
  })
  it('still strips localPaths from a full settings import', () => {
    const next = importSettingsJson(current, JSON.stringify({ repos: ['x/y'], localPaths: { 'x/y': '/evil' } }))
    expect(next.repos).toEqual(['x/y'])
    expect(next.localPaths).toEqual({ 'o/a': '/home/me/a' })
  })
  it('rejects random JSON', () => {
    expect(() => importSettingsJson(current, '{"hello":1}')).toThrow(/Not a Pushback/)
  })
  it('exports settings without this machine\'s folders', () => {
    expect(JSON.parse(exportSettingsJson(current)).localPaths).toBeUndefined()
  })
})
