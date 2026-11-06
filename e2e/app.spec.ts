import { expect, test } from '@playwright/test'
import { close, launch, savedSettings, type Ctx } from './launch'

// Drives the built app (out/) against the fake GitHub: every test gets a fresh profile and server, and checks
// the app never wrote to GitHub or threw an uncaught error.

/** A returning user: two watched repos, walkthrough already done. */
const WATCHING = { repos: ['acme/api', 'acme/web'], uiVersion: 1, tourDone: true }

let ctx: Ctx
test.afterEach(async ({}, info) => {
  if (!ctx) return
  if (info.status !== info.expectedStatus) await ctx.page.screenshot({ path: info.outputPath('failure.png') }).catch(() => {})
  // Browsing must never change anything on GitHub, and nothing may throw.
  expect(ctx.gh.writes(), 'requests that would change GitHub').toEqual([])
  expect(ctx.errors, 'uncaught errors in the app').toEqual([])
  await close(ctx)
})

test('without a token it asks you to sign in', async () => {
  ctx = await launch({ token: false })
  await expect(ctx.page.getByRole('heading', { name: 'Connect to GitHub' })).toBeVisible()
  await expect(ctx.page.getByPlaceholder(/ghp_|token/i).first()).toBeVisible()
})

test('a new user picks repos, then gets the walkthrough once', async () => {
  ctx = await launch({ settings: { uiVersion: 1 } })
  await expect(ctx.page.getByRole('heading', { name: 'Pick repositories to watch' })).toBeVisible()
  await ctx.page.getByPlaceholder('owner/name or GitHub URL').fill('acme/api')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()

  const tour = ctx.page.getByRole('dialog', { name: 'Pushback walkthrough' })
  await expect(tour.getByRole('heading', { name: 'Welcome to Pushback' })).toBeVisible()
  // Step through every stop; each one either spotlights something or shows a centred card.
  for (let i = 0; i < 9; i++) await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('heading', { name: "You're all set" })).toBeVisible()
  await tour.getByRole('button', { name: 'Done' }).click()
  await expect(tour).toBeHidden()
  await expect.poll(() => savedSettings(ctx).tourDone).toBe(true)

  // Restart with the same profile: no walkthrough the second time.
  await close(ctx, { keepProfile: true, keepServer: true })
  ctx = await launch({ profile: ctx.profile, gh: ctx.gh })
  await expect(ctx.page.locator('.widget').first()).toBeVisible()
  await expect(ctx.page.getByRole('dialog', { name: 'Pushback walkthrough' })).toHaveCount(0)
})

test('the dashboard shows runs, PRs and the repo sidebar', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  // Vertical tabs are the default: the sidebar lists the dashboard and the watched repos.
  await expect(page.locator('.repo-sidebar')).toBeVisible()
  await expect(page.locator('.repo-sidebar').getByText('acme/web')).toBeVisible()
  const runs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Workflow runs' }) })
  await expect(runs.getByText('Deploy', { exact: true })).toBeVisible()
  await expect(runs.getByText('Build site')).toBeVisible()
  const prs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Pull requests' }) })
  await expect(prs.getByText('Add login page')).toBeVisible()
  await expect(prs.getByText('WIP: tidy config')).toBeVisible()
  await expect(page.locator('.crumbs')).toContainText('Main')
})

test('a PR opens as a sub-page with breadcrumbs, and Esc goes back', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  const prs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Pull requests' }) })
  await prs.getByText('Add login page').click()

  await expect(page.locator('.page')).toBeVisible()
  await expect(page.locator('.dashboard')).toHaveCount(0)
  const crumbs = page.locator('.crumbs li')
  await expect(crumbs).toHaveText(['Main', 'acme/api', '#7 Add login page'].map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))))
  await expect(page.locator('.crumb-depth')).toHaveText('level 3')
  await expect(page.getByText('Looks good to me!')).toBeVisible()
  // The repo rail beside the page shows what's deployed.
  await expect(page.locator('.panel-rail')).toContainText('prod-acme')

  await page.getByRole('tab', { name: /Files/ }).click()
  await expect(page.getByText('export const login = true')).toBeVisible()

  // Clicking a crumb goes back up; Esc goes back one level.
  await page.locator('.crumbs').getByRole('button', { name: 'Main' }).click()
  await expect(page.locator('.dashboard')).toBeVisible()
  await prs.getByText('Add login page').click()
  await expect(page.locator('.page')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.dashboard')).toBeVisible()
  await expect(crumbs).toHaveCount(1)
})

