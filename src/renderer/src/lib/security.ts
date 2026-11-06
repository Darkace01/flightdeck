import type { RepoSecurity } from '../../../shared/types'
import { repoCache } from './repoCache'
import { api } from './store'

/** Alerts barely change minute to minute, and three REST calls per repo add up: refresh every 5 minutes. */
export const useSecurity = repoCache<RepoSecurity>((repo) => api.listSecurity(repo), 300_000).useRepos
