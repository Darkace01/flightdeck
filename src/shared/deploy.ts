// Turning GitHub environment names into Octopus-style stages and clients (tenants). Teams name environments
// like "prod-acmecorp", "staging-globex", "Production – web" or just "AcmeCorp"; the stage word is
// recognised and whatever is left is the client.

const STAGES: [RegExp, string][] = [
  [/^(dev|develop|development)$/i, 'dev'],
  [/^(test|testing|qa|sit)$/i, 'test'],
  [/^(uat|preview|preprod|pre-prod|nonprod|non-prod)$/i, 'pre-prod'],
  [/^(stage|staging|stg)$/i, 'staging'],
  [/^(prod|production|prd|live)$/i, 'prod']
]

/** Stages left to right, as Octopus lays out environments. Unknown stages go between pre-prod and staging. */
export const STAGE_ORDER = ['dev', 'test', 'pre-prod', 'other', 'staging', 'prod']

export interface EnvParts {
  stage: string
  /** null when the environment is a stage shared by every client ("dev", "Production"). */
  client: string | null
}

export function parseEnvironment(env: string): EnvParts {
  const words = env.split(/\s*[-_/–—:]\s*|\s+/).filter(Boolean)
  let stage: string | undefined
  const rest: string[] = []
  for (const w of words) {
    const hit = !stage && STAGES.find(([re]) => re.test(w))
    if (hit) stage = hit[1]
    else rest.push(w)
  }
  return { stage: stage ?? 'other', client: rest.length ? rest.join('-') : null }
}

/** Case-insensitive key for a client, so "AcmeCorp" and "acmecorp" are one tenant. */
export const clientKey = (client: string | null) => (client ?? '').toLowerCase()

export const stageRank = (stage: string) => {
  const i = STAGE_ORDER.indexOf(stage)
  return i < 0 ? STAGE_ORDER.indexOf('other') : i
}

/** One line per distinct error, so a spent rate limit across 20 repos reads as one message rather than twenty. */
export function groupRepoErrors(errors: { repo: string; error: string }[]): string[] {
  const byError = new Map<string, string[]>()
  for (const { repo, error } of errors) byError.set(error, [...(byError.get(error) ?? []), repo])
  return [...byError].map(([error, repos]) => {
    if (repos.length === 1) return `${repos[0]}: ${error}`
    const names = repos.length <= 3 ? repos.join(', ') : `${repos.slice(0, 2).join(', ')} and ${repos.length - 2} more`
    return `${error} (${names})`
  })
}
