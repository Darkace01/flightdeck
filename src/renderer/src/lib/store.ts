import { useSyncExternalStore } from 'react'
import type { Settings, Snapshot, UpdateStatus } from '../../../shared/types'

export const api = window.pushback

let snapshot: Snapshot
let settings: Settings
let update: UpdateStatus
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function initStore(): Promise<void> {
  const state = await api.getState()
  snapshot = state.snapshot
  settings = state.settings
  update = await api.updateStatus()
  api.onUpdate((u) => {
    update = u
    emit()
  })
  api.onSettings((s) => {
    settings = s
    emit()
  })
  api.onSnapshot((s) => {
    snapshot = s
    emit()
  })
}

export const useSnapshot = () => useSyncExternalStore(subscribe, () => snapshot)
export const useSettings = () => useSyncExternalStore(subscribe, () => settings)
export const getSettings = () => settings
export const getSnapshot = () => snapshot
export const useUpdate = () => useSyncExternalStore(subscribe, () => update)

/** Optimistically applies a settings patch, then persists it in the main process. */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch, notify: { ...settings.notify, ...patch.notify } }
  emit()
  settings = await api.saveSettings(patch)
  emit()
}

/** Repos a widget should show: its own selection, or every tracked repo. */
export function widgetRepos(selected: string[], all: string[]): string[] {
  return selected.length ? selected.filter((r) => all.includes(r)) : all
}

// --- toasts -----------------------------------------------------------------

export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error' | 'info'
}
let toasts: Toast[] = []
let toastSeq = 0
const toastListeners = new Set<() => void>()
export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const t = { id: toastSeq++, text, tone }
  toasts = [...toasts, t]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((x) => x !== t)
    toastListeners.forEach((l) => l())
  }, tone === 'error' ? 7000 : 3500)
}
export const useToasts = () =>
  useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toasts
  )