test('a workflow run opens as a page and shows where it deployed', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  const runs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Workflow runs' }) })
  await runs.getByText('Deploy', { exact: true }).click()
  await expect(page.locator('.crumbs li').last()).toHaveText('Deploy #102')
  await expect(page.locator('.run-deploys')).toContainText('prod-acme')
  await expect(page.getByText('build', { exact: true })).toBeVisible()
})

test('filters narrow a widget, are saved, and clear', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  const runs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Workflow runs' }) })
  await expect(runs.locator('.row')).toHaveCount(4)
  await runs.getByRole('button', { name: 'Filters' }).click()
  await runs.locator('select.filter-select').nth(1).selectOption('workflow_dispatch')
  await expect(runs.locator('.row')).toHaveCount(1)
  await expect(runs.locator('.filter-count')).toHaveText('1')
  await expect.poll(() => savedSettings(ctx).widgets.find((w: { type: string }) => w.type === 'runs').options.event).toBe('workflow_dispatch')

  // Branch filter with suggestions from the data, combined with the repo picker.
  await runs.getByRole('button', { name: 'Clear' }).click()
  await expect(runs.locator('.row')).toHaveCount(4)
  await runs.getByRole('button', { name: 'All repos' }).click()
  await page.getByRole('checkbox', { name: 'acme/web' }).check()
  await page.keyboard.press('Escape')
  await expect(runs.locator('.row')).toHaveCount(1)
  await expect(runs.getByText('Build site')).toBeVisible()
})

test('repo tabs: sections, deployments by client, and pinning', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  await page.locator('.repo-sidebar').getByText('acme/api').click()
  await expect(page.locator('.ws-nav')).toBeVisible()
  await expect(page.getByText('Readme for the fixture repo.')).toBeVisible()
  await expect(page.locator('.crumbs li')).toHaveText(['acme/api', 'Overview'])

  await page.locator('.ws-link', { hasText: 'Deployments' }).click()
  await expect(page.locator('.crumbs li').last()).toHaveText('Deployments')
  const table = page.locator('.deploy-table')
  // Clients view by default: acme is live at v1.2.0 in prod; globex's prod deploy failed; dev is shared.
  await expect(table.locator('tr', { hasText: 'acme' })).toContainText('v1.2.0')
  await expect(table.locator('tr', { hasText: 'globex' }).locator('.state-failure')).toBeVisible()
  await expect(table.locator('tr', { hasText: 'Shared' })).toContainText('v1.2.0')
  await page.locator('.filter-bar select').first().selectOption('history')
  await expect(page.locator('.deploy-history tbody tr')).toHaveCount(3)

  // Pin the open tab from its right-click menu: it becomes a tile at the top of the sidebar.
  await page.locator('.repo-sidebar .side-row', { hasText: 'acme/api' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin tab' }).click()
  await expect(page.locator('.pinned-tile', { hasText: 'api' })).toBeVisible()
  await expect.poll(() => savedSettings(ctx).pinnedTabs).toEqual(['acme/api'])
})

test('the command palette finds repos and commands', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  await expect(page.locator('.widget').first()).toBeVisible()
  // The button opens it…
  await page.locator('.search-trigger').click()
  const input = page.getByPlaceholder(/Search/)
  await expect(input).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
  // …and so does the shortcut (Cmd+K on macOS), once the window has focus.
  await page.locator('.crumbs').click()
  await page.keyboard.press('ControlOrMeta+K')
  await input.fill('take the tour')
  await expect(page.getByText('Take the tour')).toBeVisible()
  await input.fill('acme/web')
  await page.keyboard.press('Enter')
  await expect(page.locator('.crumbs li').first()).toHaveText('acme/web')
})

