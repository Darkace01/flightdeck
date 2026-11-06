import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { GitAction, GitBranch, GitCommit, GitFile, GitStatus } from '../shared/types'

// Local git tools. Every command runs with execFile (no shell) inside a folder the user linked;
// the renderer only ever names a repo, never a path.

export function git(cwd: string, args: string[], timeout = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      // Never let git block on a terminal prompt we can't show; credential helpers still work.
      { cwd, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join('\n')))
        else resolve(stdout + (stderr ? `\n${stderr}` : ''))
      }
    )
  })
}

/** Does any remote of the repo at `path` point at <host>/<repo>? (`host` is github.com or an Enterprise Server.) */
export async function remoteMatches(path: string, repo: string, host = 'github.com'): Promise<boolean> {
  const remotes = await git(path, ['remote', '-v'])
  const want = repo.toLowerCase()
  const at = host.toLowerCase()
  return remotes
    .toLowerCase()
    .split('\n')
    .some((l) => l.includes(`${at}/${want}`) || l.includes(`${at}:${want}`))
}

export async function topLevel(path: string): Promise<string> {
  return (await git(path, ['rev-parse', '--show-toplevel'])).trim()
}

export async function clone(repo: string, parent: string, host = 'github.com'): Promise<string> {
  const target = join(parent, repo.split('/')[1])
  if (existsSync(target)) throw new Error(`${target} already exists`)
  await git(parent, ['clone', `https://${host}/${repo}.git`, target], 30 * 60_000)
  return target
}

export async function status(path: string): Promise<GitStatus> {
  const [out, stashes] = await Promise.all([git(path, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=all']), git(path, ['stash', 'list'])])
  const entries = out.split('\0')
  const head = entries.shift() ?? ''
  // "## main...origin/main [ahead 1, behind 2]", "## No commits yet on main" or "## HEAD (no branch)"
  const m = head.match(/^## (?:No commits yet on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/)
  const detached = head.startsWith('## HEAD (no branch)')
  const track = m?.[3] ?? ''
  const files: GitFile[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.length < 4) continue
    const x = e[0]
    const y = e[1]
    files.push({ path: e.slice(3), index: x, worktree: y })
    if (x === 'R' || x === 'C') i++ // renames are followed by the original path
  }
  return {
    path,
    branch: detached ? null : (m?.[1] ?? null),
    upstream: m?.[2] ?? null,
    ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
    files,
    stashes: stashes.split('\n').filter((l) => l.startsWith('stash@')).length
  }
}

export async function log(path: string): Promise<GitCommit[]> {
  const out = await git(path, ['log', '-n', '80', '--pretty=format:%H%x1f%s%x1f%an%x1f%aI%x1f%D%x1e']).catch((e: Error) => {
    if (/does not have any commits/.test(e.message)) return ''
    throw e
  })
  return out
    .split('\x1e')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [sha, subject, author, date, refs] = l.split('\x1f')
      return { sha, subject, author, date, refs }
    })
}

export async function branches(path: string): Promise<GitBranch[]> {
  const out = await git(path, [
    'for-each-ref',
    'refs/heads',
    '--sort=-committerdate',
    '--format=%(refname:short)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(committerdate:iso-strict)'
  ])
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [name, upstream, track, head, date] = l.split('\x1f')
      return { name, upstream: upstream || null, track, current: head === '*', date }
    })
}

export async function diff(path: string, file: string, staged: boolean): Promise<string> {
  const out = await git(path, ['diff', '--no-color', ...(staged ? ['--cached'] : []), '--', file])
  if (out.trim() || staged) return out
  // Untracked files have no diff; show their content as all-new lines.
  const full = join(path, file)
  if (!existsSync(full) || statSync(full).isDirectory()) return ''
  if (statSync(full).size > 512 * 1024) return '@@ new file (too large to show) @@'
  const text = readFileSync(full, 'utf8')
  if (text.includes('\0')) return '@@ new binary file @@'
  return `@@ new file @@\n${text.split('\n').map((l) => `+${l}`).join('\n')}`
}

const files = (arg?: string | string[]) => {
  const list = Array.isArray(arg) ? arg : arg ? [arg] : []
  if (!list.length) throw new Error('No files given')
  return list
}

/** Branch names come from the UI; refuse anything git could read as an option. */
const branchName = (arg?: string | string[]) => {
  const name = String(arg ?? '').trim()
  if (!name || name.startsWith('-') || /\s|\.\.|[~^:?*[\\]/.test(name)) throw new Error(`“${name}” isn't a valid branch name`)
  return name
}

export async function run(path: string, action: GitAction, arg?: string | string[]): Promise<string> {
  switch (action) {
    case 'fetch':
      return git(path, ['fetch', '--prune'])
    case 'pull':
      // Fast-forward only: never create surprise merge commits from a button.
      return git(path, ['pull', '--ff-only'])
    case 'push': {
      const upstream = await git(path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')
      return upstream.trim() ? git(path, ['push']) : git(path, ['push', '-u', 'origin', 'HEAD'])
    }
    case 'switch':
      return git(path, ['switch', branchName(arg)])
    case 'create-branch':
      return git(path, ['switch', '-c', branchName(arg)])
    case 'stage':
      return git(path, ['add', '--', ...files(arg)])
    case 'unstage':
      return git(path, ['restore', '--staged', '--', ...files(arg)])
    case 'stage-all':
      return git(path, ['add', '-A'])
    case 'unstage-all':
      return git(path, ['reset', '-q'])
    case 'discard': {
      // Tracked files go back to their committed state; untracked files are deleted.
      const list = files(arg)
      const st = await status(path)
      const untracked = list.filter((f) => st.files.some((s) => s.path === f && s.index === '?'))
      const tracked = list.filter((f) => !untracked.includes(f))
      if (tracked.length) await git(path, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
      if (untracked.length) await git(path, ['clean', '-f', '--', ...untracked])
      return ''
    }
    case 'commit': {
      const message = String(arg ?? '').trim()
      if (!message) throw new Error('Write a commit message first')
      return git(path, ['commit', '-m', message])
    }
    case 'stash':
      return git(path, ['stash', 'push', '--include-untracked'])
    case 'stash-pop':
      return git(path, ['stash', 'pop'])
    default:
      throw new Error(`Unknown action ${action}`)
  }
}

/** Opens the folder in the user's editor, a terminal, or the file manager's view. */
export function openIn(path: string, where: 'editor' | 'terminal', editorCommand: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let child
    if (where === 'editor') {
      // Editors are usually .cmd shims on Windows, which need a shell to start.
      child = spawn(`${editorCommand} "${path}"`, { shell: true, detached: true, stdio: 'ignore', windowsHide: true })
    } else if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/c', 'start', `"${basename(path)}"`, 'cmd.exe'], { cwd: path, detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
    } else if (process.platform === 'darwin') {
      child = spawn('open', ['-a', 'Terminal', path], { detached: true, stdio: 'ignore' })
    } else {
      child = spawn('x-terminal-emulator', [], { cwd: path, detached: true, stdio: 'ignore' })
    }
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
