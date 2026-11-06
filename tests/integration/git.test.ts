import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as gitApi from '../../src/main/git'
import { act, HISTORY_ACTIONS, query } from '../../src/main/gitTools'
import { cleanup, commit, git, makeRepo, tempDir, write } from './helpers'

// Real git, real repos in a temp folder: every query and action the app offers, plus the ways it must refuse.

// The app runs git with the user's config; keep tests independent of whoever runs them.
process.env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'Test Author'
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'author@example.com'

let root: string
let repo: ReturnType<typeof makeRepo>

beforeAll(() => {
  root = tempDir()
  repo = makeRepo(root)
})
afterAll(() => cleanup(root))

describe('reading history', () => {
  it('graph: every branch, children before parents, with refs', async () => {
    const all = await query(repo.dir, { kind: 'graph', all: true, limit: 100 })
    const shas = all.map((c) => c.sha)
    for (const s of Object.values(repo.shas)) expect(shas).toContain(s)
    for (const c of all) for (const p of c.parents) if (shas.includes(p)) expect(shas.indexOf(p)).toBeGreaterThan(shas.indexOf(c.sha))
    const tip = all.find((c) => c.sha === repo.shas.mainOnly)!
    expect(tip.refs).toEqual(expect.arrayContaining(['head:main', 'remote:origin/main', 'tag:v2']))
    expect(all.find((c) => c.sha === repo.shas.experiment)!.refs).toContain('branch:experiment')
    expect(all.find((c) => c.sha === repo.shas.init)!.refs).toContain('tag:v1')
    expect(all.find((c) => c.sha === repo.shas.merge)!.parents).toHaveLength(2)
  })

  it('graph: current branch only, and respects the limit', async () => {
    const head = await query(repo.dir, { kind: 'graph', all: false, limit: 100 })
    expect(head.map((c) => c.sha)).not.toContain(repo.shas.experiment)
    expect(await query(repo.dir, { kind: 'graph', all: true, limit: 2 })).toHaveLength(2)
  })

  it('commit: message, files with counts, and renames', async () => {
    const c = await query(repo.dir, { kind: 'commit', sha: repo.shas.mainOnly })
    expect(c.subject).toBe('Main only work')
    expect(c.author).toBe('Test Author')
    expect(c.files).toEqual(
      expect.arrayContaining([
        { path: 'src/app.txt', status: 'M', additions: 1, deletions: 0 },
        { path: 'renamed-later.txt', status: 'A', additions: 1, deletions: 0 }
      ])
    )
    // The root commit is compared with the empty tree.
    const root = await query(repo.dir, { kind: 'commit', sha: repo.shas.init })
    expect(root.parents).toEqual([])
    expect(root.files.map((f) => f.path).sort()).toEqual(['README.md', 'src/app.txt'])
  })

  it('commit-diff: the patch for one file', async () => {
    const d = await query(repo.dir, { kind: 'commit-diff', sha: repo.shas.second, path: 'src/app.txt' })
    expect(d).toContain('-two')
    expect(d).toContain('+TWO')
  })

  it('files, file history (following renames) and blame', async () => {
    const files = await query(repo.dir, { kind: 'files' })
    expect(files).toEqual(expect.arrayContaining(['README.md', 'src/app.txt', 'feat/a.txt']))
    const hist = await query(repo.dir, { kind: 'file-history', path: 'src/app.txt' })
    expect(hist.map((c) => c.subject)).toEqual(['Main only work', 'Second commit', 'Initial commit'])
    const blame = await query(repo.dir, { kind: 'blame', path: 'src/app.txt' })
    expect(blame.map((l) => [l.line, l.text, l.summary])).toEqual([
      [1, 'one', 'Initial commit'],
      [2, 'TWO', 'Second commit'],
      [3, 'three', 'Initial commit'],
      [4, 'four', 'Main only work']
    ])
  })

  it('refs, compare and compare-diff', async () => {
    const refs = await query(repo.dir, { kind: 'refs' })
    expect(refs.current).toBe('main')
    expect(refs.branches.sort()).toEqual(['experiment', 'feature', 'main'])
    expect(refs.remoteBranches).toEqual(['origin/main'])
    expect(refs.tags.sort()).toEqual(['v1', 'v2'])
    const cmp = await query(repo.dir, { kind: 'compare', base: 'main', head: 'experiment' })
    expect(cmp.ahead.map((c) => c.subject)).toEqual(['Experiment'])
    expect(cmp.behind.length).toBeGreaterThan(0)
    expect(cmp.files.map((f) => f.path)).toEqual(['exp.txt'])
    expect(await query(repo.dir, { kind: 'compare-diff', base: 'main', head: 'experiment', path: 'exp.txt' })).toContain('+x')
  })

  it.each([
    ['message', 'feature', ['Merge feature', 'Feature B', 'Feature A']],
    ['author', 'test author', null],
    ['file', 'exp.txt', ['Experiment']],
    ['change', 'TWO', ['Second commit']]
  ] as const)('search by %s', async (mode, text, expected) => {
    const found = await query(repo.dir, { kind: 'search', mode, text })
    // Commits made in the same second can come back in either order.
    if (expected) expect(found.map((c) => c.subject).sort()).toEqual([...expected].sort())
    else expect(found.length).toBeGreaterThan(5)
  })

  it('search by SHA, and nothing for blank or bad input', async () => {
    expect((await query(repo.dir, { kind: 'search', mode: 'sha', text: repo.shas.featA.slice(0, 8) })).map((c) => c.sha)).toEqual([repo.shas.featA])
    expect(await query(repo.dir, { kind: 'search', mode: 'sha', text: 'not-a-sha' })).toEqual([])
    expect(await query(repo.dir, { kind: 'search', mode: 'message', text: '   ' })).toEqual([])
  })

  it('tags (annotated tags resolve to their commit), remotes, worktrees and contributors', async () => {
    const tags = await query(repo.dir, { kind: 'tags' })
    expect(tags.find((t) => t.name === 'v2')).toMatchObject({ sha: repo.shas.mainOnly, subject: 'Version two' })
    expect(tags.find((t) => t.name === 'v1')!.sha).toBe(repo.shas.init)
    const remotes = await query(repo.dir, { kind: 'remotes' })
    expect(remotes).toHaveLength(1)
    expect(remotes[0].name).toBe('origin')
    const trees = await query(repo.dir, { kind: 'worktrees' })
    expect(trees).toHaveLength(1)
    expect(trees[0]).toMatchObject({ branch: 'main', main: true })
    expect(await query(repo.dir, { kind: 'contributors' })).toEqual([{ name: 'Test Author', email: 'author@example.com', commits: 6 }])
  })

  it('status: branch, upstream and changed files', async () => {
    write(repo.dir, 'untracked.txt', 'new\n')
    const s = await gitApi.status(repo.dir)
    expect(s.branch).toBe('main')
    expect(s.upstream).toBe('origin/main')
    expect(s.files).toContainEqual({ path: 'untracked.txt', index: '?', worktree: '?' })
    // Untracked files show as all-new lines.
    expect(await gitApi.diff(repo.dir, 'untracked.txt', false)).toContain('+new')
    await gitApi.run(repo.dir, 'discard', 'untracked.txt')
    expect(existsSync(join(repo.dir, 'untracked.txt'))).toBe(false)
  })
})

