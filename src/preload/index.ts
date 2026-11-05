import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { PushbackApi, Settings, Snapshot, UpdateStatus } from '../shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PushbackApi = {
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
  runJobs: (repo, runId) => ipcRenderer.invoke('run:jobs', repo, runId),
  jobLog: (repo, jobId) => ipcRenderer.invoke('job:log', repo, jobId),
  approvePr: (repo, num) => ipcRenderer.invoke('pr:approve', repo, num),
  mergePr: (repo, num, method) => ipcRenderer.invoke('pr:merge', repo, num, method),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: (json) => ipcRenderer.invoke('settings:import', json),
  openExternal: (url) => ipcRenderer.invoke('open', url),
  markRead: (ids) => ipcRenderer.invoke('events:read', ids),
  clearEvents: () => ipcRenderer.invoke('events:clear'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdate: (cb) => subscribe<UpdateStatus>('update', cb),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  prDetail: (repo, num) => ipcRenderer.invoke('pr:detail', repo, num),
  commentPr: (repo, num, body) => ipcRenderer.invoke('pr:comment', repo, num, body),
  repoInfo: (repo) => ipcRenderer.invoke('repo:info', repo),
  onNavigate: (cb) => subscribe<string>('navigate', cb)
}

contextBridge.exposeInMainWorld('pushback', api)
