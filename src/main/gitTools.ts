import type { BlameLine, CommitFile, GitAction, GitAnswer, GitQuery, GraphCommit } from '../shared/types'
import { git } from './git'

// Read-only history tools for a linked clone: the commit graph, commit details, file history and blame,
// comparing refs, searching, stashes, tags, remotes, worktrees and contributors. Every value from the UI
// is validated or passed after `--`, and git runs without a shell.

const FORMAT = '%H%x1f%P%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%D%x1e'

/** "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1" → head:main, remote:origin/main, tag:v1. */
function parseRefs(decoration: string): string[] {
  return decoration
    .split(', ')
    .filter(Boolean)
    .flatMap((r) => {
      if (r === 'HEAD') return ['head:HEAD']
      const head = r.match(/^HEAD -> refs\/heads\/(.+)$/)
      if (head) return [`head:${head[1]}`]
      const tag = r.match(/^tag: refs\/tags\/(.+)$/)
      if (tag) return [`tag:${tag[1]}`]
      if (r.startsWith('refs/heads/')) return [`branch:${r.slice(11)}`]
      // origin/HEAD just repeats the default branch.
      if (r.startsWith('refs/remotes/')) return r.endsWith('/HEAD') ? [] : [`remote:${r.slice(13)}`]
      return []
    })
}

function parseLog(out: string): GraphCommit[] {
  return out
    .split('\x1e')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [sha, parents, subject, author, email, date, refs] = l.split('\x1f')
      return { sha, parents: parents ? parents.split(' ') : [], subject, author, email, date, refs: parseRefs(refs ?? '') }
    })
}

const log = async (path: string, args: string[]) =>
  parseLog(
    await git(path, ['log', '--decorate=full', `--format=${FORMAT}`, ...args]).catch((e: Error) => {
      if (/does not have any commits|unknown revision|bad default revision/.test(e.message)) return ''
      throw e
    })
  )

export const sha = (s: unknown) => {
  const v = String(s ?? '')
  if (!/^[0-9a-f]{4,40}$/i.test(v)) throw new Error(`“${v}” isn't a commit SHA`)
  return v
}

