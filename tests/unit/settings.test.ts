import { describe, expect, it, vi } from 'vitest'

// store.ts reads paths and encryption from Electron; neither is needed for normalising settings.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))

const { normalizeSettings } = await import('../../src/main/store')
const { DEFAULT_SETTINGS, resolveEditor } = await import('../../src/shared/defaults')
const { TEMPLATES, fromTemplate, duplicate } = await import('../../src/shared/templates')

describe('normalizeSettings', () => {
  it('fills a brand-new install with the defaults', () => {
    const s = normalizeSettings({})
    expect(s.tabLayout).toBe('vertical')
    expect(s.sidebarOpen).toBe(true)
    expect(s.tourDone).toBe(false)
    expect(s.dashboards).toHaveLength(1)
    expect(s.activeDashboard).toBe(s.dashboards[0].id)
  })

  it('gives settings files from before notification rules the quiet defaults', () => {
    const s = normalizeSettings({ repos: ['a/b'], notify: { ...DEFAULT_SETTINGS.notify, runSuccess: false } })
    expect(s.notifyRules).toEqual(DEFAULT_SETTINGS.notifyRules)
    expect(s.notify.runSuccess).toBe(false)
  })

  it('keeps saved notification rules and repairs bad ones', () => {
    const s = normalizeSettings({ notifyRules: { quietHours: { enabled: true, start: 'bad', end: '06:15' }, snoozedUntil: 5, mutedRepos: ['a/b'] } })
    expect(s.notifyRules).toEqual({ quietHours: { enabled: true, start: '22:00', end: '06:15' }, snoozedUntil: 5, mutedRepos: ['a/b'] })
  })

  it('moves installs from before 0.9 to vertical tabs once', () => {
    const s = normalizeSettings({ tabLayout: 'horizontal', sidebarOpen: false })
    expect(s.tabLayout).toBe('vertical')
    expect(s.sidebarOpen).toBe(true)
    expect(s.uiVersion).toBe(1)
  })

  it('keeps horizontal tabs for anyone who chose them after the move', () => {
    const s = normalizeSettings({ tabLayout: 'horizontal', sidebarOpen: false, uiVersion: 1 })
    expect(s.tabLayout).toBe('horizontal')
    expect(s.sidebarOpen).toBe(false)
  })

  it('migrates the v0.1 theme and accent settings', () => {
    const s = normalizeSettings({ theme: 'light', accent: '#ff0000' } as never)
    expect(s.mode).toBe('light')
    expect(s.colorOverrides.dark.accent).toBe('#ff0000')
    expect(s.colorOverrides.light.accent).toBe('#ff0000')
  })

  it('turns a pre-0.3 single layout into a dashboard called Main', () => {
    const widgets = DEFAULT_SETTINGS.widgets.slice(0, 1)
    const s = normalizeSettings({ widgets, layout: [{ i: widgets[0].id, x: 0, y: 0, w: 12, h: 3 }], dashboards: [] })
    expect(s.dashboards).toEqual([{ id: 'main', name: 'Main', widgets, layout: [{ i: widgets[0].id, x: 0, y: 0, w: 12, h: 3 }] }])
  })

  it('falls back to the first dashboard when the active one is gone', () => {
    const s = normalizeSettings({ dashboards: [{ id: 'a', name: 'A', widgets: [], layout: [] }], activeDashboard: 'deleted' })
    expect(s.activeDashboard).toBe('a')
  })

  it('never lets a repo be both pinned and an ordinary tab', () => {
    const s = normalizeSettings({ openTabs: ['o/a', 'o/b'], pinnedTabs: ['o/a'] })
    expect(s.openTabs).toEqual(['o/b'])
    expect(s.pinnedTabs).toEqual(['o/a'])
  })

  it('goes back to the dashboard when the active tab was closed', () => {
    expect(normalizeSettings({ openTabs: ['o/a'], activeTab: 'o/gone' }).activeTab).toBe('home')
    expect(normalizeSettings({ pinnedTabs: ['o/p'], activeTab: 'o/p' }).activeTab).toBe('o/p')
  })

  it('keeps notification preferences it does not know about from being dropped', () => {
    const s = normalizeSettings({ notify: { runFailure: false } as never })
    expect(s.notify.runFailure).toBe(false)
    expect(Object.keys(s.notify).length).toBeGreaterThan(1)
  })
})

describe('resolveEditor', () => {
  const vs = { id: 'vscode', name: 'VS Code', command: 'code' }
  const cursor = { id: 'cursor', name: 'Cursor', command: 'cursor' }
  it('keeps a command the user chose', () => {
    expect(resolveEditor('zed', [cursor])).toBe('zed')
  })
  it('keeps the default when VS Code is installed', () => {
    expect(resolveEditor('code', [cursor, vs])).toBe('code')
  })
  it('falls back to the first installed editor when the default is missing', () => {
    expect(resolveEditor('code', [cursor])).toBe('cursor')
    expect(resolveEditor('', [cursor])).toBe('cursor')
  })
  it('keeps the default while editors are still being detected or none were found', () => {
    expect(resolveEditor('code', undefined)).toBe('code')
    expect(resolveEditor('code', [])).toBe('code')
  })
})

describe('dashboard templates', () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))('%s builds a valid dashboard', (_, t) => {
    const d = fromTemplate(t, 'Test')
    expect(d.name).toBe('Test')
    // Every widget has exactly one layout slot, ids are unique, and slots fit the 12-column grid without overlapping.
    expect(new Set(d.widgets.map((w) => w.id)).size).toBe(d.widgets.length)
    expect(d.layout.map((l) => l.i).sort()).toEqual(d.widgets.map((w) => w.id).sort())
    for (const l of d.layout) expect(l.x + l.w).toBeLessThanOrEqual(12)
    for (const a of d.layout)
      for (const b of d.layout)
        if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.i} overlaps ${b.i}`).toBe(false)
  })
})

describe('duplicate', () => {
  it('copies a dashboard with fresh ids, so the copy never shares widget settings', () => {
    const original = fromTemplate(TEMPLATES[0], 'Original')
    const copy = duplicate(original, 'Copy')
    expect(copy.id).not.toBe(original.id)
    expect(copy.widgets.map((w) => w.type)).toEqual(original.widgets.map((w) => w.type))
    for (const w of copy.widgets) expect(original.widgets.map((o) => o.id)).not.toContain(w.id)
    expect(copy.layout.map((l) => l.i).sort()).toEqual(copy.widgets.map((w) => w.id).sort())
    copy.widgets[0].options.changed = true
    copy.widgets[0].repos.push('o/x')
    expect(original.widgets[0].options.changed).toBeUndefined()
    expect(original.widgets[0].repos).not.toContain('o/x')
  })
  it('drops layout slots for widgets that no longer exist', () => {
    const d = duplicate({ widgets: [], layout: [{ i: 'gone', x: 0, y: 0, w: 1, h: 1 }] }, 'Empty')
    expect(d.layout).toEqual([])
  })
})
