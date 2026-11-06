import { useEffect, useState } from 'react'
import type { SearchResult } from '../../../shared/types'
import { api } from './store'

// Saved-search widgets share this cache. GitHub's search API allows only 30 requests a minute, so a search is
// run when its widget first shows and then every REFRESH_MS while it stays mounted; remounting (switching
// dashboards back and forth) within MIN_AGE_MS reuses the last answer instead of asking again.

const REFRESH_MS = 3 * 60_000
const MIN_AGE_MS = 60_000
const cache = new Map<string, { at: number; result?: SearchResult; error?: string }>()

export function useSearch(query: string, kind: 'pr' | 'issue'): { result?: SearchResult; error?: string; loading: boolean; refresh: () => void } {
  const key = `${kind}\n${query}`
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = (force: boolean) => {
    const hit = cache.get(key)
    if (!force && hit && Date.now() - hit.at < MIN_AGE_MS) return
    setLoading(true)
    api.runSearch(query, kind).then(
      (result) => void cache.set(key, { at: Date.now(), result }),
      (e: Error) => void cache.set(key, { at: Date.now(), result: cache.get(key)?.result, error: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    ).finally(() => {
      setLoading(false)
      setTick((n) => n + 1)
    })
  }

  useEffect(() => {
    load(false)
    const t = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const entry = cache.get(key)
  return { result: entry?.result, error: entry?.error, loading: loading && !entry, refresh: () => load(true) }
}
