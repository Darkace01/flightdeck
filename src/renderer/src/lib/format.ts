import { useEffect, useState } from 'react'

/** Re-renders the caller every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function timeAgo(iso: string | number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export function duration(fromIso: string, toIso: string | number): string {
  const s = Math.max(0, Math.round(((typeof toIso === 'number' ? toIso : Date.parse(toIso)) - Date.parse(fromIso)) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo
}

/** True when every whitespace-separated term appears in the haystack (case-insensitive). */
export function matches(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => h.includes(t))
}
