import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Account } from '../shared/types'
import { GitHub } from './github'

// Tokens of the extra accounts (GitHub Enterprise Server and other github.com logins). They live only in the main
// process: one file, encrypted with the OS keychain as a whole, read here and handed to a GitHub client. Settings
// carry the account list (name, host) but never a token, and no IPC call returns one.

const FILE = 'accounts.bin'
const path = () => join(app.getPath('userData'), FILE)

// End-to-end tests run on machines (CI under xvfb) with no OS keychain, against a fake API, so they store the
// file unencrypted. That path is only taken when PUSHBACK_API_URL points the app at the fake.
const TEST_MODE = !!process.env.PUSHBACK_API_URL

function read(): Record<string, string> {
  if (!existsSync(path())) return {}
  try {
    const raw = readFileSync(path())
    const json = TEST_MODE ? raw.toString('utf8') : safeStorage.decryptString(raw)
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

function write(tokens: Record<string, string>): void {
  const json = JSON.stringify(tokens)
  if (!TEST_MODE && !safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available to store the token')
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path(), TEST_MODE ? json : safeStorage.encryptString(json))
}

export function saveAccountToken(id: string, token: string | null): void {
  const tokens = read()
  if (token) tokens[id] = token
  else delete tokens[id]
  write(tokens)
}

export const hasAccountToken = (id: string): boolean => !!read()[id]

/** One GitHub client per extra account, so each keeps its own ETag cache and rate-limit reading. */
export class AccountClients {
  private clients = new Map<string, GitHub>()

  get(account: Account): GitHub | undefined {
    const cached = this.clients.get(account.id)
    if (cached) return cached
    const token = read()[account.id]
    if (!token) return undefined
    const client = new GitHub(token, account.apiUrl)
    this.clients.set(account.id, client)
    return client
  }

  /** Create a client for a token that has not been saved yet (to check it before saving). */
  static probe(token: string, apiUrl: string): GitHub {
    return new GitHub(token, apiUrl)
  }

  forget(id: string): void {
    this.clients.delete(id)
  }
}
