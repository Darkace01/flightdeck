import { expect, test } from '@playwright/test'
import { DISPATCHED_RUN_ID } from './fake-github'
import { close, launch, type Ctx } from './launch'

const WATCHING = { repos: ['acme/api', 'acme/web'], uiVersion: 1, tourDone: true }

let ctx: Ctx
test.afterEach(async () => {
  if (ctx) {
    expect(ctx.errors, 'uncaught errors in the app').toEqual([])
    await close(ctx)
  }
})

test('running a workflow takes you to the run it started', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page, gh } = ctx
  const workflows = page.locator('.widget', { has: page.getByRole('heading', { name: 'Run a workflow' }) })
  await workflows.locator('li', { hasText: 'Deploy' }).getByRole('button', { name: /Run/ }).click()
  await page.getByRole('button', { name: /Run workflow/ }).click()

  // The dialog gives way to the new run's page, not back to the dashboard.
  await expect(page.locator('.page')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.dashboard')).toHaveCount(0)
  await expect(page.locator('.crumbs li').last()).toContainText('Deploy')
  await expect(page.getByText(`#${DISPATCHED_RUN_ID}`).first()).toBeVisible()

  // The only write was the dispatch itself, and it used the workflow's default input.
  const writes = gh.writes()
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('/repos/acme/api/actions/workflows/2/dispatches')
  expect(JSON.parse(writes[0].body ?? '{}')).toEqual({ ref: 'main', inputs: { environment: 'dev' } })

  // Esc goes back to the dashboard, like any other view.
  await page.keyboard.press('Escape')
  await expect(page.locator('.dashboard')).toBeVisible()
})
