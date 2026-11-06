import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startFakeGitHub, type FakeGitHub } from './fake-github'

// Launching the built app (out/) against the fake GitHub with a throwaway profile. Shared by the end-to-end
// tests and the website screenshot script.

const MAIN = resolve(__dirname, '..', 'out', 'main', 'index.js')

export interface Ctx {
  app: ElectronApplication
  page: Page
  gh: FakeGitHub
  profile: string
  errors: string[]
}

export async function launch(opts: { token?: boolean; settings?: object; profile?: string; gh?: FakeGitHub; rich?: boolean } = {}): Promise<Ctx> {
  const gh = opts.gh ?? (await startFakeGitHub({ rich: opts.rich }))
  const profile = opts.profile ?? mkdtempSync(join(tmpdir(), 'pushback-e2e-'))
  if (opts.settings) writeFileSync(join(profile, 'settings.json'), JSON.stringify(opts.settings))
  const app = await electron.launch({
    args: [MAIN, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: {
      ...process.env,
      PUSHBACK_API_URL: gh.url,
      PUSHBACK_USER_DATA: profile,
      ...(opts.token === false ? { PUSHBACK_TOKEN: '' } : { PUSHBACK_TOKEN: 'test-token' })
    }
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errors.push(m.text()))
  return { app, page, gh, profile, errors }
}

export async function close(ctx: Ctx, opts: { keepProfile?: boolean; keepServer?: boolean } = {}) {
  await ctx.app.close()
  if (!opts.keepServer) await ctx.gh.close()
  if (!opts.keepProfile) rmSync(ctx.profile, { recursive: true, force: true })
}

export const savedSettings = (ctx: Ctx) => JSON.parse(readFileSync(join(ctx.profile, 'settings.json'), 'utf8'))
