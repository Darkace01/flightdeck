import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { RepoDeckApi, Settings, Snapshot } from '../shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RepoDeckApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onSnapshot: (cb) => subscribe<Snapshot>('snapshot', cb),
  onSettings: (cb) => subscribe<Settings>('settings', cb),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  setToken: (token) => ipcRenderer.invoke('auth:set', token),
  refresh: () => ipcRenderer.invoke('poll:now'),
  listMyRepos: () => ipcRenderer.invoke('repos:mine'),
  dispatch: (repo, workflowId, ref, inputs) => ipcRenderer.invoke('wf:dispatch', repo, workflowId, ref, inputs),
  rerun: (repo, runId, failedOnly) => ipcRenderer.invoke('run:rerun', repo, runId, failedOnly),
  cancel: (repo, runId) => ipcRenderer.invoke('run:cancel', repo, runId),
  openExternal: (url) => ipcRenderer.invoke('open', url),
  markRead: (ids) => ipcRenderer.invoke('events:read', ids),
  clearEvents: () => ipcRenderer.invoke('events:clear')
}

contextBridge.exposeInMainWorld('repodeck', api)
