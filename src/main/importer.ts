import { limitFirstImport } from '../shared/repos'
import { addSharedDashboard, isSharedDashboard } from '../shared/share'
import type { Settings } from '../shared/types'
import { normalizeSettings } from './store'

/**
 * The one way settings come in from outside: pasted text or a file, from this machine or another.
 * Takes either a shared dashboard (added next to the existing ones) or a full settings export (replaces them).
 * Linked clone folders decide where git runs, so they are never taken from the text: the current ones are kept.
 */
export function importSettingsJson(current: Settings, json: string): Settings {
  const parsed = JSON.parse(json) as Partial<Settings>
  if (typeof parsed !== 'object' || !parsed) throw new Error('Not a Pushback file')
  if (isSharedDashboard(parsed)) return { ...addSharedDashboard(current, parsed), localPaths: current.localPaths }
  if (!Array.isArray(parsed.repos)) throw new Error('Not a Pushback settings file')
  const imported = normalizeSettings(parsed)
  // A first import (nothing watched yet) takes at most FIRST_IMPORT_LIMIT repos, favourites first.
  const repos = limitFirstImport(imported.repos, imported.favoriteRepos, current.repos.length)
  return {
    ...imported,
    repos,
    favoriteRepos: imported.favoriteRepos.filter((f) => repos.includes(f)),
    localPaths: current.localPaths,
    // Like localPaths, accounts are this machine's: their tokens live here, so a file from elsewhere can't set them.
    accounts: current.accounts,
    repoAccounts: current.repoAccounts
  }
}

/** A settings export for copying elsewhere: leaves out this machine's folders. */
export function exportSettingsJson(settings: Settings): string {
  const { localPaths: _paths, ...rest } = settings
  return JSON.stringify(rest, null, 2)
}
