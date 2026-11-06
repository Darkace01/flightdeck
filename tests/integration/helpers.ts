import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** A fresh empty folder under the OS temp dir; remove it with `cleanup`. */
export function tempDir(prefix = 'pushback-test-'): string {
  // .native expands Windows short names (KAZEEM~1) to the long form git reports.
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

/** Runs git in `cwd` with a fixed identity and no user/system config, so tests behave the same everywhere. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'author@example.com'
    }
  }).trim()
}

export function write(dir: string, file: string, content: string): void {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), content)
}

/** Commits `files` (path → content) with `message` and returns the new SHA. */
export function commit(dir: string, message: string, files: Record<string, string>): string {
  for (const [f, c] of Object.entries(files)) write(dir, f, c)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

/**
 * A repo with some shape to it:
 *   main:  init ─ second ─ merge(feature) ─ main-only
 *   feature:   └─ feat-a ─ feat-b ┘
 *   experiment: from second, one commit
 * plus a lightweight tag v1 and an annotated tag v2, and a bare "origin" remote with main pushed.
 */
export function makeRepo(root: string) {
  const dir = join(root, 'repo')
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'core.autocrlf', 'false')
  const init = commit(dir, 'Initial commit', { 'README.md': '# demo\n', 'src/app.txt': 'one\ntwo\nthree\n' })
  git(dir, 'tag', 'v1')
  const second = commit(dir, 'Second commit', { 'src/app.txt': 'one\nTWO\nthree\n' })
  git(dir, 'switch', '-q', '-c', 'feature')
  const featA = commit(dir, 'Feature A', { 'feat/a.txt': 'a\n' })
  const featB = commit(dir, 'Feature B', { 'feat/b.txt': 'b\n' })
  git(dir, 'switch', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', 'feature', '-m', 'Merge feature')
  const merge = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'experiment', second)
  const experiment = commit(dir, 'Experiment', { 'exp.txt': 'x\n' })
  git(dir, 'switch', '-q', 'main')
  const mainOnly = commit(dir, 'Main only work', { 'src/app.txt': 'one\nTWO\nthree\nfour\n', 'renamed-later.txt': 'r\n' })
  git(dir, 'tag', '-a', 'v2', '-m', 'Version two')
  const bare = join(root, 'origin.git')
  git(root, 'init', '-q', '--bare', bare)
  git(dir, 'remote', 'add', 'origin', bare)
  git(dir, 'push', '-q', '-u', 'origin', 'main')
  return { dir, bare, shas: { init, second, featA, featB, merge, experiment, mainOnly } }
}
