import type { AlertKind, AlertSeverity, RepoSecurity, SecurityAlert } from '../shared/types'
import { GitHubError, type GitHub } from './github'

// Security alerts for the Security widget: Dependabot, code scanning and secret scanning, one ETag-cached REST
// GET each (a 304 is free). Each feature can be off for a repo or out of reach of the token (404 / 403), which
// is normal, so that shows as "unavailable" instead of failing the whole widget.

const SEVERITIES: AlertSeverity[] = ['critical', 'high', 'medium', 'low']

/** GitHub's severity words, including code scanning's error/warning/note, as one of ours. */
export function toSeverity(value: string | null | undefined): AlertSeverity {
  const v = (value ?? '').toLowerCase()
  if ((SEVERITIES as string[]).includes(v)) return v as AlertSeverity
  if (v === 'moderate') return 'medium'
  if (v === 'error') return 'high'
  if (v === 'warning') return 'medium'
  return 'low'
}

interface GhDependabot {
  number: number
  html_url: string
  created_at: string
  dependency?: { package?: { name?: string } }
  security_advisory?: { summary?: string; severity?: string }
}

interface GhCodeScanning {
  number: number
  html_url: string
  created_at: string
  rule?: { id?: string; description?: string; severity?: string; security_severity_level?: string | null }
  most_recent_instance?: { location?: { path?: string } }
}

interface GhSecret {
  number: number
  html_url: string
  created_at: string
  secret_type?: string
  secret_type_display_name?: string
}

const PATHS: Record<AlertKind, string> = {
  dependabot: 'dependabot/alerts',
  'code-scanning': 'code-scanning/alerts',
  'secret-scanning': 'secret-scanning/alerts'
}

export function mapAlerts(repo: string, kind: AlertKind, items: unknown[]): SecurityAlert[] {
  switch (kind) {
    case 'dependabot':
      return (items as GhDependabot[]).map((a) => ({
        repo,
        kind,
        number: a.number,
        severity: toSeverity(a.security_advisory?.severity),
        title: a.security_advisory?.summary ?? 'Vulnerable dependency',
        detail: a.dependency?.package?.name ?? '',
        url: a.html_url,
        createdAt: a.created_at
      }))
    case 'code-scanning':
      return (items as GhCodeScanning[]).map((a) => ({
        repo,
        kind,
        number: a.number,
        severity: toSeverity(a.rule?.security_severity_level ?? a.rule?.severity),
        title: a.rule?.description ?? a.rule?.id ?? 'Code scanning alert',
        detail: a.most_recent_instance?.location?.path ?? '',
        url: a.html_url,
        createdAt: a.created_at
      }))
    case 'secret-scanning':
      return (items as GhSecret[]).map((a) => ({
        repo,
        kind,
        number: a.number,
        // A leaked secret is always urgent, and GitHub gives these no severity.
        severity: 'critical',
        title: a.secret_type_display_name ?? a.secret_type ?? 'Exposed secret',
        detail: a.secret_type ?? '',
        url: a.html_url,
        createdAt: a.created_at
      }))
  }
}

export async function listSecurity(gh: GitHub, repo: string): Promise<RepoSecurity> {
  const kinds = Object.keys(PATHS) as AlertKind[]
  const results = await Promise.allSettled(kinds.map((k) => gh.get<unknown[]>(`/repos/${repo}/${PATHS[k]}?state=open&per_page=100`)))
  const alerts: SecurityAlert[] = []
  const unavailable: RepoSecurity['unavailable'] = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') return void alerts.push(...mapAlerts(repo, kinds[i], r.value))
    const e = r.reason
    if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) unavailable[kinds[i]] = e.status === 404 ? 'Not enabled for this repository' : 'The token cannot read these alerts'
    else throw e
  })
  alerts.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return { repo, alerts, unavailable }
}