/** Branch, tag or remote-branch names (or SHAs) from the UI; refuse anything git could read as an option or range. */
export const refName = (s: unknown) => {
  const name = String(s ?? '').trim()
  if (!name || name.startsWith('-') || /\s|\.\.|[~^:?*[\\]/.test(name)) throw new Error(`“${name}” isn't a valid ref`)
  return name
}

const filePath = (s: unknown) => {
  const p = String(s ?? '')
  if (!p || p.startsWith('-')) throw new Error(`“${p}” isn't a valid path`)
  return p
}

/** `git diff --numstat` and `--name-status` (both -z) for the same range, merged per file. */
async function changedFiles(path: string, range: string[]): Promise<CommitFile[]> {
  const [numstat, names] = await Promise.all([
    git(path, ['diff', '--numstat', '-M', '-z', ...range]),
    git(path, ['diff', '--name-status', '-M', '-z', ...range])
  ])
  const counts = new Map<string, [number, number]>()
  const n = numstat.split('\0')
  for (let i = 0; i < n.length; i++) {
    const m = n[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/)
    if (!m) continue
    // Renames leave the path empty and follow with the old and new paths as separate fields.
    let file = m[3]
    if (!file) {
      i += 2
      file = n[i]
    }
    counts.set(file, [Number(m[1]) || 0, Number(m[2]) || 0])
  }
  const files: CommitFile[] = []
  const s = names.split('\0')
  for (let i = 0; i < s.length - 1; i++) {
    const status = s[i]
    if (!status) continue
    if (/^[RC]/.test(status)) {
      const oldPath = s[++i]
      const newPath = s[++i]
      files.push({ path: newPath, oldPath, status: status[0], additions: counts.get(newPath)?.[0] ?? 0, deletions: counts.get(newPath)?.[1] ?? 0 })
    } else {
      const p = s[++i]
      files.push({ path: p, status: status[0], additions: counts.get(p)?.[0] ?? 0, deletions: counts.get(p)?.[1] ?? 0 })
    }
  }
  return files
}

// git's well-known empty tree: what a root commit is compared against.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

async function parentOf(path: string, commit: string): Promise<string> {
  const parents = (await git(path, ['log', '-1', '--format=%P', sha(commit)])).trim().split(' ').filter(Boolean)
  return parents[0] ?? EMPTY_TREE
}

function parseBlame(out: string): BlameLine[] {
  const info = new Map<string, { author: string; date: string; summary: string }>()
  const lines: BlameLine[] = []
  let current: { sha: string; line: number } | undefined
  let fields: Record<string, string> = {}
  for (const l of out.split('\n')) {
    const head = l.match(/^([0-9a-f]{40}) \d+ (\d+)/)
    if (head) {
      current = { sha: head[1], line: Number(head[2]) }
      fields = {}
    } else if (l.startsWith('\t') && current) {
      // Porcelain output describes each commit once, the first time it appears.
      if (!info.has(current.sha))
        info.set(current.sha, {
          author: fields['author'] ?? '',
          date: fields['author-time'] ? new Date(Number(fields['author-time']) * 1000).toISOString() : '',
          summary: fields['summary'] ?? ''
        })
      lines.push({ line: current.line, sha: current.sha, ...info.get(current.sha)!, text: l.slice(1).replace(/\r$/, '') })
    } else {
      const sp = l.indexOf(' ')
      if (sp > 0) fields[l.slice(0, sp)] = l.slice(sp + 1)
    }
  }
  return lines
}

async function answer(path: string, q: GitQuery): Promise<GitAnswer[keyof GitAnswer]> {
  switch (q.kind) {
    case 'graph':
      // Branches, tags and remote branches rather than --all, which would also pull in stashes and other internal refs.
      return log(path, ['--topo-order', '-n', String(Math.min(3000, Math.max(1, Number(q.limit) || 300))), ...(q.all ? ['--branches', '--tags', '--remotes', 'HEAD'] : ['HEAD'])])
    case 'commit': {
      const out = await git(path, ['show', '-s', '--decorate=full', '--format=%H%x1f%P%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%cn%x1f%cI%x1f%b', sha(q.sha)])
      const [h, parents, subject, author, email, date, refs, committer, committerDate, body] = out.split('\x1f')
      const p = parents ? parents.split(' ') : []
      return {
        sha: h,
        parents: p,
        subject,
        author,
        email,
        date,
        refs: parseRefs(refs),
        committer,
        committerDate,
        body: (body ?? '').trim(),
        files: await changedFiles(path, [p[0] ?? EMPTY_TREE, h])
      }
    }
    case 'commit-diff':
      return git(path, ['diff', '--no-color', '-M', await parentOf(path, q.sha), sha(q.sha), '--', filePath(q.path)])
    case 'files':
      return (await git(path, ['ls-files', '-z'])).split('\0').filter(Boolean).slice(0, 50_000)
    case 'file-history':
      return log(path, ['--follow', '-n', '300', '--', filePath(q.path)])
    case 'blame':
      return parseBlame(await git(path, ['blame', '--porcelain', '--', filePath(q.path)]))
    case 'refs': {
      const refs = (await git(path, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags'])).split('\n').filter(Boolean)
      const current = (await git(path, ['branch', '--show-current']).catch(() => '')).trim() || null
      return {
        current,
        branches: refs.filter((r) => r.startsWith('refs/heads/')).map((r) => r.slice(11)),
        remoteBranches: refs.filter((r) => r.startsWith('refs/remotes/') && !r.endsWith('/HEAD')).map((r) => r.slice(13)),
        tags: refs.filter((r) => r.startsWith('refs/tags/')).map((r) => r.slice(10))
      }
    }
    case 'compare': {
      const base = refName(q.base)
      const head = refName(q.head)
      const [ahead, behind, files] = await Promise.all([
        log(path, ['-n', '500', `${base}..${head}`]),
        log(path, ['-n', '500', `${head}..${base}`]),
        changedFiles(path, [`${base}...${head}`])
      ])
      return { ahead, behind, files }
    }
    case 'compare-diff':
      return git(path, ['diff', '--no-color', '-M', `${refName(q.base)}...${refName(q.head)}`, '--', filePath(q.path)])
    case 'search': {
      const text = String(q.text ?? '').trim()
      if (!text) return []
      const scope = ['--branches', '--tags', '--remotes', '-n', '300']
      if (q.mode === 'message') return log(path, [...scope, '-i', `--grep=${text}`])
      if (q.mode === 'author') return log(path, [...scope, '-i', `--author=${text}`])
      if (q.mode === 'change') return log(path, [...scope, `-S${text}`])
      if (q.mode === 'file') return log(path, [...scope, '--', `*${text}*`])
      return log(path, ['-n', '1', sha(text)]).catch(() => [])
    }
    case 'stashes': {
      const out = await git(path, ['stash', 'list', '--format=%gd%x1f%gs%x1f%cI'])
      return out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [ref, message, date] = l.split('\x1f')
          return { index: Number(ref.match(/\{(\d+)\}/)?.[1] ?? 0), message, date }
        })
    }
    case 'stash-diff': {
      const ref = `stash@{${Math.max(0, Math.floor(Number(q.index) || 0))}}`
      // --include-untracked needs git 2.32+; older gits show tracked changes only.
      return git(path, ['stash', 'show', '-p', '--no-color', '--include-untracked', ref]).catch(() => git(path, ['stash', 'show', '-p', '--no-color', ref]))
    }
    case 'tags': {
      const out = await git(path, [
        'for-each-ref',
        'refs/tags',
        '--sort=-creatordate',
        '--format=%(refname:short)%1f%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%1f%(creatordate:iso-strict)%1f%(subject)'
      ])
      return out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [name, commit, date, subject] = l.split('\x1f')
          return { name, sha: commit, date, subject }
        })
    }
    case 'remotes': {
      const remotes = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>()
      for (const l of (await git(path, ['remote', '-v'])).split('\n')) {
        const m = l.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
        if (!m) continue
        const r = remotes.get(m[1]) ?? { name: m[1], fetchUrl: '', pushUrl: '' }
        if (m[3] === 'fetch') r.fetchUrl = m[2]
        else r.pushUrl = m[2]
        remotes.set(m[1], r)
      }
      return [...remotes.values()]
    }
    case 'worktrees':
      return worktrees(path)
    case 'contributors': {
      // shortlog reads stdin unless it's given a revision, so always name HEAD.
      const out = await git(path, ['shortlog', '-sne', 'HEAD']).catch(() => '')
      return out
        .split('\n')
        .map((l) => l.match(/^\s*(\d+)\t(.*?)\s*<(.*)>$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => ({ commits: Number(m[1]), name: m[2], email: m[3] }))
    }
  }
}

