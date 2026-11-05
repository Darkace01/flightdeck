import { getSettings, updateSettings } from './store'
import { openModal } from './ui'

export const HOME = 'home'

/** Opens (or focuses) a repo's tab. Any open view closes, since the tab replaces what's on screen. */
export function openRepoTab(repo: string): void {
  const s = getSettings()
  openModal(null)
  void updateSettings({ openTabs: s.openTabs.includes(repo) ? s.openTabs : [...s.openTabs, repo], activeTab: repo })
}

export function selectTab(id: string): void {
  if (getSettings().activeTab !== id) void updateSettings({ activeTab: id })
}

export function closeTab(repo: string): void {
  const s = getSettings()
  const i = s.openTabs.indexOf(repo)
  const openTabs = s.openTabs.filter((t) => t !== repo)
  // Closing the active tab moves to the tab that slides into its place, else the one to its left, else the dashboard.
  const activeTab = s.activeTab === repo ? (openTabs[i] ?? openTabs[i - 1] ?? HOME) : s.activeTab
  void updateSettings({ openTabs, activeTab })
}

/** Ctrl+Tab / Ctrl+Shift+Tab through the dashboard and repo tabs. */
export function cycleTab(by: 1 | -1): void {
  const s = getSettings()
  const all = [HOME, ...s.openTabs]
  selectTab(all[(all.indexOf(s.activeTab) + by + all.length) % all.length])
}

export function moveTab(repo: string, to: number): void {
  const tabs = getSettings().openTabs.filter((t) => t !== repo)
  tabs.splice(to, 0, repo)
  void updateSettings({ openTabs: tabs })
}
