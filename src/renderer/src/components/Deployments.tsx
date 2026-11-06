import { useMemo, useState } from 'react'
import { clientKey, stageRank } from '../../../shared/deploy'
import type { Deployment, RepoDeployments } from '../../../shared/types'
import { duration, matches, timeAgo, useNow } from '../lib/format'
import { useDeployments } from '../lib/deployments'
import { api, getSnapshot } from '../lib/store'
import { pushModal } from '../lib/ui'
import type { SectionProps } from './RepoWorkspace'
import { Avatar, Empty, Segmented, Skeleton } from './ui'

// Octopus-style deployment views: which version is live in each environment (or for each client), and an
// audit log of every deployment. Data comes from GitHub deployments, which Actions creates for jobs with
// an `environment:`.

export type DeployView = 'environments' | 'clients' | 'history'

const STATE_LABEL: Record<Deployment['state'], string> = {
  success: 'Deployed',
  failure: 'Failed',
  in_progress: 'Deploying',
  queued: 'Queued',
  waiting: 'Waiting for approval',
  cancelled: 'Cancelled'
}

const shortRepo = (repo: string) => repo.split('/')[1]

/** Opens the run that made a deployment, in the app if it's been polled, else on GitHub. */
function openDeployment(d: Deployment) {
  const run = d.runId ? getSnapshot().repos[d.repo]?.runs.find((r) => r.id === d.runId) : undefined
  if (run) pushModal({ kind: 'run', run })
  else if (d.logUrl) void api.openExternal(d.logUrl)
}

/** The newest deployment per key, preferring the one GitHub marks live; a newer failed attempt is shown too. */
function latestBy(list: Deployment[], key: (d: Deployment) => string) {
  const map = new Map<string, { live?: Deployment; latest: Deployment }>()
  for (const d of list) {
    const k = key(d)
    const e = map.get(k) ?? { latest: d }
    if (!e.live && d.state === 'success') e.live = d
    map.set(k, e)
  }
  return map
}

/** One cell: the live version, its age and who deployed it, plus the newest attempt if it differs. */
function DeployCell({ entry, now }: { entry?: { live?: Deployment; latest: Deployment }; now: number }) {
  if (!entry) return <td className="deploy-cell none">–</td>
  const shown = entry.live ?? entry.latest
  const pending = entry.latest !== shown ? entry.latest : undefined
  return (
    <td className="deploy-cell">
      <button className={`deploy-card state-${shown.state}`} onClick={() => openDeployment(shown)} title={tooltip(shown)}>
        <span className="deploy-version mono">{shown.version ?? shown.sha.slice(0, 7)}</span>
        <span className="deploy-meta">
          {shown.creatorAvatar && <Avatar src={shown.creatorAvatar} login={shown.creator} size={12} />}
          {timeAgo(shown.createdAt, now)}
        </span>
      </button>
      {pending && (
        <button className={`deploy-pending state-${pending.state}`} onClick={() => openDeployment(pending)} title={tooltip(pending)}>
          {STATE_LABEL[pending.state]} {pending.version ?? pending.sha.slice(0, 7)}
        </button>
      )}
    </td>
  )
}

const tooltip = (d: Deployment) =>
  [
    `${STATE_LABEL[d.state]} to ${d.environment}`,
    d.version ? `${d.version} (${d.sha.slice(0, 7)})` : d.sha.slice(0, 7),
    d.ref && `from ${d.ref}`,
    `by ${d.creator}, ${new Date(d.createdAt).toLocaleString()}`,
    d.description
  ]
    .filter(Boolean)
    .join('\n')

