import { memo } from 'react'
import type { EventKind } from '../../../shared/types'
import { Empty, StatusIcon } from '../components/ui'
import { matches, timeAgo, useNow } from '../lib/format'
import { api, useSettings, useSnapshot, widgetRepos } from '../lib/store'
import type { WidgetProps } from './types'

const TONE: Record<EventKind, 'ok' | 'bad' | 'warn' | 'muted' | 'run'> = {
  'run-started': 'run',
  'run-success': 'ok',
  'run-failure': 'bad',
  'run-cancelled': 'muted',
  'pr-opened': 'warn',
  'pr-merged': 'ok',
  'pr-closed': 'muted',
  'pr-ready': 'warn',
  'pr-review': 'warn',
  'pr-checks-failed': 'bad'
}

export const EventsWidget = memo(function EventsWidget({ widget, filter }: WidgetProps) {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const now = useNow()
  // Activity also includes review requests from untracked repos, so only narrow when the widget picks repos.
  const repos = widget.repos.length ? widgetRepos(widget.repos, settings.repos) : null
  const events = snapshot.events.filter(
    (e) =>
      (!repos || repos.includes(e.repo)) &&
      (!widget.options.unreadOnly || !e.read) &&
      (!filter || matches(`${e.repo} ${e.title} ${e.body}`, filter))
  )

  if (!events.length) return <Empty>Nothing yet. Activity on your repos shows up here as it happens.</Empty>

  return (
    <ul className="list">
      {events.map((e) => (
        <li
          key={e.id}
          className={`row clickable${e.read ? ' read' : ''}`}
          onClick={() => {
            void api.markRead([e.id])
            void api.openExternal(e.url)
          }}
        >
          <StatusIcon tone={TONE[e.kind]} />
          <div className="row-main">
            <div className="row-title">
              {!e.read && <span className="dot" />}
              <span className="strong">{e.title}</span>
            </div>
            <div className="row-meta">{e.body}</div>
          </div>
          <div className="row-side">
            <span className="dim small">{timeAgo(e.ts, now)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
})
