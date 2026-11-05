import { useEffect, useState, useSyncExternalStore } from 'react'

// Per-repo data versions: creating or changing something (an issue, branch, release) bumps the
// repo's version, and every section showing that repo reloads.
const versions = new Map<string, number>()
const listeners = new Set<() => void>()

export function invalidate(repo: string): void {
  versions.set(repo, (versions.get(repo) ?? 0) + 1)
  listeners.forEach((l) => l())
}

function useRepoVersion(repo: string): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => versions.get(repo) ?? 0
  )
}

/** Loads on-demand data for a repo view, reloading when `deps` change or the repo is invalidated. */
export function useLoad<T>(repo: string, load: () => Promise<T>, deps: unknown[]) {
  const version = useRepoVersion(repo)
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (e: Error) => alive && setState({ error: e.message, loading: false })
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, ...deps])
  return { ...state, reload: () => invalidate(repo) }
}
