import { useEffect, useState, type ComponentType } from 'react'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import type { RepoInfo, WidgetType } from '../../../shared/types'
import { timeAgo, useNow } from '../lib/format'
import { api, toast, updateSettings, useSettings, useSnapshot } from '../lib/store'
import { closeModal } from '../lib/ui'
import { InsightsWidget } from '../widgets/InsightsWidget'
import { PrsWidget } from '../widgets/PrsWidget'
import { RunsWidget } from '../widgets/RunsWidget'
import type { WidgetProps } from '../widgets/types'
import { WorkflowsWidget } from '../widgets/WorkflowsWidget'
import { Markdown } from './Markdown'
import { Empty, Modal, runTone, Segmented, StatusIcon } from './ui'

type Tab = 'overview' | 'prs' | 'runs' | 'workflows' | 'insights'

// The repo view reuses the dashboard widgets, scoped to this one repo.
const TAB_WIDGETS: Partial<Record<Tab, [WidgetType, ComponentType<WidgetProps>]>> = {
  prs: ['prs', PrsWidget],
  runs: ['runs', RunsWidget],
  workflows: ['workflows', WorkflowsWidget],
  insights: ['insights', InsightsWidget]
}

export function RepoModal({ repo }: { repo: string }) {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const now = useNow()
  const state = snapshot.repos[repo]
  const tracked = settings.repos.includes(repo)
  const [info, setInfo] = useState<RepoInfo>()
  const [error, setError] = useState<string>()
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    api.repoInfo(repo).then(setInfo, (e: Error) => setError(e.message))
  }, [repo])

  const latest = state?.runs.find((r) => r.branch === (info?.defaultBranch ?? state.defaultBranch) && r.status === 'completed')
  const running = state?.runs.filter((r) => r.status !== 'completed').length ?? 0
  const scoped = TAB_WIDGETS[tab]

  return (
    <Modal title={repo} onClose={closeModal} width={980}>
      <div className="pr-head">
        <h1 className="pr-title">
          <span>
            <span className="dim">{repo.split('/')[0]}/</span>
            {repo.split('/')[1]}
          </span>
          {info?.private && <span className="badge badge-muted">Private</span>}
          {info?.archived && <span className="badge badge-warn">Archived</span>}
        </h1>
        {info?.description && <p>{info.description}</p>}
        {info && (
          <div className="row-meta">
            {latest && (
              <span className="inline">
                <StatusIcon tone={runTone(latest)} size={13} /> {info.defaultBranch}
              </span>
            )}
            {info.language && <span>{info.language}</span>}
            <span>★ {info.stars.toLocaleString()}</span>
            <span>⑂ {info.forks.toLocaleString()}</span>
            <span>{info.openIssues.toLocaleString()} open issues &amp; PRs</span>
            <span>pushed {timeAgo(info.pushedAt, now)}</span>
            {info.homepage && (
              <button className="link" onClick={() => void api.openExternal(info.homepage!)}>
                {info.homepage.replace(/^https?:\/\//, '')}
              </button>
            )}
          </div>
        )}
        {info && info.topics.length > 0 && (
          <div className="inline">
            {info.topics.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="inline">
        <button
          className={`btn${tracked ? '' : ' btn-primary'}`}
          onClick={() => {
            void updateSettings({ repos: tracked ? settings.repos.filter((r) => r !== repo) : [...settings.repos, repo] })
            toast(tracked ? `Stopped watching ${repo}` : `Watching ${repo}`, 'ok')
          }}
        >
          {tracked ? 'Stop watching' : '+ Watch on dashboard'}
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => void navigator.clipboard.writeText(`gh repo clone ${repo}`).then(() => toast('Clone command copied', 'ok'))}>
          Copy clone command
        </button>
        <button className="btn" onClick={() => void api.openExternal(`https://github.com/${repo}`)}>
          Open in browser
        </button>
      </div>

      {error && <p className="del">Couldn't load {repo}: {error}</p>}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['overview', 'Overview'],
          ['prs', `Pull requests ${state?.prs.length ?? ''}`],
          ['runs', `Runs${running ? ` · ${running} running` : ''}`],
          ['workflows', 'Workflows'],
          ['insights', 'Insights']
        ]}
      />

      {tab === 'overview' &&
        (info ? (
          info.readmeHtml ? (
            <div className="readme">
              <Markdown html={info.readmeHtml} repo={repo} branch={info.defaultBranch} />
            </div>
          ) : (
            <Empty>This repository has no README.</Empty>
          )
        ) : (
          !error && <p className="dim">Loading…</p>
        ))}
      {scoped &&
        (tracked ? (
          (() => {
            const [type, Body] = scoped
            return (
              <div className="repo-tab">
                <Body widget={{ id: `repo-${type}`, type, repos: [repo], options: { ...WIDGET_DEFAULTS[type].options } }} filter="" />
              </div>
            )
          })()
        ) : (
          <Empty>Watch this repo to see its pull requests, runs and workflows here.</Empty>
        ))}
    </Modal>
  )
}
