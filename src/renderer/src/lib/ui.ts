import { useSyncExternalStore } from 'react'
import type { PullRequest, Workflow, WorkflowRun } from '../../../shared/types'

export type ModalState =
  | { kind: 'settings' }
  | { kind: 'palette' }
  | { kind: 'widget'; id: string }
  | { kind: 'add-widget' }
  | { kind: 'dispatch'; workflow: Workflow }
  | { kind: 'run'; run: WorkflowRun }
  | { kind: 'merge'; pr: Pick<PullRequest, 'repo' | 'number' | 'title' | 'url'> }
  | { kind: 'pr'; repo: string; number: number }
  | { kind: 'repo'; repo: string }
  | { kind: 'new-dashboard' }
  | { kind: 'dashboards' }
  | null

let modal: ModalState = null
// Modals opened from inside another modal (a PR from the repo view, merge from the PR view) stack,
// so closing one goes back to where you came from.
let stack: ModalState[] = []
let editing = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const openModal = (m: ModalState) => {
  stack = []
  modal = m
  emit()
}
/** Opens `m` on top of the current modal; closing it returns to the one underneath. */
export const pushModal = (m: ModalState) => {
  if (modal) stack.push(modal)
  modal = m
  emit()
}
export const closeModal = () => {
  modal = stack.pop() ?? null
  emit()
}
export const useModal = () => useSyncExternalStore(subscribe, () => modal)

export const setEditing = (v: boolean) => {
  editing = v
  emit()
}
export const useEditing = () => useSyncExternalStore(subscribe, () => editing)