describe('linking and listing', () => {
  it('checks the remotes of a folder point at the repo, from anywhere inside it', async () => {
    const work = join(tempDir(), 'linked')
    git(root, 'clone', '-q', repo.dir, work)
    git(work, 'remote', 'set-url', 'origin', 'https://github.com/Acme/API.git')
    expect(await gitApi.remoteMatches(work, 'acme/api')).toBe(true)
    expect(await gitApi.remoteMatches(work, 'acme/other')).toBe(false)
    // A clone from an Enterprise Server matches that host only, so it can't be linked to a github.com repo of the same name.
    expect(await gitApi.remoteMatches(work, 'acme/api', 'ghe.example.com')).toBe(false)
    git(work, 'remote', 'set-url', 'origin', 'git@ghe.example.com:corp/tools.git')
    expect(await gitApi.remoteMatches(work, 'corp/tools', 'ghe.example.com')).toBe(true)
    expect(await gitApi.remoteMatches(work, 'corp/tools')).toBe(false)
    // git prints forward slashes on every OS.
    expect(await gitApi.topLevel(join(work, 'src'))).toBe(work.split('\\').join('/'))
    cleanup(join(work, '..'))
  })

  it('log and branches with tracking info', async () => {
    const log = await gitApi.log(repo.dir)
    expect(log[0]).toMatchObject({ sha: repo.shas.mainOnly, subject: 'Main only work', author: 'Test Author' })
    expect(log[0].refs).toContain('main')
    const branches = await gitApi.branches(repo.dir)
    expect(branches.find((b) => b.current)!.name).toBe('main')
    expect(branches.find((b) => b.name === 'main')!.upstream).toBe('origin/main')
    expect(branches.map((b) => b.name).sort()).toEqual(['experiment', 'feature', 'main'])
  })

  it('an empty repo has no history rather than an error', async () => {
    const empty = join(tempDir(), 'empty')
    git(root, 'init', '-q', empty)
    expect(await gitApi.log(empty)).toEqual([])
    expect(await query(empty, { kind: 'graph', all: true, limit: 10 })).toEqual([])
    expect((await gitApi.status(empty)).files).toEqual([])
    cleanup(join(empty, '..'))
  })
})

