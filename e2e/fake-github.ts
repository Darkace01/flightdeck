import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// A tiny stand-in for api.github.com, so the end-to-end tests drive the real app against fixed data and never
// touch GitHub. It answers the REST and GraphQL calls Pushback makes for two repos, acme/api and acme/web, and
// records every request so tests can check the app never writes anything it wasn't asked to.

const now = Date.now()
const ago = (min: number) => new Date(now - min * 60_000).toISOString()
const user = (login: string) => ({ login, avatar_url: '', avatarUrl: '' })

const run = (repo: string, id: number, over: object) => ({
  id,
  workflow_id: 1,
  name: 'CI',
  display_title: 'Update docs',
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  run_number: id,
  run_attempt: 1,
  created_at: ago(30),
  updated_at: ago(28),
  run_started_at: ago(30),
  html_url: `https://github.com/${repo}/actions/runs/${id}`,
  actor: user('octo'),
  triggering_actor: user('octo'),
  ...over
})

export const RUNS: Record<string, object[]> = {
  'acme/api': [
    run('acme/api', 101, {}),
    run('acme/api', 102, { workflow_id: 2, name: 'Deploy', display_title: 'Deploy', event: 'workflow_dispatch', created_at: ago(20), run_started_at: ago(20), updated_at: ago(18) }),
    run('acme/api', 103, { conclusion: 'failure', event: 'pull_request', head_branch: 'feat/login', display_title: 'Add login page', created_at: ago(10), run_started_at: ago(10), updated_at: ago(9) })
  ],
  'acme/web': [run('acme/web', 201, { status: 'in_progress', conclusion: null, display_title: 'Build site', created_at: ago(2), run_started_at: ago(2), updated_at: ago(1) })]
}

const DEPLOY_YAML = `name: Deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [dev, prod-acme]
`

const pr = (number: number, over: object) => ({
  number,
  title: 'Add login page',
  url: `https://github.com/acme/api/pull/${number}`,
  isDraft: false,
  createdAt: ago(600),
  updatedAt: ago(15),
  headRefName: 'feat/login',
  additions: 42,
  deletions: 3,
  reviewDecision: null,
  author: { login: 'alice', avatarUrl: '' },
  comments: { totalCount: 1 },
  labels: { nodes: [{ name: 'ui', color: '0e8a16' }] },
  reviewRequests: { nodes: [{ requestedReviewer: { login: 'octo' } }] },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  ...over
})

const PRS: Record<string, object[]> = {
  'acme/api': [pr(7, {}), pr(8, { title: 'WIP: tidy config', isDraft: true, author: { login: 'octo', avatarUrl: '' }, headRefName: 'chore/tidy', labels: { nodes: [] }, reviewRequests: { nodes: [] } })],
  'acme/web': []
}

// Screenshot mode adds more repos, runs, PRs and deployments so the website shows a lived-in dashboard.
const RICH_RUNS: Record<string, object[]> = {
  'acme/api': [
    run('acme/api', 104, { name: 'Release', display_title: 'v1.2.0', event: 'push', head_branch: 'v1.2.0', created_at: ago(45), run_started_at: ago(45), updated_at: ago(41) }),
    run('acme/api', 105, { name: 'CodeQL', display_title: 'Scheduled scan', event: 'schedule', created_at: ago(70), run_started_at: ago(70), updated_at: ago(64) })
  ],
  'acme/web': [
    run('acme/web', 202, { name: 'Deploy', display_title: 'Deploy preview', event: 'workflow_dispatch', head_branch: 'main', created_at: ago(35), run_started_at: ago(35), updated_at: ago(31) }),
    run('acme/web', 203, { name: 'E2E', display_title: 'Checkout flow', conclusion: 'failure', event: 'pull_request', head_branch: 'feat/checkout', created_at: ago(50), run_started_at: ago(50), updated_at: ago(44) })
  ],
  'acme/mobile': [
    run('acme/mobile', 301, { name: 'Build iOS', display_title: 'Bump version', created_at: ago(5), run_started_at: ago(5), updated_at: ago(3), status: 'in_progress', conclusion: null }),
    run('acme/mobile', 302, { name: 'Build Android', display_title: 'Bump version', created_at: ago(6), run_started_at: ago(6), updated_at: ago(2) })
  ],
  'acme/infra': [run('acme/infra', 401, { name: 'Terraform plan', display_title: 'Add cache cluster', event: 'pull_request', head_branch: 'infra/cache', created_at: ago(25), run_started_at: ago(25), updated_at: ago(22) })]
}

