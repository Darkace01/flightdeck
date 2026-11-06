import type { AppEvent, NotifyRules } from './types'

export const DEFAULT_NOTIFY_RULES: NotifyRules = {
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  snoozedUntil: 0,
  mutedRepos: []
}

/** Minutes since midnight for an `HH:MM` string, or null if it isn't one. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}

/** True while quiet hours are on and `now` falls inside them. A window may cross midnight (22:00 to 08:00). */
export function inQuietHours(rules: NotifyRules, now: Date): boolean {
  const q = rules.quietHours
  if (!q.enabled) return false
  const start = parseClock(q.start)
  const end = parseClock(q.end)
  if (start === null || end === null || start === end) return false
  const at = now.getHours() * 60 + now.getMinutes()
  return start < end ? at >= start && at < end : at >= start || at < end
}

export function isSnoozed(rules: NotifyRules, now: Date): boolean {
  return rules.snoozedUntil > now.getTime()
}

/** Whether toasts are suppressed right now. Events are still recorded in the activity feed. */
export function isSilenced(rules: NotifyRules, now: Date): boolean {
  return isSnoozed(rules, now) || inQuietHours(rules, now)
}

/** Drops events from muted repos. Names compare case-insensitively, as GitHub does. */
export function withoutMuted(events: AppEvent[], rules: NotifyRules): AppEvent[] {
  if (!rules.mutedRepos.length) return events
  const muted = new Set(rules.mutedRepos.map((r) => r.toLowerCase()))
  return events.filter((e) => !muted.has(e.repo.toLowerCase()))
}

/** Fills in anything missing or malformed from an older or hand-edited settings file. */
export function normalizeNotifyRules(raw: Partial<NotifyRules> | undefined): NotifyRules {
  const d = DEFAULT_NOTIFY_RULES
  const q = raw?.quietHours
  return {
    quietHours: {
      enabled: q?.enabled === true,
      start: typeof q?.start === 'string' && parseClock(q.start) !== null ? q.start : d.quietHours.start,
      end: typeof q?.end === 'string' && parseClock(q.end) !== null ? q.end : d.quietHours.end
    },
    snoozedUntil: typeof raw?.snoozedUntil === 'number' && Number.isFinite(raw.snoozedUntil) ? raw.snoozedUntil : 0,
    mutedRepos: Array.isArray(raw?.mutedRepos) ? raw.mutedRepos.filter((r): r is string => typeof r === 'string') : []
  }
}
