import { describe, expect, it, vi } from 'vitest'
import { attentionCount, badgeText } from '../../src/shared/attention'
import type { AppEvent, InboxItem } from '../../src/shared/types'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))

const ev = (url: string, read = false): AppEvent => ({ id: url, ts: 0, repo: 'o/r', kind: 'pr-opened', title: '', body: '', url, read })
const item = (url: string, extra: Partial<InboxItem> = {}): InboxItem => ({
  repo: 'o/r', number: 1, title: '', url, kind: 'pr', author: 'a', authorAvatar: '', updatedAt: '', ...extra
})

describe('attentionCount', () => {
  it('counts unread events only', () => {
    expect(attentionCount({ events: [ev('a'), ev('b', true), ev('c')] })).toBe(2)
  })
  it('adds review requests and your failing PRs, but not twice for the same PR', () => {
    const inbox = {
      reviewRequests: [item('a'), item('r')],
      myPrs: [item('f', { checks: 'FAILURE' }), item('ok', { checks: 'SUCCESS' }), item('c', { reviewDecision: 'CHANGES_REQUESTED' })],
      assigned: [item('x')]
    }
    // 'a' is already an unread event; r, f and c are new; ok and assigned never count.
    expect(attentionCount({ events: [ev('a')], inbox })).toBe(4)
  })
  it('is zero for an empty snapshot', () => {
    expect(attentionCount({ events: [] })).toBe(0)
  })
})

describe('badgeText', () => {
  it('hides zero and caps large numbers', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(250)).toBe('99+')
  })
})

describe('launch-at-login settings', () => {
  it('default off, and old settings files load with the defaults', async () => {
    const { normalizeSettings } = await import('../../src/main/store')
    const s = normalizeSettings({ repos: ['o/a'], uiVersion: 1 })
    expect(s.launchAtLogin).toBe(false)
    expect(s.startInTray).toBe(true)
    expect(normalizeSettings({ launchAtLogin: true }).launchAtLogin).toBe(true)
  })
})