/** Projects (repos) down the side, environments across the top, ordered dev → prod like Octopus. */
function EnvironmentMatrix({ data, now }: { data: RepoDeployments[]; now: number }) {
  const envs = useMemo(() => {
    const all = new Map<string, Deployment | undefined>()
    for (const r of data) for (const e of r.environments) all.set(e, all.get(e) ?? r.deployments.find((d) => d.environment === e))
    return [...all.keys()].sort((a, b) => {
      const da = all.get(a)
      const db = all.get(b)
      return stageRank(da?.stage ?? 'other') - stageRank(db?.stage ?? 'other') || a.localeCompare(b)
    })
  }, [data])
  if (!envs.length) return <NoDeployments />
  return (
    <div className="deploy-table-wrap">
      <table className="deploy-table">
        <thead>
          <tr>
            <th />
            {envs.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const latest = latestBy(r.deployments, (d) => d.environment)
            return (
              <tr key={r.repo}>
                <th className="deploy-row-head" title={r.repo}>
                  {shortRepo(r.repo)}
                </th>
                {envs.map((e) => (
                  <DeployCell key={e} entry={latest.get(e)} now={now} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Clients (tenants) down the side, stages across the top: which version each client runs where. */
function ClientMatrix({ data, now, multiRepo }: { data: RepoDeployments[]; now: number; multiRepo: boolean }) {
  const all = data.flatMap((r) => r.deployments)
  const stages = [...new Set(all.map((d) => d.stage))].sort((a, b) => stageRank(a) - stageRank(b))
  // One row per client (per repo when showing several); deployments to a shared stage ("dev") get their own row.
  const rows = new Map<string, { label: string; repo: string; client: string | null }>()
  for (const d of all) {
    const key = `${multiRepo ? d.repo : ''}|${clientKey(d.client)}`
    const prev = rows.get(key)
    // Prefer the most capitalised spelling of a client name as its label ("AcmeCorp" over "acmecorp").
    const label = d.client ?? 'Shared'
    if (!prev || (label !== label.toLowerCase() && prev.label === prev.label.toLowerCase())) rows.set(key, { label, repo: d.repo, client: d.client })
  }
  if (!rows.size) return <NoDeployments />
  const sorted = [...rows.entries()].sort(([, a], [, b]) => (a.client === null ? -1 : b.client === null ? 1 : 0) || a.repo.localeCompare(b.repo) || a.label.localeCompare(b.label))
  return (
    <div className="deploy-table-wrap">
      <table className="deploy-table">
        <thead>
          <tr>
            <th>Client</th>
            {stages.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(([key, row]) => {
            const mine = all.filter((d) => d.repo === row.repo && clientKey(d.client) === clientKey(row.client))
            const latest = latestBy(mine, (d) => d.stage)
            return (
              <tr key={key}>
                <th className="deploy-row-head">
                  {row.client === null ? <span className="dim">Shared</span> : row.label}
                  {multiRepo && <span className="dim small"> · {shortRepo(row.repo)}</span>}
                </th>
                {stages.map((s) => (
                  <DeployCell key={s} entry={latest.get(s)} now={now} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Every deployment, newest first: an audit log with filters, like Octopus's deployment history. */
function History({ data, now, multiRepo }: { data: RepoDeployments[]; now: number; multiRepo: boolean }) {
  const [env, setEnv] = useState('')
  const [state, setState] = useState('')
  const [q, setQ] = useState('')
  const all = useMemo(() => data.flatMap((r) => r.deployments).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data])
  const envs = [...new Set(all.map((d) => d.environment))].sort()
  const rows = all.filter(
    (d) => (!env || d.environment === env) && (!state || d.state === state) && (!q || matches(`${d.repo} ${d.environment} ${d.version ?? ''} ${d.sha} ${d.ref ?? ''} ${d.creator}`, q))
  )
  if (!all.length) return <NoDeployments />
  return (
    <>
      <div className="ws-toolbar">
        <select value={env} onChange={(e) => setEnv(e.target.value)}>
          <option value="">All environments</option>
          {envs.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Any outcome</option>
          {Object.entries(STATE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="ws-filter" placeholder="Filter by version, SHA, branch or person…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dim small">{rows.length} deployments</span>
      </div>
      <div className="deploy-table-wrap">
        <table className="deploy-table deploy-history">
          <thead>
            <tr>
              <th>When</th>
              {multiRepo && <th>Project</th>}
              <th>Environment</th>
              <th>Client</th>
              <th>Version</th>
              <th>Outcome</th>
              <th>Took</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="clickable" onClick={() => openDeployment(d)} title={tooltip(d)}>
                <td title={new Date(d.createdAt).toLocaleString()}>{timeAgo(d.createdAt, now)}</td>
                {multiRepo && <td>{shortRepo(d.repo)}</td>}
                <td>
                  <span className="chip mono">{d.environment}</span>
                  {d.current && <span className="badge badge-ok">live</span>}
                </td>
                <td>{d.client ?? <span className="dim">shared</span>}</td>
                <td className="mono">
                  {d.version ?? d.sha.slice(0, 7)}
                  {d.ref && !d.version && <span className="dim"> · {d.ref}</span>}
                </td>
                <td>
                  <span className={`deploy-state state-${d.state}`}>{STATE_LABEL[d.state]}</span>
                </td>
                <td className="dim">{d.finishedAt ? duration(d.createdAt, new Date(d.finishedAt).getTime()) : d.state === 'in_progress' ? duration(d.createdAt, now) : '–'}</td>
                <td>
                  <span className="inline">
                    {d.creatorAvatar && <Avatar src={d.creatorAvatar} login={d.creator} size={14} />}
                    {d.creator}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const NoDeployments = () => (
  <Empty>
    No deployments yet. GitHub records one each time an Actions job with an <code>environment:</code> runs, so deploy workflows that set it show up here.
  </Empty>
)

/** The three deployment views for one or more repos. */
export function DeploymentsView({ repos, view, onView, compact }: { repos: string[]; view: DeployView; onView?: (v: DeployView) => void; compact?: boolean }) {
  const now = useNow()
  const { data, loading, errors } = useDeployments(repos)
  const multiRepo = repos.length > 1
  return (
    <div className={`deploy-view${compact ? ' compact' : ''}`}>
      {onView && (
        <div className="ws-toolbar">
          <Segmented
            value={view}
            onChange={onView}
            options={[
              ['environments', 'Environments'],
              ['clients', 'Clients'],
              ['history', 'History']
            ]}
          />
        </div>
      )}
      {errors.map((e) => (
        <p key={e} className="del small">
          {e}
        </p>
      ))}
      {loading && !data.length ? (
        <Skeleton rows={5} />
      ) : view === 'environments' ? (
        <EnvironmentMatrix data={data} now={now} />
      ) : view === 'clients' ? (
        <ClientMatrix data={data} now={now} multiRepo={multiRepo} />
      ) : (
        <History data={data} now={now} multiRepo={multiRepo} />
      )}
    </div>
  )
}

export function DeploymentsSection({ repo }: SectionProps) {
  const [view, setView] = useState<DeployView>('clients')
  return <DeploymentsView repos={[repo]} view={view} onView={setView} />
}

/** "Deployed to" chips for a workflow run: which environment (and client) it deployed to. */
export function RunDeployments({ repo, runId }: { repo: string; runId: number }) {
  const { data } = useDeployments([repo])
  const mine = data[0]?.deployments.filter((d) => d.runId === runId) ?? []
  const unique = [...new Map(mine.map((d) => [d.environment, d])).values()]
  if (!unique.length) return null
  return (
    <div className="run-deploys">
      <span className="dim small">Deployed to</span>
      {unique.map((d) => (
        <span key={d.environment} className={`deploy-chip state-${d.state}`} title={tooltip(d)}>
          {d.environment}
          {d.client && <span className="dim"> · {d.client}</span>}
          <span className="dim"> · {d.version ?? d.sha.slice(0, 7)}</span>
          <span className="dim"> · {STATE_LABEL[d.state]}</span>
        </span>
      ))}
    </div>
  )
}
