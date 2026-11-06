import { useEffect, useState } from 'react'
import { stageRank } from '../../../shared/deploy'
import type { Deployment, RepoInfo } from '../../../shared/types'
import { useDeployments } from '../lib/deployments'
import { timeAgo, useNow } from '../lib/format'
import { api, useSnapshot } from '../lib/store'
import { openRepoTab } from '../lib/tabs'
import { openModal } from '../lib/ui'
import { Avatar, checksTone, runTone, StatusIcon } from './ui'

/**
 * The repo's details beside a PR or issue: description, CI on the default branch, what's deployed where,
 * and the repo's other open PRs to switch between.
 */
export function RepoRail({ repo, pr }: { repo: string; pr?: number }) {
  const snapshot = useSnapshot()
  const now = useNow()
  const state = snapshot.repos[repo]
  const [info, setInfo] = useState<RepoInfo>()
  useEffect(() => {
    api.repoInfo(repo).then(setInfo, () => {})
  }, [repo])
  const { data } = useDeployments([repo])
  const latest = state?.runs.find((r) => r.branch === (info?.defaultBranch ?? state.defaultBranch) && r.status === 'completed')
  // Per environment, the live (newest successful) deployment, or the newest attempt if none succeeded; dev → prod.
  const byEnv = new Map<string, Deployment>()
  for (const d of data[0]?.deployments ?? []) {
    const seen = byEnv.get(d.environment)
    if (!seen || (seen.state !== 'success' && d.state === 'success')) byEnv.set(d.environment, d)
  }
  const envs = [...byEnv.values()].sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.environment.localeCompare(b.environment))

  return (
    <div className="rail">
      <button className="rail-repo" title="Open the repo in its tab" onClick={() => openRepoTab(repo)}>
        <span className="dim">{repo.split('/')[0]}/</span>
        <span className="strong">{repo.split('/')[1]}</span>
      </button>
      {info?.description && <p className="dim small">{info.description}</p>}
      <div className="rail-stats">
        {latest && (
          <span className="inline" title={`${latest.name}: ${latest.conclusion}`}>
            <StatusIcon tone={runTone(latest)} size={13} /> {info?.defaultBranch ?? state?.defaultBranch}
          </span>
        )}
        {info?.language && <span>{info.language}</span>}
        {info && <span>★ {info.stars}</span>}
        {info && <span>pushed {timeAgo(info.pushedAt, now)}</span>}
      </div>

      {envs.length > 0 && (
        <>
          <div className="rail-head">Deployed</div>
          {envs.map((d) => (
            <div key={d.environment} className="rail-env" title={`${d.environment}: ${d.version ?? d.sha.slice(0, 7)} by ${d.creator}`}>
              <span className={`deploy-dot state-${d.state}`} />
              <span className="rail-env-name">{d.environment}</span>
              <span className="dim small">{timeAgo(d.createdAt, now)}</span>
              <span className="rail-env-version mono small">{d.version ?? d.sha.slice(0, 7)}</span>
            </div>
          ))}
        </>
      )}

      {state && state.prs.length > 0 && (
        <>
          <div className="rail-head">Open pull requests · {state.prs.length}</div>
          {state.prs.map((p) => (
            <button key={p.number} className={`rail-pr${p.number === pr ? ' on' : ''}`} onClick={() => openModal({ kind: 'pr', repo, number: p.number })} title={p.title}>
              <StatusIcon tone={checksTone(p.checks)} size={12} />
              <span className="rail-pr-title">{p.title}</span>
              <Avatar src={p.authorAvatar} login={p.author} size={14} />
              <span className="dim small">#{p.number}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
