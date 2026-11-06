import { useEffect, useState, useSyncExternalStore } from 'react'
import { groupRepoErrors } from '../../../shared/deploy'
import type { RepoDeployments } from '../../../shared/types'
import { api } from './store'

// Deployments aren't part of the regular poll (one GraphQL query per repo is too much every 15 seconds), so
// views that show them share this cache and refresh it every REFRESH_MS while they're open. Each refresh costs a
// GraphQL query per repo, from the same hourly budget the poller's PR queries use, and deployments change rarely.

const REFRESH_MS = 180_000
const cache = new Map<string, { at: number; data?: RepoDeployments; error?: string; loading?: Promise<void> }>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

/** Electron wraps errors from the main process as "Error invoking remote method 'x': Error: reason"; keep the reason. */
const ipcMessage = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')

function load(repo: string, force = false): Promise<void> {
  const entry = cache.get(repo)
  if (entry?.loading) return entry.loading
  if (!force && entry && Date.now() - entry.at < REFRESH_MS) return Promise.resolve()
  const loading = api.listDeployments(repo).then(
    (data) => void cache.set(repo, { at: Date.now(), data }),
    (e: Error) => void cache.set(repo, { at: Date.now(), data: entry?.data, error: ipcMessage(e) })
  )
  cache.set(repo, { ...(entry ?? { at: 0 }), loading })
  return loading.finally(emit)
}

/** Deployments for these repos, loaded on first use and refreshed while mounted. */
export function useDeployments(repos: string[]): { data: RepoDeployments[]; loading: boolean; errors: string[]; refresh: () => void } {
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
    const t = setInterval(() => (repos.forEach((r) => void load(r)), setTick((n) => n + 1)), REFRESH_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const entries = repos.map((r) => cache.get(r))
  return {
    data: entries.flatMap((e) => (e?.data ? [e.data] : [])),
    loading: entries.some((e) => !e?.data && !e?.error),
    errors: groupRepoErrors(entries.flatMap((e, i) => (e?.error ? [{ repo: repos[i], error: e.error }] : []))),
    refresh: () => repos.forEach((r) => void load(r, true))
  }
}

/** Deployments already loaded for a repo, without fetching (for decorating run lists cheaply). */
export function peekDeployments(repo: string): RepoDeployments | undefined {
  return cache.get(repo)?.data
}
