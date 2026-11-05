import { memo } from 'react'
import type { Inbox } from '../../../shared/types'
import { Avatar, checksTone, Empty, Segmented, StatusIcon } from '../components/ui'
import { matches, timeAgo, useNow } from '../lib/format'
import { api, updateSettings, useSettings, useSnapshot } from '../lib/store'
import type { WidgetProps } from './types'

type Tab = keyof Inbox

/** Cross-repo "what needs me" list, backed by GitHub search, so it isn't limited to tracked repos. */
export const InboxWidget = memo(function InboxWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const now = useNow()
  const tab = (widget.options.tab as Tab) || 'reviewRequests'
  const inbox = snapshot.inbox
  const setTab = (t: Tab) =>
    void updateSettings({
      widgets: settings.widgets.map((w) => (w.id === widget.id ? { ...w, options: { ...w.options, tab: t } } : w))
    })

  const items = (inbox?.[tab] ?? []).filter((i) => !filter || matches(`${i.repo} #${i.number} ${i.title} ${i.author}`, filter))

  return (
    <div className="inbox">
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          ['reviewRequests', `Reviews ${inbox?.reviewRequests.length ?? ''}`],
          ['myPrs', `My PRs ${inbox?.myPrs.length ?? ''}`],
          ['assigned', `Issues ${inbox?.assigned.length ?? ''}`]
        ]}
      />
      {!inbox ? (
        <Empty>Loading…</Empty>
      ) : !items.length ? (
        <Empty>{tab === 'reviewRequests' ? 'No reviews waiting on you. 🎉' : 'Nothing here.'}</Empty>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.url} className="row clickable" onClick={() => void api.openExternal(i.url)}>
              {i.kind === 'pr' ? <StatusIcon tone={checksTone(i.checks ?? null)} /> : <StatusIcon tone="warn" title="Issue" />}
              <div className="row-main">
                <div className="row-title">
                  {i.isDraft && <span className="badge badge-muted">Draft</span>}
                  <span className="strong">{i.title}</span>
                </div>
                <div className="row-meta">
                  <span className="chip">{i.repo}</span>
                  <span>#{i.number}</span>
                  <Avatar src={i.authorAvatar} login={i.author} size={14} />
                  <span>{i.author}</span>
                  {i.reviewDecision === 'APPROVED' && <span className="add">approved</span>}
                  {i.reviewDecision === 'CHANGES_REQUESTED' && <span className="del">changes requested</span>}
                </div>
              </div>
              <div className="row-side">
                <span className="dim small">{timeAgo(i.updatedAt, now)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