const RICH_PRS: Record<string, object[]> = {
  'acme/web': [
    pr(31, { title: 'Redesign checkout flow', url: 'https://github.com/acme/web/pull/31', headRefName: 'feat/checkout', author: { login: 'maria', avatarUrl: '' }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }),
    pr(32, { title: 'Dark mode for the docs site', url: 'https://github.com/acme/web/pull/32', headRefName: 'feat/dark-docs', author: { login: 'sam', avatarUrl: '' }, reviewDecision: 'APPROVED', labels: { nodes: [{ name: 'docs', color: '0075ca' }] } })
  ],
  'acme/mobile': [pr(12, { title: 'Offline sync for drafts', url: 'https://github.com/acme/mobile/pull/12', headRefName: 'feat/offline', author: { login: 'lee', avatarUrl: '' }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }] } })],
  'acme/infra': [pr(4, { title: 'Add a Redis cache cluster', url: 'https://github.com/acme/infra/pull/4', headRefName: 'infra/cache', author: { login: 'priya', avatarUrl: '' }, labels: { nodes: [{ name: 'infra', color: 'd93f0b' }] } })]
}

const deployment = (id: number, environment: string, runId: number, sha: string, minutes: number, state = 'ACTIVE') => ({
  databaseId: id,
  environment,
  task: 'deploy',
  description: null,
  state,
  createdAt: ago(minutes),
  commitOid: sha,
  ref: { name: 'main' },
  creator: { login: 'octo', avatarUrl: '' },
  latestStatus: { state: state === 'FAILURE' ? 'FAILURE' : 'SUCCESS', createdAt: ago(minutes - 1), logUrl: `https://github.com/acme/api/actions/runs/${runId}/job/1`, environmentUrl: '', description: '' }
})

function graphql(query: string, vars: Record<string, string>, rich: boolean) {
  if (query.includes('reviewRequests: search')) {
    const node = { ...pr(7, {}), repository: { nameWithOwner: 'acme/api' } }
    return { viewer: { login: 'octo', avatarUrl: '' }, reviewRequests: { nodes: [node] }, myPrs: { nodes: [] }, assigned: { nodes: [] } }
  }
  const repo = `${vars.owner}/${vars.name}`
  if (query.includes('deployments(') && rich && repo !== 'acme/api') {
    // Every rich repo deploys to dev, staging and two clients in prod.
    const envs = ['dev', 'staging', 'prod-acme', 'prod-globex', 'prod-initech']
    return {
      repository: {
        environments: { nodes: envs.map((name) => ({ name })) },
        deployments: { nodes: envs.map((e, i) => deployment(900 + i + repo.length * 10, e, 202, i < 2 ? 'r2' : 'r1', 20 + i * 90, e === 'prod-initech' && repo === 'acme/web' ? 'FAILURE' : 'ACTIVE')) },
        refs: { nodes: [{ name: 'v2.4.0', target: { oid: 'r2' } }, { name: 'v2.3.1', target: { oid: 'r1' } }] }
      }
    }
  }
  if (query.includes('deployments(')) {
    const api = repo === 'acme/api'
    return {
      repository: {
        environments: { nodes: api ? [{ name: 'dev' }, { name: 'prod-acme' }, { name: 'prod-globex' }] : [] },
        deployments: {
          nodes: api
            ? [deployment(3, 'prod-globex', 102, 'c2', 25, 'FAILURE'), deployment(2, 'prod-acme', 102, 'c1', 19), deployment(1, 'dev', 101, 'c1', 29)]
            : []
        },
        refs: { nodes: [{ name: 'v1.2.0', target: { oid: 'tag', target: { oid: 'c1' } } }] }
      }
    }
  }
  if (query.includes('pullRequests(')) return { repository: { defaultBranchRef: { name: 'main' }, pullRequests: { nodes: [...(PRS[repo] ?? []), ...(rich ? (RICH_PRS[repo] ?? []) : [])] } } }
  return { repository: null }
}