export async function worktrees(path: string) {
  const out = await git(path, ['worktree', 'list', '--porcelain'])
  return out
    .split(/\r?\n\r?\n/)
    .filter((b) => b.startsWith('worktree '))
    .map((b, i) => {
      const field = (k: string) => b.match(new RegExp(`^${k} (.*)$`, 'm'))?.[1]?.trim()
      return {
        path: field('worktree')!,
        head: field('HEAD') ?? '',
        branch: field('branch')?.replace(/^refs\/heads\//, '') ?? null,
        main: i === 0,
        locked: /^locked/m.test(b)
      }
    })
}

export async function query<Q extends GitQuery>(path: string, q: Q): Promise<GitAnswer[Q['kind']]> {
  return (await answer(path, q)) as GitAnswer[Q['kind']]
}

const list = (arg: unknown): string[] => (Array.isArray(arg) ? arg.map(String) : [String(arg ?? '')])
const stashRef = (arg: unknown) => `stash@{${Math.max(0, Math.floor(Number(arg) || 0))}}`

/** History actions from the commit graph and the stash, tag, remote and worktree views. */
export async function act(path: string, action: GitAction, arg?: string | string[]): Promise<string> {
  const [a, b, c] = list(arg)
  switch (action) {
    case 'cherry-pick':
      return git(path, ['cherry-pick', sha(a)])
    case 'revert':
      return git(path, ['revert', '--no-edit', sha(a)])
    case 'reset-soft':
    case 'reset-mixed':
    case 'reset-hard':
      return git(path, ['reset', `--${action.slice(6)}`, sha(a)])
    case 'branch-at':
      return git(path, ['branch', refName(a), sha(b)])
    case 'delete-branch':
      return git(path, ['branch', '-d', refName(a)])
    case 'force-delete-branch':
      return git(path, ['branch', '-D', refName(a)])
    case 'merge':
      return git(path, ['merge', '--no-edit', refName(a)])
    case 'rebase':
      return git(path, ['rebase', refName(a)])
    case 'stash-apply':
      return git(path, ['stash', 'apply', stashRef(a)])
    case 'stash-drop':
      return git(path, ['stash', 'drop', stashRef(a)])
    case 'stash-pop-at':
      return git(path, ['stash', 'pop', stashRef(a)])
    case 'tag':
      return c?.trim() ? git(path, ['tag', '-a', refName(a), '-m', c.trim(), sha(b)]) : git(path, ['tag', refName(a), sha(b)])
    case 'delete-tag':
      return git(path, ['tag', '-d', refName(a)])
    case 'push-tag':
      return git(path, ['push', 'origin', `refs/tags/${refName(a)}`])
    case 'fetch-remote':
      if (!/^[\w.-]+$/.test(a)) throw new Error(`“${a}” isn't a remote name`)
      return git(path, ['fetch', '--prune', a])
    case 'worktree-remove': {
      // Only remove a worktree git itself lists, and never the main one.
      const wt = (await worktrees(path)).find((w) => w.path === a && !w.main)
      if (!wt) throw new Error(`${a} isn't one of this repo's extra worktrees`)
      return git(path, ['worktree', 'remove', wt.path])
    }
    default:
      throw new Error(`Unknown action ${action}`)
  }
}

export const HISTORY_ACTIONS = new Set<GitAction>([
  'cherry-pick', 'revert', 'reset-soft', 'reset-mixed', 'reset-hard', 'branch-at', 'delete-branch', 'force-delete-branch', 'merge', 'rebase',
  'stash-apply', 'stash-drop', 'stash-pop-at', 'tag', 'delete-tag', 'push-tag', 'fetch-remote', 'worktree-remove'
])
