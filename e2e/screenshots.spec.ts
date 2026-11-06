import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cleanup, makeRepo, tempDir } from '../tests/integration/helpers'
import { close, launch, type Ctx } from './launch'

// Screenshots for the website (site/img), taken from the real app against the fake GitHub's "rich" data set,
// so they never show anyone's real repos. Run with: npm run screenshots

test.skip(!process.env.SCREENSHOTS, 'Only runs for npm run screenshots')

const OUT = resolve(__dirname, '..', 'site', 'img')
mkdirSync(OUT, { recursive: true })

const REPOS = ['acme/api', 'acme/web', 'acme/mobile', 'acme/infra']
const base = { repos: REPOS, pinnedTabs: ['acme/api', 'acme/web'], openTabs: ['acme/mobile'], uiVersion: 1, tourDone: true, pollSeconds: 600 }

async function open(settings: object): Promise<Ctx> {
  const ctx = await launch({ settings: { ...base, ...settings }, rich: true })
  await ctx.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.center()
  })
  await ctx.page.locator('.widget, .onboarding, .ws-nav').first().waitFor()
  // Let the first poll land and the skeletons give way to data.
  await ctx.page.waitForTimeout(2500)
  return ctx
}

const shot = (ctx: Ctx, name: string) => ctx.page.screenshot({ path: join(OUT, `${name}.png`) })

test('dashboard, PR page and filters (dark)', async () => {
  const ctx = await open({})
  await shot(ctx, 'dashboard')
  const runs = ctx.page.locator('.widget', { has: ctx.page.getByRole('heading', { name: 'Workflow runs' }) })
  await runs.getByRole('button', { name: 'Filters' }).click()
  await runs.locator('select.filter-select').nth(1).selectOption('workflow_dispatch')
  await ctx.page.waitForTimeout(400)
  await shot(ctx, 'filters')
  await runs.getByRole('button', { name: 'Clear' }).click()
  await ctx.page.locator('.widget', { has: ctx.page.getByRole('heading', { name: 'Pull requests' }) }).getByText('Add login page').click()
  await ctx.page.getByText('Looks good to me!').waitFor()
  await ctx.page.waitForTimeout(800)
  await shot(ctx, 'pr-page')
  await close(ctx)
})

test('deployments by client', async () => {
  const ctx = await open({ activeTab: 'acme/web' })
  await ctx.page.locator('.ws-link', { hasText: 'Deployments' }).click()
  await ctx.page.locator('.deploy-table').waitFor()
  await ctx.page.waitForTimeout(800)
  await shot(ctx, 'deployments')
  await close(ctx)
})

test('commit graph', async () => {
  const root = tempDir()
  const repo = makeRepo(root)
  const ctx = await open({ activeTab: 'acme/api', localPaths: { 'acme/api': repo.dir } })
  await ctx.page.locator('.ws-link', { hasText: 'Commit graph' }).click()
  await ctx.page.locator('.graph-row').first().waitFor()
  await ctx.page.locator('.graph-row', { hasText: 'Merge feature' }).click()
  await ctx.page.waitForTimeout(800)
  await shot(ctx, 'commit-graph')
  await close(ctx)
  cleanup(root)
})

test('light theme and the walkthrough', async () => {
  const light = await open({ mode: 'light' })
  await shot(light, 'dashboard-light')
  await close(light)
  const tour = await open({ tourDone: false })
  await tour.page.getByRole('button', { name: 'Next' }).click()
  await tour.page.waitForTimeout(500)
  await shot(tour, 'walkthrough')
  await close(tour)
})
