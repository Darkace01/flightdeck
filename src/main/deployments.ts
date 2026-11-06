import { parseEnvironment } from '../shared/deploy'
import type { Deployment, RepoDeployments } from '../shared/types'
import type { GitHub } from './github'

// Deployments for the Octopus-style dashboard: one GraphQL query per repo returns its environments, its last
// 100 deployments with their latest status, and recent tags (to show a release version instead of a SHA).

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    environments(first: 50) { nodes { name } }
    deployments(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        databaseId environment task description state createdAt commitOid
        ref { name }
        creator { login avatarUrl }
        latestStatus { state createdAt logUrl environmentUrl description }
      }
    }
    refs(refPrefix: "refs/tags/", first: 100, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
      nodes { name target { oid ... on Tag { target { oid } } } }
    }
  }
}`

interface Node {
  databaseId: number
  environment: string | null
  task: string | null
  description: string | null
  state: string
  createdAt: string
  commitOid: string
  ref: { name: string } | null
  creator: { login: string; avatarUrl: string } | null
  latestStatus: { state: string; createdAt: string; logUrl: string | null; environmentUrl: string | null; description: string | null } | null
}

// GitHub marks the newest successful deployment per environment ACTIVE and older ones INACTIVE; both succeeded.
const STATE: Record<string, Deployment['state']> = {
  ACTIVE: 'success',
  INACTIVE: 'success',
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  IN_PROGRESS: 'in_progress',
  QUEUED: 'queued',
  PENDING: 'queued',
  WAITING: 'waiting',
  ABANDONED: 'cancelled',
  DESTROYED: 'cancelled'
}

export async function listDeployments(gh: GitHub, repo: string): Promise<RepoDeployments> {
  const [owner, name] = repo.split('/')
  const data = await gh.graphql<{
    repository: {
      environments: { nodes: { name: string }[] }
      deployments: { nodes: Node[] }
      refs: { nodes: { name: string; target: { oid: string; target?: { oid: string } } }[] }
    }
  }>(QUERY, { owner, name })
  const r = data.repository
  // A tag points at a commit directly (lightweight) or through a tag object (annotated).
  const tags = new Map<string, string>()
  for (const t of r.refs.nodes) {
    const sha = t.target.target?.oid ?? t.target.oid
    if (!tags.has(sha)) tags.set(sha, t.name)
  }
  const deployments = r.deployments.nodes
    .filter((d) => d.environment)
    .map((d): Deployment => {
      const status = d.latestStatus
      const finished = status && ['SUCCESS', 'FAILURE', 'ERROR', 'INACTIVE'].includes(status.state) ? status.createdAt : null
      const run = status?.logUrl?.match(/\/actions\/runs\/(\d+)/)
      return {
        id: d.databaseId,
        repo,
        environment: d.environment!,
        ...parseEnvironment(d.environment!),
        ref: d.ref?.name ?? null,
        sha: d.commitOid,
        version: tags.get(d.commitOid) ?? null,
        state: STATE[d.state] ?? 'queued',
        current: d.state === 'ACTIVE',
        createdAt: d.createdAt,
        finishedAt: finished,
        creator: d.creator?.login ?? 'unknown',
        creatorAvatar: d.creator?.avatarUrl,
        runId: run ? Number(run[1]) : null,
        logUrl: status?.logUrl ?? null,
        environmentUrl: status?.environmentUrl || null,
        description: status?.description || d.description || null
      }
    })
  // A run whose reusable workflow has several jobs on one environment records a deployment per job; keep one.
  const seen = new Set<string>()
  const unique = deployments.filter((d) => {
    const key = `${d.environment}|${d.runId ?? d.id}`
    return !seen.has(key) && seen.add(key)
  })
  const environments = [...new Set([...r.environments.nodes.map((e) => e.name), ...unique.map((d) => d.environment)])]
  return { repo, environments, deployments: unique }
}
