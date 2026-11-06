import { GITHUB_HOST, repoUrl } from '../../../shared/accounts'
import { getSettings } from './store'

/** Web URL of a repo (or a page in it, e.g. "/pull/3") on whichever host it lives on: github.com or an Enterprise Server. */
export function webUrl(repo: string, path = ''): string {
  const s = getSettings()
  return repoUrl(repo, s.repoAccounts, s.accounts, path)
}

/** Hosts whose links Pushback opens in its own views: github.com plus the user's Enterprise Server hosts. */
export function knownHosts(): string[] {
  return [GITHUB_HOST, ...getSettings().accounts.map((a) => a.host)]
}
