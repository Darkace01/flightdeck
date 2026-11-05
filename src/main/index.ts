import { app, BrowserWindow, ipcMain, Menu, nativeTheme, Notification, shell, Tray } from 'electron'
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ActionResult, AppEvent, EventKind, Job, NotifySettings, RepoOption, Settings } from '../shared/types'
import { fetchPrDetail, fetchRepoInfo } from './details'
import { GitHub } from './github'
import { Poller } from './poller'
import { findTheme } from '../shared/themes'
import { loadEvents, loadSettings, normalizeSettings, resolveToken, saveEvents, savePat, saveSettings } from './store'
import { appIcon } from './icon'
import { checkForUpdates, initUpdater, installUpdate, RELEASES_URL, updateStatus } from './updater'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let settings: Settings

const poller = new Poller(() => settings, [])

const NOTIFY_KEY: Record<EventKind, keyof NotifySettings> = {
  'run-started': 'runStarted',
  'run-success': 'runSuccess',
  'run-failure': 'runFailure',
  'run-cancelled': 'runFailure',
  'pr-opened': 'prOpened',
  'pr-merged': 'prClosed',
  'pr-closed': 'prClosed',
  'pr-ready': 'prReady',
  'pr-review': 'reviewRequested',
  'pr-checks-failed': 'checksFailed'
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function notify(events: AppEvent[]): void {
  if (!Notification.isSupported()) return
  const viewer = poller.snapshot.viewer?.login
  const wanted = events.filter((e) => {
    if (!settings.notify[NOTIFY_KEY[e.kind]]) return false
    // Review requests are always about you, so "only mine" never hides them.
    return !settings.notify.onlyMine || e.kind === 'pr-review' || !viewer || e.actor === viewer
  })
  // Collapse bursts (e.g. a matrix finishing) into one toast.
  if (wanted.length > 3) {
    const n = new Notification({ title: `Flightdeck · ${wanted.length} updates`, body: wanted.slice(0, 4).map((e) => e.title).join('\n') })
    n.on('click', showWindow)
    n.show()
    return
  }
  // Clicking a toast opens the run or PR inside Flightdeck, not the browser.
  for (const e of wanted) {
    const n = new Notification({ title: e.title, body: e.body, silent: e.kind === 'run-started' })
    n.on('click', () => {
      showWindow()
      send('navigate', e.url)
    })
    n.show()
  }
}

function updateTray(): void {
  if (!tray) return
  const unread = poller.snapshot.events.filter((e) => !e.read).length
  const running = Object.values(poller.snapshot.repos).reduce((n, r) => n + r.runs.filter((x) => x.status !== 'completed').length, 0)
  tray.setToolTip(`Flightdeck — ${running} running, ${unread} unread`)
  if (process.platform === 'darwin') tray.setTitle(unread ? String(unread) : '')
  if (process.platform !== 'win32') app.setBadgeCount(unread)
}

poller.on('update', (snapshot) => {
  send('snapshot', snapshot)
  updateTray()
})
poller.on('events', (events) => {
  saveEvents(poller.snapshot.events)
  notify(events)
})

async function connect(): Promise<void> {
  const auth = await resolveToken()
  poller.setClient(auth ? new GitHub(auth.token) : undefined, auth?.source)
  poller.pollSoon()
}

function showWindow(): void {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Paint the window in the theme's background before the page loads, so there's no white flash. */
function windowBackground(): string {
  const light = settings.mode === 'light' || (settings.mode === 'system' && !nativeTheme.shouldUseDarkColors)
  const mode = light ? 'light' : 'dark'
  return settings.colorOverrides[mode].bg ?? findTheme(light ? settings.lightTheme : settings.darkTheme, mode).colors.bg
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    title: 'Flightdeck',
    icon: appIcon(64),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (settings.closeToTray && !quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => (win = null))
  // Never navigate the app window; open links in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  tray = new Tray(appIcon(16))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Flightdeck', click: showWindow },
      { label: 'Refresh now', click: () => poller.pollSoon() },
      {
        label: 'Check for updates',
        click: () =>
          void checkForUpdates().then((s) => {
            if (s.state === 'available' && !s.canInstall) void shell.openExternal(s.url ?? RELEASES_URL)
          })
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
  updateTray()
}

async function run(action: () => Promise<unknown>, boost = true): Promise<ActionResult> {
  try {
    await action()
    poller.pollSoon(boost)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function requireClient(): GitHub {
  if (!poller.client) throw new Error('Not signed in to GitHub')
  return poller.client
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => ({ snapshot: poller.snapshot, settings }))
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const reposChanged = patch.repos && patch.repos.join() !== settings.repos.join()
    const intervalChanged = patch.pollSeconds !== undefined || patch.activePollSeconds !== undefined
    settings = { ...settings, ...patch, notify: { ...settings.notify, ...patch.notify } }
    saveSettings(settings)
    if (patch.mode || patch.darkTheme || patch.lightTheme || patch.colorOverrides) win?.setBackgroundColor(windowBackground())
    if (reposChanged || intervalChanged) poller.pollSoon()
    return settings
  })
  ipcMain.handle('auth:set', async (_e, token: string | null): Promise<ActionResult> => {
    try {
      if (token) {
        const gh = new GitHub(token.trim())
        await gh.get('/user') // validate before saving
      }
      savePat(token?.trim() || null)
      await connect()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('poll:now', () => poller.pollSoon())
  ipcMain.handle('repos:mine', async (): Promise<RepoOption[]> => {
    const gh = requireClient()
    const repos = await gh.get<{ full_name: string; description: string | null; private: boolean; pushed_at: string }[]>(
      '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member'
    )
    return repos.map((r) => ({ fullName: r.full_name, description: r.description, private: r.private, pushedAt: r.pushed_at }))
  })
  ipcMain.handle('wf:dispatch', (_e, repo: string, id: number, ref: string, inputs: Record<string, string>) =>
    run(() => requireClient().send('POST', `/repos/${repo}/actions/workflows/${id}/dispatches`, { ref, inputs }))
  )
  ipcMain.handle('run:rerun', (_e, repo: string, id: number, failedOnly: boolean) =>
    run(() => requireClient().send('POST', `/repos/${repo}/actions/runs/${id}/${failedOnly ? 'rerun-failed-jobs' : 'rerun'}`))
  )
  ipcMain.handle('run:cancel', (_e, repo: string, id: number) =>
    run(() => requireClient().send('POST', `/repos/${repo}/actions/runs/${id}/cancel`))
  )
  ipcMain.handle('run:jobs', async (_e, repo: string, id: number): Promise<Job[]> => {
    const data = await requireClient().get<{ jobs: GhJob[] }>(`/repos/${repo}/actions/runs/${id}/jobs?per_page=100`)
    return data.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      url: j.html_url,
      steps: (j.steps ?? []).map((s) => ({
        name: s.name,
        status: s.status,
        conclusion: s.conclusion,
        number: s.number,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null
      }))
    }))
  })
  ipcMain.handle('job:log', async (_e, repo: string, jobId: number): Promise<string> => {
    const log = await requireClient().text(`/repos/${repo}/actions/jobs/${jobId}/logs`)
    // Keep the tail: that's where failures are, and full logs can be many MB.
    return log.split(/\r?\n/).slice(-400).join('\n')
  })
  ipcMain.handle('pr:approve', (_e, repo: string, num: number) =>
    run(() => requireClient().send('POST', `/repos/${repo}/pulls/${num}/reviews`, { event: 'APPROVE' }), false)
  )
  ipcMain.handle('pr:merge', (_e, repo: string, num: number, method: 'merge' | 'squash' | 'rebase') =>
    run(() => requireClient().send('PUT', `/repos/${repo}/pulls/${num}/merge`, { merge_method: method }), false)
  )
  ipcMain.handle('settings:export', () => JSON.stringify(settings, null, 2))
  ipcMain.handle('settings:import', (_e, json: string): ActionResult => {
    try {
      const parsed = JSON.parse(json) as Partial<Settings>
      if (typeof parsed !== 'object' || !parsed || !Array.isArray(parsed.repos)) throw new Error('Not a Flightdeck settings file')
      settings = normalizeSettings(parsed)
      saveSettings(settings)
      send('settings', settings)
      poller.pollSoon()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('open', (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('events:read', (_e, ids?: string[]) => {
    const set = ids ? new Set(ids) : null
    poller.snapshot.events = poller.snapshot.events.map((e) => (!set || set.has(e.id) ? { ...e, read: true } : e))
    saveEvents(poller.snapshot.events)
    send('snapshot', poller.snapshot)
    updateTray()
  })
  ipcMain.handle('events:clear', () => {
    poller.snapshot.events = []
    saveEvents([])
    send('snapshot', poller.snapshot)
    updateTray()
  })
  ipcMain.handle('pr:detail', (_e, repo: string, num: number) => fetchPrDetail(requireClient(), repo, num))
  ipcMain.handle('pr:comment', (_e, repo: string, num: number, body: string) =>
    run(() => requireClient().send('POST', `/repos/${repo}/issues/${num}/comments`, { body }), false)
  )
  ipcMain.handle('repo:info', (_e, repo: string) => fetchRepoInfo(requireClient(), repo))
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => {
    quitting = true
    installUpdate()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  // Windows only shows toasts for an AppUserModelID that has a Start-menu shortcut. The installer
  // registers our appId; an unpackaged dev build has no shortcut, so use Electron's own exe path there.
  app.setAppUserModelId(app.isPackaged ? 'dev.flightdeck.app' : process.execPath)
  migrateUserData()

  app.whenReady().then(() => {
    settings = loadSettings()
    poller.snapshot.events = loadEvents()
    registerIpc()
    createWindow()
    createTray()
    void connect()
    initUpdater(
      (s) => send('update', s),
      () => settings.autoUpdate
    )
    app.on('activate', showWindow)
  })

  app.on('before-quit', () => {
    quitting = true
    poller.stop()
  })
  app.on('window-all-closed', () => {
    if (!settings.closeToTray) app.quit()
  })
}

/** The app was called RepoDeck before 0.2; carry its settings, history and token over once. */
function migrateUserData(): void {
  const dir = app.getPath('userData')
  if (existsSync(join(dir, 'settings.json'))) return
  const old = ['RepoDeck', 'repodeck'].map((name) => join(dirname(dir), name)).find((d) => existsSync(join(d, 'settings.json')))
  if (!old) return
  for (const name of ['settings.json', 'events.json', 'token.bin']) if (existsSync(join(old, name))) cpSync(join(old, name), join(dir, name))
}

interface GhJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  html_url: string
  steps?: { name: string; status: string; conclusion: string | null; number: number; started_at?: string; completed_at?: string }[]
}