test('the security widget lists alerts, notes what is switched off, and shows Dependabot PRs', async () => {
  ctx = await launch({ settings: { ...WATCHING, widgets: [{ id: 'w-sec', type: 'security', repos: [], options: { view: 'alerts', kind: '', severity: '' } }], layout: [{ i: 'w-sec', x: 0, y: 0, w: 12, h: 9 }], dashboards: [] } })
  const { page } = ctx
  const sec = page.locator('.widget', { has: page.getByRole('heading', { name: 'Security alerts' }) })
  await expect(sec.getByText('Prototype pollution in lodash')).toBeVisible()
  await expect(sec.getByText('SQL injection')).toBeVisible()
  await expect(sec.locator('.sec-summary')).toContainText('1 critical')
  await expect(sec.locator('.sec-summary')).toContainText('1 high')
  await expect(sec).toContainText('Secret scanning: Not enabled')

  await sec.getByRole('button', { name: 'Filters' }).click()
  await sec.locator('select.filter-select').nth(2).selectOption('critical')
  await expect(sec.locator('.row')).toHaveCount(1)
  await sec.locator('select.filter-select').first().selectOption('dependabot-prs')
  await expect(sec.getByText('Bump lodash from 4.17.20 to 4.17.21')).toBeVisible()
})

test('the CI health widget ranks failing, flaky and slow workflows', async () => {
  ctx = await launch({ settings: { ...WATCHING, widgets: [{ id: 'w-ci', type: 'cihealth', repos: [], options: { view: 'failing', days: 14, branch: '' } }], layout: [{ i: 'w-ci', x: 0, y: 0, w: 12, h: 9 }], dashboards: [] } })
  const { page } = ctx
  const w = page.locator('.widget', { has: page.getByRole('heading', { name: 'CI health' }) })
  // acme/api's CI passed once and failed once, both on the same commit: 50% failures, and flaky.
  await expect(w.locator('.health-tiles')).toContainText('flaky workflows')
  await expect(w.locator('tbody tr', { hasText: 'CI' })).toContainText('50%')
  await w.getByRole('button', { name: 'Filters' }).click()
  await w.locator('select.filter-select').first().selectOption('flaky')
  await expect(w.locator('tbody tr', { hasText: 'CI' })).toContainText('1')
  await w.locator('select.filter-select').first().selectOption('slowest')
  await expect(w.locator('tbody tr')).not.toHaveCount(0)
  await w.locator('select.filter-select').first().selectOption('minutes')
  await expect(w.locator('th').last()).toHaveText('Minutes (est.)')
})

test('the PR view says what blocks a merge, and shows the merge queue', async () => {
  ctx = await launch({ settings: WATCHING })
  const { page } = ctx
  const prs = page.locator('.widget', { has: page.getByRole('heading', { name: 'Pull requests' }) })
  await prs.getByText('Add login page').click()
  const status = page.getByRole('region', { name: 'Merge status' })
  await expect(status).toContainText('Merging is blocked')
  await expect(status).toContainText('1 required check failing: lint.')
  await expect(status).toContainText('1 required check not reported yet: e2e.')
  await expect(status).toContainText('An approving review is required (0 of 2 approvals).')
  await expect(status).toContainText('Required checks 1/2 passing')
  await page.keyboard.press('Escape')

  await prs.getByText('Bump lodash from 4.17.20 to 4.17.21').click()
  await expect(page.getByRole('region', { name: 'Merge status' })).toContainText('In the merge queue for main')
  await expect(page.getByRole('region', { name: 'Merge status' })).toContainText('position 2, waiting for checks')
})
