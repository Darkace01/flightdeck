import { expect, test } from '@playwright/test'
import { close, launch, savedSettings, type Ctx } from './launch'

// Tray, release helper, shareable dashboards and saved searches. Same rules as app.spec.ts: a fresh profile and
// fake GitHub per test, no uncaught errors, and no writes to GitHub except the ones a test expects and removes.

const WATCHING = { repos: ['acme/api', 'acme/web'], uiVersion: 1, tourDone: true }

let ctx: Ctx
test.afterEach(async ({}, info) => {
  if (!ctx) return
  if (info.status !== info.expectedStatus) await ctx.page.screenshot({ path: info.outputPath('failure.png') }).catch(() => {})
  expect(ctx.gh.writes(), 'requests that would change GitHub').toEqual([])
  expect(ctx.errors, 'uncaught errors in the app').toEqual([])
  await close(ctx)
})

test('settings: launch at login and start in the tray are saved', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  await page.getByTitle(/Settings/).click()
  await page.getByRole('tab', { name: 'Advanced' }).click()
  const login = page.getByLabel('Start Pushback when I sign in to my computer')
  await expect(login).not.toBeChecked()
  await expect(page.getByLabel('Start in the tray without opening the window')).toHaveCount(0)
  await login.check()
  await expect(page.getByLabel('Start in the tray without opening the window')).toBeChecked()
  await expect.poll(() => savedSettings(ctx).launchAtLogin).toBe(true)
})

test('a release can be drafted from merged PRs, edited, and saved as a draft', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  await page.locator('.repo-sidebar').getByText('acme/api').click()
  await page.locator('.ws-link', { hasText: 'Releases' }).click()
  await page.getByRole('button', { name: 'New release' }).click()
  const dialog = page.getByRole('dialog')
  // Starts as a draft, never as a publish.
  await expect(dialog.getByLabel(/Save as a draft/)).toBeChecked()
  await dialog.getByRole('button', { name: /Draft from merged PRs/ }).click()
  const notes = dialog.locator('textarea')
  await expect(notes).toHaveValue(/## Features[\s\S]*tray badge[\s\S]*## Fixes[\s\S]*Fix the login crash/)
  // Only PRs merged after v1.2.0 and actually merged.
  await expect(notes).not.toHaveValue(/Old change|Closed without/)
  await notes.fill((await notes.inputValue()) + '\n\nEdited by hand.')
  await dialog.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(() => ctx.gh.bodies.length).toBe(1)
  const { body } = ctx.gh.bodies[0] as { body: { draft: boolean; body: string; tag_name: string } }
  expect(body.draft).toBe(true)
  expect(body.body).toContain('Edited by hand.')
  expect(body.body).toContain('Fix the login crash')
  expect(body.tag_name).toBe('v1.2.1')
  // The one expected write: creating the draft. Nothing else may have changed GitHub.
  const writes = ctx.gh.writes()
  expect(writes).toEqual([{ method: 'POST', path: '/repos/acme/api/releases' }])
  ctx.gh.requests.splice(0, ctx.gh.requests.length, ...ctx.gh.requests.filter((r) => !writes.includes(r)))
})
