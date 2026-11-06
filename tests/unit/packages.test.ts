import { describe, expect, it } from 'vitest'
import { GitHubError, type GitHub } from '../../src/main/github'
import { listPackageOrgs, listPackages, mapPackages, mapVersions, packageVersions } from '../../src/main/packages'
import { filterPackages, isOwner, isPackageType, shortVersion } from '../../src/shared/packages'
import type { PackageInfo } from '../../src/shared/types'

const fakeGh = (answer: (path: string) => unknown) => ({ get: async (path: string) => answer(path) }) as unknown as GitHub

const raw = (over: object = {}) => ({ name: 'lib', package_type: 'npm', visibility: 'private', version_count: 4, html_url: 'u', created_at: 'c', updated_at: 'd', repository: { full_name: 'o/lib' }, ...over })

describe('mapPackages', () => {
  it('maps a package, keeping its repo and visibility', () => {
    expect(mapPackages('@me', [raw()])).toEqual([
      { owner: '@me', name: 'lib', type: 'npm', visibility: 'private', versionCount: 4, repo: 'o/lib', url: 'u', createdAt: 'c', updatedAt: 'd' }
    ])
  })
  it('treats an unknown visibility as public, a missing repo as none, and skips types it does not know', () => {
    const [p, ...rest] = mapPackages('acme', [raw({ visibility: undefined, repository: null }), raw({ package_type: 'docker' })])
    expect(p).toMatchObject({ visibility: 'public', repo: undefined })
    expect(rest).toEqual([])
  })
})

describe('mapVersions', () => {
  it('reads container tags and falls back to the package link', () => {
    expect(mapVersions([{ id: 1, name: 'sha256:x', created_at: 'd', metadata: { container: { tags: ['latest'] } } }, { id: 2, name: '1.0.0', created_at: 'e', html_url: 'v' }], 'pkg')).toEqual([
      { id: 1, name: 'sha256:x', tags: ['latest'], url: 'pkg', createdAt: 'd' },
      { id: 2, name: '1.0.0', tags: [], url: 'v', createdAt: 'e' }
    ])
  })
})

describe('listPackages', () => {
  it('asks for every package type, on /user for you and /orgs/<org> for an organisation', async () => {
    const paths: string[] = []
    const gh = fakeGh((path) => (paths.push(path), []))
    await listPackages(gh, '@me')
    await listPackages(gh, 'acme')
    expect(paths.filter((p) => p.startsWith('/user/')).map((p) => p.match(/package_type=(\w+)/)![1]).sort()).toEqual(['container', 'maven', 'npm', 'nuget', 'rubygems'])
    expect(paths.filter((p) => p.startsWith('/orgs/acme/'))).toHaveLength(5)
  })
  it('combines the types and ignores one the token cannot read', async () => {
    const gh = fakeGh((path) => {
      if (path.includes('package_type=npm')) return [raw()]
      if (path.includes('package_type=maven')) throw new GitHubError('Forbidden', 403)
      return []
    })
    const r = await listPackages(gh, '@me')
    expect(r.packages.map((p) => p.name)).toEqual(['lib'])
    expect(r.unavailable).toBeUndefined()
  })
  it('says why when every type is refused', async () => {
    const forbidden = await listPackages(fakeGh(() => { throw new GitHubError('Forbidden', 403) }), 'acme')
    expect(forbidden.unavailable).toMatch(/read:packages/)
    const missing = await listPackages(fakeGh(() => { throw new GitHubError('Not Found', 404) }), 'nope')
    expect(missing.unavailable).toMatch(/Not found/)
  })
  it('fails on errors that are not about access, and on a bad owner name', async () => {
    await expect(listPackages(fakeGh(() => { throw new GitHubError('Server error', 500) }), '@me')).rejects.toThrow('Server error')
    await expect(listPackages(fakeGh(() => []), '../etc')).rejects.toThrow('Not an owner name')
  })
})

describe('listPackageOrgs', () => {
  it('lists organisation logins alphabetically', async () => {
    expect(await listPackageOrgs(fakeGh(() => [{ login: 'zeta' }, { login: 'acme' }]))).toEqual(['acme', 'zeta'])
  })
})

describe('packageVersions', () => {
  it('requests the right path, encoding the package name', async () => {
    const paths: string[] = []
    const gh = fakeGh((path) => (paths.push(path), []))
    await packageVersions(gh, '@me', 'npm', 'a/b')
    await packageVersions(gh, 'acme', 'container', 'img')
    expect(paths).toEqual(['/user/packages/npm/a%2Fb/versions?per_page=30', '/orgs/acme/packages/container/img/versions?per_page=30'])
  })
  it('refuses anything that is not a package', async () => {
    const gh = fakeGh(() => [])
    await expect(packageVersions(gh, '@me', 'deb', 'x')).rejects.toThrow('Not a package')
    await expect(packageVersions(gh, 'a/b', 'npm', 'x')).rejects.toThrow('Not a package')
    await expect(packageVersions(gh, '@me', 'npm', '')).rejects.toThrow('Not a package')
  })
})

describe('shared helpers', () => {
  const pkg = (name: string, type: PackageInfo['type'], visibility: PackageInfo['visibility'], updatedAt: string): PackageInfo => ({ owner: '@me', name, type, visibility, versionCount: 1, url: '', createdAt: '', updatedAt })
  const all = [pkg('old', 'npm', 'public', '2026-01-01'), pkg('new', 'container', 'private', '2026-03-01'), pkg('mid', 'npm', 'private', '2026-02-01')]
  it('filters by type and visibility and puts the most recently updated first', () => {
    expect(filterPackages(all, '', '').map((p) => p.name)).toEqual(['new', 'mid', 'old'])
    expect(filterPackages(all, 'npm', '').map((p) => p.name)).toEqual(['mid', 'old'])
    expect(filterPackages(all, 'npm', 'private').map((p) => p.name)).toEqual(['mid'])
  })
  it('validates owners and types', () => {
    expect([isOwner('@me'), isOwner('acme-co'), isOwner('a/b'), isOwner(''), isOwner('-x')]).toEqual([true, true, false, false, false])
    expect([isPackageType('npm'), isPackageType('docker')]).toEqual([true, false])
  })
  it('shortens container digests only', () => {
    expect(shortVersion('sha256:' + 'ab'.repeat(32))).toBe('sha256:' + 'ab'.repeat(6))
    expect(shortVersion('1.2.3')).toBe('1.2.3')
  })
})
