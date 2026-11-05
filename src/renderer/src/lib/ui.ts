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
  | null

let modal: ModalState = null
let editing = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const openModal = (m: ModalState) => {
  modal = m
  emit()
}
export const closeModal = () => openModal(null)
export const useModal = () => useSyncExternalStore(subscribe, () => modal)

export const setEditing = (v: boolean) => {
  editing = v
  emit()
}
export const useEditing = () => useSyncExternalStore(subscribe, () => editing)
