import { useEffect, useState, useSyncExternalStore } from 'react'

// A shared per-repo cache for data that isn't part of the regular poll: views that show it load it on first use
// and refresh it every `ttl` ms while open. Same idea as lib/deployments.ts, for any loader.

interface Entry<T> {
  at: number
  data?: T
  error?: string
  loading?: Promise<void>
}

export function repoCache<T>(fetcher: (repo: string) => Promise<T>, ttl: number) {
  const cache = new Map<string, Entry<T>>()
  const listeners = new Set<() => void>()
  let version = 0
  const emit = () => {
    version++
    listeners.forEach((l) => l())
  }

  function load(repo: string, force = false): Promise<void> {
    const entry = cache.get(repo)
    if (entry?.loading) return entry.loading
    if (!force && entry && Date.now() - entry.at < ttl) return Promise.resolve()
    const loading = fetcher(repo).then(
      (data) => void cache.set(repo, { at: Date.now(), data }),
      (e: Error) => void cache.set(repo, { at: Date.now(), data: entry?.data, error: e.message })
    )
    cache.set(repo, { ...(entry ?? { at: 0 }), loading })
    return loading.finally(emit)
  }

  function useRepos(repos: string[]) {
    useSyncExternalStore(
      (l) => {
        listeners.add(l)
        return () => listeners.delete(l)
      },
      () => version
    )
    const key = repos.join()
    const [, setTick] = useState(0)
    useEffect(() => {
      repos.forEach((r) => void load(r))
      const t = setInterval(() => (repos.forEach((r) => void load(r)), setTick((n) => n + 1)), ttl)
      return () => clearInterval(t)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    const entries = repos.map((r) => cache.get(r))
    return {
      data: entries.flatMap((e) => (e?.data ? [e.data] : [])),
      loading: entries.some((e) => !e?.data && !e?.error),
      errors: entries.flatMap((e, i) => (e?.error ? [`${repos[i]}: ${e.error}`] : [])),
      refresh: () => repos.forEach((r) => void load(r, true))
    }
  }

  return { useRepos, load }
}
