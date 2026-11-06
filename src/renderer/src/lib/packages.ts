import type { OwnerPackages, PackageType, PackageVersion } from '../../../shared/types'
import { repoCache } from './repoCache'
import { api } from './store'

// Published packages change rarely, so refresh every 5 minutes while a widget is open. The cache is keyed by a string:
// the owner ('@me' or an org login), or 'owner|type|name' for one package's versions.

export const usePackages = repoCache<OwnerPackages>((owner) => api.listPackages(owner), 300_000).useRepos

/** The signed-in user's organisations, under the single key 'orgs'. */
export const useOrgs = repoCache<string[]>(() => api.listPackageOrgs(), 300_000).useRepos

const versions = repoCache<PackageVersion[]>((key) => {
  const [owner, type, ...name] = key.split('|')
  return api.packageVersions(owner, type as PackageType, name.join('|'))
}, 300_000)

export const useVersions = versions.useRepos
export const versionKey = (owner: string, type: PackageType, name: string): string => `${owner}|${type}|${name}`
