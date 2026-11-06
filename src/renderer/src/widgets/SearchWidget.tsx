import { memo, useMemo } from 'react'
import { filterSearchItems } from '../../../shared/search'
import { Avatar, Empty, IconButton, Skeleton, StatusIcon } from '../components/ui'
import { matches, timeAgo, useNow } from '../lib/format'
import { openInApp } from '../lib/open'
import { useSearch } from '../lib/search'
import type { WidgetProps } from './types'

/** A saved GitHub search: open PRs or issues across every repo and org you can see, not just the tracked ones. */
export const SearchWidget = memo(function SearchWidget({ widget, filter }: WidgetProps) {
  const now = useNow()
  const query = String(widget.options.query ?? '')
  const kind = widget.options.kind === 'issue' ? 'issue' : 'pr'
  const { result, error, loading, refresh } = useSearch(query, kind)

  const items = useMemo(() => {
    const filtered = filterSearchItems(result?.items ?? [], widget.options, matches)
    return filter ? filtered.filter((i) => matches(`${i.repo} #${i.number} ${i.title} ${i.author}`, filter)) : filtered
  }, [result, widget.options, filter])

  if (!query.trim()) return <Empty>Set a search in the widget settings, for example: is:open author:@me</Empty>
  if (error && !result) return <Empty>Search failed: {error}</Empty>
  if (loading || !result) return <Skeleton />

  return (
    <div className="search-widget">
      <div className="row-meta search-meta">
        <span title={query}>
          {result.total.toLocaleString()} match{result.total === 1 ? '' : 'es'}
          {result.total > result.items.length && ` · showing the ${result.items.length} most recent`}
        </span>
        <IconButton icon="refresh" title="Search again" onClick={refresh} />
      </div>
      {!items.length ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.url} className="row clickable" onClick={() => openInApp(i.url)}>
              <StatusIcon tone={i.state === 'merged' ? 'ok' : i.state === 'closed' ? 'muted' : 'warn'} title={i.state} />
              <div className="row-main">
                <div className="row-title">
                  {i.isDraft && <span className="badge badge-muted">Draft</span>}
                  <span className="strong">{i.title}</span>
                  {i.labels.map((l) => (
                    <span key={l.name} className="label" style={{ ['--label' as string]: `#${l.color}` }}>
                      {l.name}
                    </span>
                  ))}
                </div>
                <div className="row-meta">
                  <span className="chip">{i.repo}</span>
                  <span>#{i.number}</span>
                  <Avatar src={i.authorAvatar} login={i.author} size={14} />
                  <span>{i.author}</span>
                  {i.comments > 0 && <span>💬 {i.comments}</span>}
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
