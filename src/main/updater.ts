import { app, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const REPO = 'Darkace01/flightdeck'
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
const CHECK_EVERY = 4 * 60 * 60 * 1000

// Squirrel.Mac only installs signed builds and .deb installs belong to the package manager,
// so those platforms just learn about a new release and link to the download.
const canInstall = process.platform === 'win32' || !!process.env.APPIMAGE

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion(), canInstall }
let onChange: (s: UpdateStatus) => void = () => {}
let notified = ''

function set(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  onChange(status)
  // One desktop notification per new version.
  if ((status.state === 'ready' || (status.state === 'available' && !canInstall)) && status.version && notified !== status.version) {
    notified = status.version
    const n = new Notification({
      title: `Flightdeck ${status.version} is available`,
      body: canInstall ? 'Restart Flightdeck to update.' : 'Click to download it from GitHub.'
    })
    n.on('click', () => (canInstall ? installUpdate() : void shell.openExternal(RELEASES_URL)))
    n.show()
  }
}

/** electron-updater errors carry whole HTTP dumps; keep one readable line. A 404 just means nothing is published yet. */
function failed(err: Error): void {
  if (/\b404\b|No published versions/.test(err.message)) return set({ state: 'none' })
  set({ state: 'error', error: err.message.split('\n')[0].slice(0, 200) })
}

export function updateStatus(): UpdateStatus {
  return status
}

/** True when `a` is a newer semver than `b` (pre-release tags are ignored). */
function newer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(Number)
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

async function checkRelease(): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Flightdeck' }
  })
  if (res.status === 404) return set({ state: 'none' }) // no releases yet
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  const release = (await res.json()) as { tag_name: string; html_url: string }
  if (newer(release.tag_name, status.current)) set({ state: 'available', version: release.tag_name.replace(/^v/, ''), url: release.html_url })
  else set({ state: 'none' })
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged || status.state === 'downloading' || status.state === 'ready') return status
  set({ state: 'checking', error: undefined })
  try {
    if (canInstall) await autoUpdater.checkForUpdates()
    else await checkRelease()
  } catch (err) {
    failed(err as Error)
  }
  return status
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}

export function initUpdater(listener: (s: UpdateStatus) => void, enabled: () => boolean): void {
  onChange = listener
  if (!app.isPackaged) return
  autoUpdater.autoDownload = canInstall
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }))
  autoUpdater.on('error', failed)

  const tick = () => {
    if (enabled()) void checkForUpdates()
  }
  setTimeout(tick, 10_000) // let the dashboard load first
  setInterval(tick, CHECK_EVERY)
}
