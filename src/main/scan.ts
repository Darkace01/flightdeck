import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FoundClone } from '../shared/types'

// Finds git clones of GitHub repos under a folder, by reading each repo's .git/config. No git
// processes are started, so scanning a home folder takes seconds.

// Folders that never hold your own clones but can be huge: dependency caches, build output, OS/app data.
const SKIP = new Set([
  'node_modules', 'bower_components', 'vendor', 'Pods', 'venv', '.venv', '__pycache__', 'site-packages', 'dist', 'build', 'out', 'target',
  'bin', 'obj', 'packages', 'AppData', 'Library', 'Applications', 'Application Data', 'Pictures', 'Music', 'Movies', 'Videos',
  '$RECYCLE.BIN', 'System Volume Information', 'go', 'snap', 'scoop'
])
const MAX_DEPTH = 6
const MAX_DIRS = 60_000

/** owner/name from a GitHub remote URL (https, ssh, or an ssh host alias like github.com-work). */
export function githubRepo(url: string): string | undefined {
  const m = url.trim().match(/github\.com[^/:]*[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}` : undefined
}

/** The repo the clone's origin points at, falling back to any GitHub remote. */
async function originOf(gitDir: string): Promise<string | undefined> {
  const config = await readFile(join(gitDir, 'config'), 'utf8').catch(() => '')
  let remote = ''
  const urls: [string, string][] = []
  for (const line of config.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\s*remote\s+"([^"]+)"\s*\]/)
    if (section) remote = section[1]
    else if (/^\s*\[/.test(line)) remote = ''
    else if (remote) {
      const url = line.match(/^\s*url\s*=\s*(.+)$/)?.[1]
      if (url) urls.push([remote, url])
    }
  }
  const pick = urls.find(([r, u]) => r === 'origin' && githubRepo(u)) ?? urls.find(([, u]) => githubRepo(u))
  return pick && githubRepo(pick[1])
}

/** Walks `root` breadth-first and returns each GitHub clone found, most recently used first per repo. */
export async function findClones(root = homedir()): Promise<FoundClone[]> {
  const found: (FoundClone & { used: number })[] = []
  let queue = [root]
  let seen = 0
  for (let depth = 0; depth <= MAX_DEPTH && queue.length && seen < MAX_DIRS; depth++) {
    const next: string[] = []
    // Read one level at a time, a batch in parallel, to keep it quick without opening thousands of handles.
    for (let i = 0; i < queue.length && seen < MAX_DIRS; i += 64) {
      await Promise.all(
        queue.slice(i, i + 64).map(async (dir) => {
          seen++
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
          if (entries.some((e) => e.name === '.git' && e.isDirectory())) {
            const repo = await originOf(join(dir, '.git'))
            // The index changes on every checkout, commit and status, so its mtime says how recently the clone was used.
            const used = (await stat(join(dir, '.git', 'index')).catch(() => undefined))?.mtimeMs ?? 0
            if (repo) found.push({ repo, path: dir, used })
          }
          // Keep going inside repos too: some keep other clones in subfolders.
          for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)) next.push(join(dir, e.name))
        })
      )
    }
    queue = next
  }
  return found.sort((a, b) => a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' }) || b.used - a.used).map(({ used: _, ...c }) => c)
}
