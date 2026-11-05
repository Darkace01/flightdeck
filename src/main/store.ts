import { app, safeStorage } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS } from '../shared/defaults'
import type { AppEvent, Settings } from '../shared/types'

const dir = () => app.getPath('userData')
const file = (name: string) => join(dir(), name)

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(file(name), JSON.stringify(value, null, 2))
}

export function loadSettings(): Settings {
  const saved = readJson<Partial<Settings>>('settings.json', {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    notify: { ...DEFAULT_SETTINGS.notify, ...saved.notify }
  }
}

export function saveSettings(settings: Settings): void {
  writeJson('settings.json', settings)
}

export function loadEvents(): AppEvent[] {
  return readJson<AppEvent[]>('events.json', [])
}

export function saveEvents(events: AppEvent[]): void {
  writeJson('events.json', events)
}

// A personal access token is stored encrypted with the OS keychain (DPAPI / Keychain / libsecret).
const TOKEN_FILE = 'token.bin'

export function savePat(token: string | null): void {
  if (!token) {
    rmSync(file(TOKEN_FILE), { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available to store the token')
  mkdirSync(dir(), { recursive: true })
  writeFileSync(file(TOKEN_FILE), safeStorage.encryptString(token))
}

function loadPat(): string | null {
  if (!existsSync(file(TOKEN_FILE))) return null
  try {
    return safeStorage.decryptString(readFileSync(file(TOKEN_FILE)))
  } catch {
    return null
  }
}

function ghCliToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

/** Prefer a saved PAT, fall back to the GitHub CLI's login. */
export async function resolveToken(): Promise<{ token: string; source: 'pat' | 'gh' } | null> {
  const pat = loadPat()
  if (pat) return { token: pat, source: 'pat' }
  const gh = await ghCliToken()
  return gh ? { token: gh, source: 'gh' } : null
}