describe('changing the repo', () => {
  // Each test gets its own copy, so actions can't affect each other.
  let work: string
  beforeEach(() => {
    work = join(tempDir(), 'work')
    git(root, 'clone', '-q', repo.dir, work)
    git(work, 'config', 'core.autocrlf', 'false')
    for (const b of ['feature', 'experiment']) git(work, 'branch', '-q', b, `origin/${b}`)
    // Push to the bare repo, like a real remote, rather than to the checked-out source repo.
    git(work, 'remote', 'set-url', 'origin', repo.bare)
    git(work, 'fetch', '-q', 'origin')
    return () => cleanup(join(work, '..'))
  })
  const head = () => git(work, 'log', '-1', '--format=%s')

  it('stage, unstage and commit', async () => {
    write(work, 'new.txt', 'hello\n')
    await gitApi.run(work, 'stage', 'new.txt')
    expect((await gitApi.status(work)).files).toContainEqual({ path: 'new.txt', index: 'A', worktree: ' ' })
    await gitApi.run(work, 'unstage', 'new.txt')
    expect((await gitApi.status(work)).files).toContainEqual({ path: 'new.txt', index: '?', worktree: '?' })
    await gitApi.run(work, 'stage-all')
    await gitApi.run(work, 'commit', 'Add new file')
    expect(head()).toBe('Add new file')
    await expect(gitApi.run(work, 'commit', '   ')).rejects.toThrow(/message/)
  })

  it('staged diffs, unstage all, discard tracked changes, pop the latest stash', async () => {
    write(work, 'README.md', 'edited\n')
    await gitApi.run(work, 'stage-all')
    expect(await gitApi.diff(work, 'README.md', true)).toContain('+edited')
    await gitApi.run(work, 'unstage-all')
    expect((await gitApi.status(work)).files).toContainEqual({ path: 'README.md', index: ' ', worktree: 'M' })
    await gitApi.run(work, 'discard', 'README.md')
    expect(readFileSync(join(work, 'README.md'), 'utf8')).toBe('# demo\n')
    write(work, 'README.md', 'stashed\n')
    await gitApi.run(work, 'stash')
    await gitApi.run(work, 'stash-pop')
    expect(readFileSync(join(work, 'README.md'), 'utf8')).toBe('stashed\n')
    await expect(gitApi.run(work, 'stage', [])).rejects.toThrow(/No files/)
  })

  it('stash and pop, apply and drop by index', async () => {
    write(work, 'README.md', 'changed\n')
    await gitApi.run(work, 'stash')
    expect((await gitApi.status(work)).files).toEqual([])
    expect(await query(work, { kind: 'stashes' })).toHaveLength(1)
    expect(await query(work, { kind: 'stash-diff', index: 0 })).toContain('+changed')
    await act(work, 'stash-apply', '0')
    expect(readFileSync(join(work, 'README.md'), 'utf8')).toBe('changed\n')
    await act(work, 'stash-drop', '0')
    expect(await query(work, { kind: 'stashes' })).toHaveLength(0)
  })

  it('branch at a commit, switch, merge, rebase and delete', async () => {
    await act(work, 'branch-at', ['from-init', repo.shas.init])
    expect(git(work, 'rev-parse', 'from-init')).toBe(repo.shas.init)
    await act(work, 'merge', 'experiment')
    expect(existsSync(join(work, 'exp.txt'))).toBe(true)
    await gitApi.run(work, 'switch', 'from-init')
    await act(work, 'rebase', 'main')
    expect(git(work, 'rev-parse', 'HEAD')).toBe(git(work, 'rev-parse', 'main'))
    await gitApi.run(work, 'switch', 'main')
    await gitApi.run(work, 'create-branch', 'topic')
    expect(git(work, 'branch', '--show-current')).toBe('topic')
    await gitApi.run(work, 'switch', 'main')
    await act(work, 'delete-branch', 'topic')
    expect(git(work, 'branch', '--list', 'topic')).toBe('')
  })

  it('refuses to delete unmerged work unless forced', async () => {
    git(work, 'switch', '-q', '-c', 'unmerged')
    commit(work, 'Unmerged', { 'u.txt': 'u\n' })
    git(work, 'switch', '-q', 'main')
    await expect(act(work, 'delete-branch', 'unmerged')).rejects.toThrow(/not fully merged/)
    await act(work, 'force-delete-branch', 'unmerged')
    expect(git(work, 'branch', '--list', 'unmerged')).toBe('')
  })

  it('cherry-pick and revert', async () => {
    await act(work, 'cherry-pick', repo.shas.experiment)
    expect(head()).toBe('Experiment')
    await act(work, 'revert', git(work, 'rev-parse', 'HEAD'))
    expect(head()).toBe('Revert "Experiment"')
    expect(existsSync(join(work, 'exp.txt'))).toBe(false)
  })

  it.each([
    ['reset-soft', 'A'],
    ['reset-mixed', 'M'],
    ['reset-hard', null]
  ] as const)('%s', async (mode, expectFile) => {
    const before = git(work, 'rev-parse', 'HEAD~1')
    await act(work, mode, before)
    expect(git(work, 'rev-parse', 'HEAD')).toBe(before)
    const files = (await gitApi.status(work)).files
    if (expectFile === null) expect(files).toEqual([])
    else expect(files.length).toBeGreaterThan(0)
  })

  it('tags: create annotated and lightweight, push, delete', async () => {
    await act(work, 'tag', ['v3', repo.shas.mainOnly, 'Three'])
    await act(work, 'tag', ['v4', repo.shas.init])
    const tags = await query(work, { kind: 'tags' })
    expect(tags.find((t) => t.name === 'v3')!.subject).toBe('Three')
    await act(work, 'push-tag', 'v3')
    expect(git(repo.bare, 'tag', '--list', 'v3')).toBe('v3')
    await act(work, 'delete-tag', 'v4')
    expect(git(work, 'tag', '--list', 'v4')).toBe('')
  })

  it('fetch a remote, pull fast-forward only, push', async () => {
    await act(work, 'fetch-remote', 'origin')
    commit(work, 'Pushed from test', { 'p.txt': 'p\n' })
    await gitApi.run(work, 'push')
    expect(git(repo.bare, 'log', '-1', '--format=%s', 'main')).toBe('Pushed from test')
    await gitApi.run(work, 'pull')
  })

  it('worktrees: remove only extra worktrees git itself lists', async () => {
    const extra = join(work, '..', 'wt-feature')
    git(work, 'worktree', 'add', '-q', extra, 'feature')
    const trees = await query(work, { kind: 'worktrees' })
    expect(trees.map((t) => t.branch).sort()).toEqual(['feature', 'main'])
    const main = trees.find((t) => t.main)!
    await expect(act(work, 'worktree-remove', main.path)).rejects.toThrow(/isn't one of this repo's extra worktrees/)
    await expect(act(work, 'worktree-remove', join(work, '..', 'not-a-worktree'))).rejects.toThrow()
    await act(work, 'worktree-remove', trees.find((t) => !t.main)!.path)
    expect(await query(work, { kind: 'worktrees' })).toHaveLength(1)
  })
})

