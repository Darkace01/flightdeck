// Limits on how many repos are watched, and the favourites that get priority. Pure, so both processes and the tests can use it.

/** The first time repos are imported (nothing watched yet), at most this many are added; the rest can be added later. */
export const FIRST_IMPORT_LIMIT = 10
/** From this many watched repos on, polling slows down so the whole set stays within GitHub's rate limit. */
export const BUSY_REPO_COUNT = 10

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * How many times longer than the configured interval to wait between polls. Every watched repo costs requests each cycle, so
 * the interval grows by one step per 10 repos once we reach BUSY_REPO_COUNT (10 repos: 2x, 20: 3x), capped at 5x.
 */
export function pollSlowdown(repoCount: number): number {
  return repoCount >= BUSY_REPO_COUNT ? Math.min(5, 1 + Math.floor(repoCount / 10)) : 1
}

/** Favourites first (in their own order), then everything else; each group keeps its existing order. */
export function favoritesFirst(repos: string[], favorites: string[]): string[] {
  const isFav = (r: string) => favorites.some((f) => sameRepo(f, r))
  return [...repos.filter(isFav), ...repos.filter((r) => !isFav(r))]
}

/**
 * Which of the candidates to add. On a first import (`watched` is 0) it's capped at FIRST_IMPORT_LIMIT, favourites first, then
 * in the order given (callers pass most recently used first). Later imports add everything asked for.
 */
export function limitFirstImport(candidates: string[], favorites: string[], watched: number): string[] {
  const unique = candidates.filter((r, i) => candidates.findIndex((c) => sameRepo(c, r)) === i)
  return watched === 0 ? favoritesFirst(unique, favorites).slice(0, FIRST_IMPORT_LIMIT) : unique
}
