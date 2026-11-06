import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFY_RULES, inQuietHours, isSilenced, isSnoozed, normalizeNotifyRules, parseClock, withoutMuted } from '../../src/shared/notifyRules'
import type { AppEvent, NotifyRules } from '../../src/shared/types'

const rules = (patch: Partial<NotifyRules> = {}): NotifyRules => ({ ...DEFAULT_NOTIFY_RULES, ...patch })
const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m)
const quiet = (start: string, end: string) => rules({ quietHours: { enabled: true, start, end } })
const event = (repo: string): AppEvent => ({ id: repo, ts: 0, repo, kind: 'run-failure', title: '', body: '', url: '', read: false })

describe('parseClock', () => {
  it('reads HH:MM', () => {
    expect(parseClock('08:30')).toBe(510)
    expect(parseClock('8:05')).toBe(485)
    expect(parseClock('00:00')).toBe(0)
  })
  it('rejects anything else', () => {
    for (const bad of ['', '24:00', '12:60', '8', 'noon', '12:5']) expect(parseClock(bad)).toBeNull()
  })
})

describe('inQuietHours', () => {
  it('is off unless enabled', () => {
    expect(inQuietHours(rules(), at(23))).toBe(false)
  })
  it('handles a window inside one day', () => {
    const r = quiet('09:00', '17:00')
    expect(inQuietHours(r, at(9))).toBe(true)
    expect(inQuietHours(r, at(16, 59))).toBe(true)
    expect(inQuietHours(r, at(17))).toBe(false)
    expect(inQuietHours(r, at(8, 59))).toBe(false)
  })
  it('handles a window that crosses midnight', () => {
    const r = quiet('22:00', '08:00')
    expect(inQuietHours(r, at(22))).toBe(true)
    expect(inQuietHours(r, at(2))).toBe(true)
    expect(inQuietHours(r, at(7, 59))).toBe(true)
    expect(inQuietHours(r, at(8))).toBe(false)
    expect(inQuietHours(r, at(12))).toBe(false)
  })
  it('ignores a window with equal or invalid ends', () => {
    expect(inQuietHours(quiet('10:00', '10:00'), at(10))).toBe(false)
    expect(inQuietHours(quiet('x', '10:00'), at(9))).toBe(false)
  })
})

describe('snooze', () => {
  it('lasts until the stored time', () => {
    const r = rules({ snoozedUntil: at(10).getTime() })
    expect(isSnoozed(r, at(9, 59))).toBe(true)
    expect(isSnoozed(r, at(10))).toBe(false)
  })
  it('silences when either snooze or quiet hours apply', () => {
    expect(isSilenced(rules(), at(12))).toBe(false)
    expect(isSilenced(rules({ snoozedUntil: at(13).getTime() }), at(12))).toBe(true)
    expect(isSilenced(quiet('11:00', '13:00'), at(12))).toBe(true)
  })
})

describe('withoutMuted', () => {
  it('drops muted repos, ignoring case', () => {
    const kept = withoutMuted([event('Acme/api'), event('acme/web')], rules({ mutedRepos: ['acme/API'] }))
    expect(kept.map((e) => e.repo)).toEqual(['acme/web'])
  })
  it('returns the same list when nothing is muted', () => {
    const list = [event('a/b')]
    expect(withoutMuted(list, rules())).toBe(list)
  })
})

describe('normalizeNotifyRules', () => {
  it('fills defaults for a missing value', () => {
    expect(normalizeNotifyRules(undefined)).toEqual(DEFAULT_NOTIFY_RULES)
  })
  it('repairs malformed fields without losing valid ones', () => {
    const r = normalizeNotifyRules({
      quietHours: { enabled: true, start: 'nope', end: '07:30' },
      snoozedUntil: NaN,
      mutedRepos: ['a/b', 3 as unknown as string]
    })
    expect(r.quietHours).toEqual({ enabled: true, start: '22:00', end: '07:30' })
    expect(r.snoozedUntil).toBe(0)
    expect(r.mutedRepos).toEqual(['a/b'])
  })
})