describe('refusing unsafe input', () => {
  // Values from the UI must never be read by git as options (e.g. --upload-pack runs a program) or ranges.
  const evil = ['--upload-pack=touch pwned', '-D', '--exec=calc', 'a..b', 'main~1', 'x;rm -rf /', 'has space', '']

  it.each(evil)('ref name %j', async (bad) => {
    await expect(act(repo.dir, 'merge', bad)).rejects.toThrow(/valid ref/)
    await expect(act(repo.dir, 'branch-at', [bad, repo.shas.init])).rejects.toThrow(/valid ref/)
    await expect(query(repo.dir, { kind: 'compare', base: bad, head: 'main' })).rejects.toThrow(/valid ref/)
  })

  it.each(['--all', 'HEAD', 'zzzz', '12', `${'a'.repeat(41)}`, '$(whoami)'])('SHA %j', async (bad) => {
    await expect(act(repo.dir, 'cherry-pick', bad)).rejects.toThrow(/commit SHA/)
    await expect(act(repo.dir, 'reset-hard', bad)).rejects.toThrow(/commit SHA/)
    await expect(query(repo.dir, { kind: 'commit', sha: bad })).rejects.toThrow(/commit SHA/)
  })

  it('file paths that look like options', async () => {
    await expect(query(repo.dir, { kind: 'blame', path: '--output=x' })).rejects.toThrow(/valid path/)
    await expect(query(repo.dir, { kind: 'file-history', path: '' })).rejects.toThrow(/valid path/)
  })

  it('remote names and branch names for basic actions', async () => {
    await expect(act(repo.dir, 'fetch-remote', '--upload-pack=x')).rejects.toThrow(/remote name/)
    await expect(gitApi.run(repo.dir, 'switch', '--orphan=x')).rejects.toThrow(/valid branch name/)
    await expect(gitApi.run(repo.dir, 'create-branch', '-f')).rejects.toThrow(/valid branch name/)
  })

  it('search text is passed to git as data, not options', async () => {
    // A message search for "--all" finds nothing rather than changing what git does.
    expect(await query(repo.dir, { kind: 'search', mode: 'message', text: '--version' })).toEqual([])
    expect(existsSync(join(repo.dir, 'pwned'))).toBe(false)
  })

  it('every history action is routed through act()', () => {
    expect([...HISTORY_ACTIONS].length).toBeGreaterThanOrEqual(18)
  })
})
