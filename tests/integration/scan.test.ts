import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findClones } from '../../src/main/scan'
import { cleanup, tempDir, write } from './helpers'

// Builds a fake home folder full of clones (just their .git/config files) and checks what the scanner finds.

const config = (remotes: Record<string, string>) =>
  ['[core]', '\trepositoryformatversion = 0', ...Object.entries(remotes).flatMap(([name, url]) => [`[remote "${name}"]`, `\turl = ${url}`, '\tfetch = +refs/heads/*:refs/remotes/origin/*']), '[branch "main"]', '\tremote = origin'].join('\n')

let home: string
beforeAll(() => {
  home = tempDir()
  const clone = (path: string, remotes: Record<string, string>, indexAge?: number) => {
    write(home, join(path, '.git', 'config'), config(remotes))
    write(home, join(path, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    if (indexAge !== undefined) write(home, join(path, '.git', 'index'), String(indexAge))
  }
  clone('code/api', { origin: 'https://github.com/acme/api.git' })
  clone('code/folder-name-differs', { origin: 'git@github.com:acme/web.git' })
  clone('code/upstream-first', { upstream: 'https://gitlab.com/x/y.git', origin: 'https://github.com/acme/fork.git' })
  clone('code/no-origin', { mine: 'https://github.com/acme/other.git' })
  clone('code/gitlab-only', { origin: 'https://gitlab.com/acme/elsewhere.git' })
  clone('code/api/nested/tool', { origin: 'https://github.com/acme/tool.git' })
  clone('code/project/node_modules/dep', { origin: 'https://github.com/someone/dep.git' })
  clone('.hidden/secret', { origin: 'https://github.com/acme/hidden.git' })
  clone('a/b/c/d/e/f/g/too-deep', { origin: 'https://github.com/acme/deep.git' })
  clone('copies/api-old', { origin: 'https://github.com/acme/api.git' })
  write(home, 'code/not-a-repo/readme.txt', 'hi')
})
afterAll(() => cleanup(home))

describe('findClones', () => {
  it('finds GitHub clones by remote, whatever the folder is called', async () => {
    const found = await findClones(home)
    const repos = found.map((c) => c.repo)
    expect(repos).toEqual(expect.arrayContaining(['acme/api', 'acme/web', 'acme/fork', 'acme/other', 'acme/tool']))
    expect(found.find((c) => c.repo === 'acme/web')!.path).toBe(join(home, 'code', 'folder-name-differs'))
  })

  it('prefers origin, then any GitHub remote', async () => {
    const found = await findClones(home)
    expect(found.find((c) => c.path.endsWith('upstream-first'))!.repo).toBe('acme/fork')
    expect(found.find((c) => c.path.endsWith('no-origin'))!.repo).toBe('acme/other')
  })

  it('skips non-GitHub clones, dependency folders, hidden folders and anything too deep', async () => {
    const repos = (await findClones(home)).map((c) => c.repo)
    for (const r of ['acme/elsewhere', 'someone/dep', 'acme/hidden', 'acme/deep']) expect(repos).not.toContain(r)
  })

  it('lists every copy of a repo, sorted by name', async () => {
    const found = await findClones(home)
    expect(found.filter((c) => c.repo === 'acme/api')).toHaveLength(2)
    const names = found.map((c) => c.repo.toLowerCase())
    expect(names).toEqual([...names].sort())
  })

  it('returns nothing for an empty or missing folder', async () => {
    expect(await findClones(join(home, 'code', 'not-a-repo'))).toEqual([])
    expect(await findClones(join(home, 'does-not-exist'))).toEqual([])
  })
})
