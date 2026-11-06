import { expect, test } from '@playwright/test'
import { close, launch } from './launch'

// Many dashboards with long names used to push the tabs under the search box in a narrow window.
const dash = (i: number) => ({ id: `d${i}`, name: `Dashboard number ${i}`, widgets: [], layout: [] })

test('dashboard tabs never overlap the search box or status, even in a narrow window', async () => {
  const dashboards = [1, 2, 3, 4, 5, 6, 7].map(dash)
  const ctx = await launch({ settings: { repos: ['acme/api'], uiVersion: 1, tourDone: true, dashboards, activeDashboard: 'd1' } })
  for (const width of [1400, 1100, 900, 760, 720]) {
    await ctx.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 800), width)
    await ctx.page.waitForTimeout(300)
    const tabs = await ctx.page.locator('.dash-tabs').boundingBox()
    const search = await ctx.page.locator('.search-trigger').boundingBox()
    const status = await ctx.page.locator('.topbar-status').boundingBox()
    expect(tabs!.x + tabs!.width, `tabs end before search at ${width}`).toBeLessThanOrEqual(search!.x + 0.5)
    expect(search!.x + search!.width, `search ends before status at ${width}`).toBeLessThanOrEqual(status!.x + 0.5)
  }
  await close(ctx)
})
