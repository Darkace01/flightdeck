import type { PackageInfo, PackageType } from './types'

export const PACKAGE_TYPES: PackageType[] = ['npm', 'container', 'nuget', 'maven', 'rubygems']

export const PACKAGE_TYPE_LABEL: Record<PackageType, string> = { npm: 'npm', container: 'Container', nuget: 'NuGet', maven: 'Maven', rubygems: 'RubyGems' }

export const isPackageType = (v: string): v is PackageType => (PACKAGE_TYPES as string[]).includes(v)

/** Org logins are letters, digits and hyphens; '@me' means the signed-in user. */
export const isOwner = (v: string): boolean => v === '@me' || /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(v)

/** Packages narrowed by type and/or visibility ('' means any), most recently published first. */
export function filterPackages(packages: PackageInfo[], type: string, visibility: string): PackageInfo[] {
  return packages
    .filter((p) => (!type || p.type === type) && (!visibility || p.visibility === visibility))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

/** A container digest is 71 characters; show "sha256:" and the first 12. Other version names are left alone. */
export function shortVersion(name: string): string {
  return /^sha256:[0-9a-f]{64}$/.test(name) ? name.slice(0, 19) : name
}
