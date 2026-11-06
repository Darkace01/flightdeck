import { describe, expect, it } from 'vitest'
import { GitHubError, type GitHub } from '../../src/main/github'
import { listSecurity, mapAlerts, toSeverity } from '../../src/main/security'
import { countBySeverity, filterAlerts, isDependabot } from '../../src/shared/security'
import type { SecurityAlert } from '../../src/shared/types'

const fakeGh = (answer: (path: string) => unknown) => ({ get: async (path: string) => answer(path) }) as unknown as GitHub

describe('toSeverity', () => {
  it.each([
    ['critical', 'critical'],
    ['HIGH', 'high'],
    ['moderate', 'medium'],
    ['error', 'high'],
    ['warning', 'medium'],
    ['note', 'low'],
    [null, 'low'],
    [undefined, 'low']
  ])('%s → %s', (input, out) => expect(toSeverity(input)).toBe(out))
})

describe('mapAlerts', () => {
  it('reads Dependabot alerts', () => {
    const [a] = mapAlerts('o/r', 'dependabot', [
      { number: 3, html_url: 'u', created_at: 'd', dependency: { package: { name: 'lodash' } }, security_advisory: { summary: 'Pollution', severity: 'moderate' } }
    ])
    expect(a).toEqual({ repo: 'o/r', kind: 'dependabot', number: 3, severity: 'medium', title: 'Pollution', detail: 'lodash', url: 'u', createdAt: 'd' })
  })
  it('prefers code scanning security severity over rule severity, and falls back to the rule id', () => {
    const [a, b] = mapAlerts('o/r', 'code-scanning', [
      { number: 1, html_url: 'u', created_at: 'd', rule: { id: 'js/x', severity: 'warning', security_severity_level: 'critical' }, most_recent_instance: { location: { path: 'a.ts' } } },
      { number: 2, html_url: 'u', created_at: 'd', rule: { id: 'js/y', severity: 'error', security_severity_level: null } }
    ])
    expect(a).toMatchObject({ severity: 'critical', title: 'js/x', detail: 'a.ts' })
    expect(b).toMatchObject({ severity: 'high', detail: '' })
  })
  it('treats every exposed secret as critical', () => {
    expect(mapAlerts('o/r', 'secret-scanning', [{ number: 1, html_url: 'u', created_at: 'd', secret_type: 'github_pat', secret_type_display_name: 'GitHub token' }])[0]).toMatchObject({
      severity: 'critical',
      title: 'GitHub token',
      detail: 'github_pat'
    })
  })
})

describe('listSecurity', () => {
  it('combines the three kinds, most severe first, and reports kinds that are off or forbidden', async () => {
    const gh = fakeGh((path) => {
      if (path.includes('/dependabot/')) return [{ number: 1, html_url: 'u', created_at: '2026-01-01', security_advisory: { summary: 'low one', severity: 'low' } }]
      if (path.includes('/code-scanning/')) throw new GitHubError('Forbidden', 403)
      throw new GitHubError('Not Found', 404)
    })
    const r = await listSecurity(gh, 'o/r')
    expect(r.alerts.map((a) => a.title)).toEqual(['low one'])
    expect(r.unavailable).toEqual({ 'code-scanning': 'The token cannot read these alerts', 'secret-scanning': 'Not enabled for this repository' })
  })
  it('fails on other errors instead of hiding them', async () => {
    const gh = fakeGh(() => {
      throw new GitHubError('Server Error', 500)
    })
    await expect(listSecurity(gh, 'o/r')).rejects.toThrow('Server Error')
  })
})

describe('alert helpers', () => {
  const alert = (kind: SecurityAlert['kind'], severity: SecurityAlert['severity'], createdAt: string): SecurityAlert => ({ repo: 'o/r', kind, number: 1, severity, title: '', detail: '', url: '', createdAt })
  const alerts = [alert('dependabot', 'low', '2026-01-01'), alert('code-scanning', 'critical', '2026-01-02'), alert('dependabot', 'critical', '2026-01-03')]

  it('sorts by severity, then newest', () => expect(filterAlerts(alerts, '', '').map((a) => a.createdAt)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01']))
  it('filters by kind and severity', () => {
    expect(filterAlerts(alerts, 'dependabot', '')).toHaveLength(2)
    expect(filterAlerts(alerts, 'dependabot', 'critical')).toHaveLength(1)
  })
  it('counts per severity', () => expect(countBySeverity(alerts)).toEqual({ critical: 2, high: 0, medium: 0, low: 1 }))
  it.each([
    ['dependabot', true],
    ['dependabot[bot]', true],
    ['app/dependabot', true],
    ['alice', false],
    ['dependabot-fan', false]
  ])('isDependabot(%s)', (author, expected) => expect(isDependabot(author)).toBe(expected))
})