function rest(path: string, rich: boolean): unknown {
  const [p] = path.split('?')
  let m: RegExpMatchArray | null
  if (p === '/user') return { login: 'octo', avatar_url: '' }
  if (p === '/user/repos') return path.includes('page=1') ? [{ full_name: 'acme/api', description: 'The API', private: true, pushed_at: ago(5) }, { full_name: 'acme/web', description: 'The website', private: false, pushed_at: ago(60) }] : []
  if ((m = p.match(/^\/repos\/([^/]+\/[^/]+)\/actions\/runs$/))) return { workflow_runs: [...(RUNS[m[1]] ?? []), ...(rich ? (RICH_RUNS[m[1]] ?? []) : [])] }
  if ((m = p.match(/^\/repos\/([^/]+\/[^/]+)\/actions\/workflows$/)))
    return {
      workflows:
        m[1] === 'acme/api'
          ? [
              { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', html_url: '' },
              { id: 2, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active', html_url: '' }
            ]
          : []
    }
  if (p.endsWith('/contents/.github/workflows/deploy.yml')) return { content: Buffer.from(DEPLOY_YAML).toString('base64') }
  if (p.endsWith('/contents/.github/workflows/ci.yml')) return { content: Buffer.from('on: push\n').toString('base64') }
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/actions\/runs\/(\d+)\/jobs$/)))
    return {
      jobs: [
        {
          id: Number(m[1]) * 10,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: ago(20),
          completed_at: ago(19),
          html_url: '',
          steps: [{ name: 'Checkout', status: 'completed', conclusion: 'success', number: 1 }]
        }
      ]
    }
  if ((m = p.match(/^\/repos\/([^/]+\/[^/]+)\/readme$/))) return `<h1>${m[1]}</h1><p>Readme for the fixture repo.</p>`
  if ((m = p.match(/^\/repos\/([^/]+\/[^/]+)$/)))
    return {
      full_name: m[1],
      description: `Fixture repo ${m[1]}`,
      html_url: `https://github.com/${m[1]}`,
      homepage: null,
      private: false,
      archived: false,
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 5,
      forks_count: 1,
      open_issues_count: 2,
      topics: ['demo'],
      pushed_at: ago(5)
    }
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/)))
    return {
      number: Number(m[1]),
      node_id: `PR_node_${m[1]}`,
      title: 'Add login page',
      state: 'open',
      draft: false,
      merged: false,
      mergeable: true,
      mergeable_state: 'clean',
      body_html: '<p>Adds the <strong>login</strong> page.</p>',
      html_url: `https://github.com/acme/api/pull/${m[1]}`,
      user: user('alice'),
      created_at: ago(600),
      updated_at: ago(15),
      head: { ref: 'feat/login', sha: 'b'.repeat(40) },
      base: { ref: 'main' },
      additions: 42,
      deletions: 3,
      changed_files: 1,
      requested_reviewers: [user('octo')],
      labels: [{ name: 'ui', color: '0e8a16' }]
    }
  if (p.match(/\/issues\/\d+\/comments$/)) return [{ id: 1, user: user('bob'), body_html: '<p>Looks good to me!</p>', created_at: ago(30), html_url: '' }]
  if (p.match(/\/pulls\/\d+\/reviews$/)) return []
  if (p.match(/\/pulls\/\d+\/commits$/)) return [{ sha: 'b'.repeat(40), commit: { message: 'Add login page', author: { name: 'alice', date: ago(600) } }, author: user('alice') }]
  if (p.match(/\/pulls\/\d+\/files$/)) return [{ filename: 'src/login.ts', status: 'added', additions: 2, deletions: 0, patch: '@@ -0,0 +1,2 @@\n+export const login = true\n+// done' }]
  if (p.match(/\/check-runs$/)) return { check_runs: [{ name: 'build', status: 'completed', conclusion: 'success', html_url: '' }] }
  return undefined
}

export interface FakeGitHub {
  url: string
  requests: { method: string; path: string; body?: string }[]
  /** Requests that would change something on GitHub (anything but reads and GraphQL queries; mutations count). */
  writes: () => { method: string; path: string; body?: string }[]
  close: () => Promise<void>
}

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })

/** `rich` adds more repos and history, for screenshots. */
export async function startFakeGitHub(opts: { rich?: boolean } = {}): Promise<FakeGitHub> {
  const rich = !!opts.rich
  const requests: { method: string; path: string; body?: string }[] = []
  const server: Server = createServer(async (req, res) => {
    const path = req.url ?? '/'
    const text = req.method === 'GET' ? '' : await body(req)
    requests.push({ method: req.method ?? 'GET', path, ...(text && { body: text }) })
    const headers = { 'Content-Type': 'application/json', 'x-ratelimit-resource': 'core', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(Math.floor(now / 1000) + 3600) }
    if (!/^Bearer |^token /.test(req.headers.authorization ?? '')) {
      res.writeHead(401, headers).end(JSON.stringify({ message: 'Bad credentials' }))
      return
    }
    if (path === '/graphql' && req.method === 'POST') {
      const { query, variables } = JSON.parse(text) as { query: string; variables: Record<string, string> }
      if (/^\s*mutation/.test(query)) {
        res.writeHead(200, headers).end(JSON.stringify({ data: { ok: { clientMutationId: null } } }))
        return
      }
      res.writeHead(200, headers).end(JSON.stringify({ data: graphql(query, variables ?? {}, rich) }))
      return
    }
    // Submitting a review is the one REST write the app is allowed to make in tests that ask for it.
    if (req.method === 'POST' && /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+\/reviews$/.test(path)) {
      res.writeHead(200, headers).end(JSON.stringify({ id: 1 }))
      return
    }
    const data = req.method === 'GET' ? rest(path, rich) : undefined
    if (data === undefined) res.writeHead(404, headers).end(JSON.stringify({ message: 'Not Found' }))
    else if (typeof data === 'string') res.writeHead(200, { ...headers, 'Content-Type': 'text/html' }).end(data)
    else res.writeHead(200, headers).end(JSON.stringify(data))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    writes: () => requests.filter((r) => r.method !== 'GET' && !(r.method === 'POST' && r.path === '/graphql' && !/^\s*mutation/.test(JSON.parse(r.body ?? '{}').query ?? ''))),
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
