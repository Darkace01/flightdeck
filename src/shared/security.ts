import type { AlertSeverity, SecurityAlert } from './types'

export const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'high', 'medium', 'low']

/** Dependabot's PR author: "dependabot" in GraphQL, "dependabot[bot]" or "app/dependabot" elsewhere. */
export const isDependabot = (author: string): boolean => /^(app\/)?dependabot(\[bot\])?$/i.test(author)

/** Alerts narrowed by kind and/or severity ('' means any), most severe first. */
export function filterAlerts(alerts: SecurityAlert[], kind: string, severity: string): SecurityAlert[] {
  return alerts
    .filter((a) => (!kind || a.kind === kind) && (!severity || a.severity === severity))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function countBySeverity(alerts: SecurityAlert[]): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const a of alerts) counts[a.severity]++
  return counts
}
