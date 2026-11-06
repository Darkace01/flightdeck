import { isOwner, isPackageType, PACKAGE_TYPES } from '../shared/packages'
import type { OwnerPackages, PackageInfo, PackageType, PackageVersion } from '../shared/types'
import { GitHubError, type GitHub } from './github'

// GitHub Packages published by you or by an organisation. The list endpoints need a package type, so listing is one
// ETag-cached GET per type (a 304 is free). Versions cost one more request per package, so they are only asked for
// when a package is opened. Needs a token with read:packages; without it GitHub answers 403/404, which shows as
// "unavailable" rather than an error.

interface GhPackage {
  name: string
  package_type: string
  visibility?: string
  version_count?: number
  html_url: string
  created_at: string
  updated_at: string
  repository?: { full_name?: string } | null
}

interface GhVersion {
  id: number
  name: string
  html_url?: string
  created_at: string
  metadata?: { container?: { tags?: string[] } }
}

const base = (owner: string): string => (owner === '@me' ? '/user' : `/orgs/${owner}`)

function asVisibility(v: string | undefined): PackageInfo['visibility'] {
  return v === 'private' || v === 'internal' ? v : 'public'
}

export function mapPackages(owner: string, items: GhPackage[]): PackageInfo[] {
  return items
    .filter((p) => isPackageType(p.package_type))
    .map((p) => ({
      owner,
      name: p.name,
      type: p.package_type as PackageType,
      visibility: asVisibility(p.visibility),
      versionCount: p.version_count ?? 0,
      repo: p.repository?.full_name,
      url: p.html_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }))
}

export function mapVersions(items: GhVersion[], packageUrl: string): PackageVersion[] {
  return items.map((v) => ({
    id: v.id,
    name: v.name,
    tags: v.metadata?.container?.tags ?? [],
    url: v.html_url ?? packageUrl,
    createdAt: v.created_at
  }))
}

export async function listPackages(gh: GitHub, owner: string): Promise<OwnerPackages> {
  if (!isOwner(owner)) throw new Error('Not an owner name')
  const results = await Promise.allSettled(PACKAGE_TYPES.map((t) => gh.get<GhPackage[]>(`${base(owner)}/packages?package_type=${t}&per_page=100`)))
  const packages: PackageInfo[] = []
  let denied: GitHubError | undefined
  for (const r of results) {
    if (r.status === 'fulfilled') packages.push(...mapPackages(owner, r.value))
    else if (r.reason instanceof GitHubError && (r.reason.status === 403 || r.reason.status === 404)) denied = r.reason
    else throw r.reason
  }
  // Every type refused: the token lacks read:packages (or the organisation doesn't allow it). Only some refused is just "none of that type".
  if (denied && results.every((r) => r.status === 'rejected')) {
    return { owner, packages: [], unavailable: denied.status === 404 ? 'Not found, or no packages you can see' : 'The token needs the read:packages scope to list packages' }
  }
  return { owner, packages }
}

export async function listPackageOrgs(gh: GitHub): Promise<string[]> {
  const orgs = await gh.get<{ login: string }[]>('/user/orgs?per_page=100')
  return orgs.map((o) => o.login).sort((a, b) => a.localeCompare(b))
}

export async function packageVersions(gh: GitHub, owner: string, type: string, name: string): Promise<PackageVersion[]> {
  // eslint-disable-next-line no-control-regex
  if (!isOwner(owner) || !isPackageType(type) || !name || name.length > 255 || /[\u0000-\u001f]/.test(name)) throw new Error('Not a package')
  const versions = await gh.get<GhVersion[]>(`${base(owner)}/packages/${type}/${encodeURIComponent(name)}/versions?per_page=30`)
  return mapVersions(versions, '')
}
