import { useSyncExternalStore } from 'react'
import { getSettings, updateSettings } from './store'
import { openModal } from './ui'

export const HOME = 'home'

/** Every tab in order: the dashboard, pinned repos, then open repos. */
export const allTabs = () => {
  const s = getSettings()
  return [HOME, ...s.pinnedTabs, ...s.openTabs]
}

/** Opens (or focuses) a repo's tab. Any open view closes, since the tab replaces what's on screen. */
export function openRepoTab(repo: string): void {
  const s = getSettings()
  openModal(null)
  const has = s.openTabs.includes(repo) || s.pinnedTabs.includes(repo)
  void updateSettings({ openTabs: has ? s.openTabs : [...s.openTabs, repo], activeTab: repo })
}

/** Shows a tab at its top level: any sub-pages open on top of it close. */
export function selectTab(id: string): void {
  openModal(null)
  if (getSettings().activeTab !== id) void updateSettings({ activeTab: id })
}

// Which section each repo tab is on, remembered while switching tabs (and named in the breadcrumbs).
const sections = new Map<string, string>()
const sectionListeners = new Set<() => void>()
export const setRepoSection = (repo: string, id: string) => {
  sections.set(repo, id)
  openModal(null)
  sectionListeners.forEach((l) => l())
}
export const useRepoSection = (repo: string) =>
  useSyncExternalStore(
    (l) => {
      sectionListeners.add(l)
      return () => sectionListeners.delete(l)
    },
    () => sections.get(repo) ?? 'overview'
  )

/** Closes an open tab. Pinned tabs stay until they're unpinned. */
export function closeTab(repo: string): void {
  const s = getSettings()
  if (!s.openTabs.includes(repo)) return
  const all = allTabs()
  const i = all.indexOf(repo)
  const openTabs = s.openTabs.filter((t) => t !== repo)
  // Closing the active tab moves to the tab that slides into its place, else the one before it.
  const rest = all.filter((t) => t !== repo)
  const activeTab = s.activeTab === repo ? (rest[i] ?? rest[i - 1] ?? HOME) : s.activeTab
  void updateSettings({ openTabs, activeTab })
}

/** Closes every ordinary tab except `keep`; pinned tabs stay. */
export function closeOtherTabs(keep: string): void {
  void updateSettings({ openTabs: getSettings().openTabs.filter((t) => t === keep), activeTab: keep })
}

/** Ctrl+Tab / Ctrl+Shift+Tab through every tab. */
export function cycleTab(by: 1 | -1): void {
  const s = getSettings()
  const all = allTabs()
  selectTab(all[(all.indexOf(s.activeTab) + by + all.length) % all.length])
}

export function moveTab(repo: string, to: number): void {
  const s = getSettings()
  const tabs = s.openTabs.filter((t) => t !== repo)
  tabs.splice(to, 0, repo)
  void updateSettings({ openTabs: tabs, pinnedTabs: s.pinnedTabs.filter((t) => t !== repo) })
}

/** Pins a repo (opening it if needed), optionally at a position among the pinned tabs. */
export function pinTab(repo: string, at?: number): void {
  const s = getSettings()
  const pinned = s.pinnedTabs.filter((t) => t !== repo)
  pinned.splice(at ?? pinned.length, 0, repo)
  void updateSettings({ pinnedTabs: pinned, openTabs: s.openTabs.filter((t) => t !== repo) })
}

/** Unpins a repo; it stays open as the first ordinary tab. */
export function unpinTab(repo: string): void {
  const s = getSettings()
  void updateSettings({ pinnedTabs: s.pinnedTabs.filter((t) => t !== repo), openTabs: [repo, ...s.openTabs.filter((t) => t !== repo)] })
}

export const isPinned = (repo: string) => getSettings().pinnedTabs.includes(repo)

export function toggleSidebar(): void {
  void updateSettings({ sidebarOpen: !getSettings().sidebarOpen })
}

export function setTabLayout(tabLayout: 'horizontal' | 'vertical'): void {
  // Vertical tabs live in the sidebar, so switching to them shows it.
  void updateSettings({ tabLayout, ...(tabLayout === 'vertical' ? { sidebarOpen: true } : {}) })
}
