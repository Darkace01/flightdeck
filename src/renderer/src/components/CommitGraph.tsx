import { memo, useMemo } from 'react'
import type { GraphCommit } from '../../../shared/types'
import { timeAgo, useNow } from '../lib/format'
import { Avatar } from './ui'

// Lane colours: distinct in both dark and light themes.
const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f778ba', '#a371f7', '#ff7b72', '#39c5cf', '#e3b341']
const LANE = 14
const ROW = 30
const MAX_LANES = 18

/** A line through one half of a row: lane `from` to lane `to`, top half (up) or bottom half (down). */
interface Seg {
  from: number
  to: number
  color: number
}

interface Row {
  commit: GraphCommit
  col: number
  color: number
  up: Seg[]
  down: Seg[]
}

/**
 * Lays commits (newest first, children before parents) out in lanes, like `git log --graph`.
 * Each lane waits for a particular commit; a commit takes the lane waiting for it (or a free one),
 * hands the lane to its first parent, and opens lanes for any other parents (merges).
 */
export function layoutGraph(commits: GraphCommit[]): { rows: Row[]; width: number } {
  const lanes: (string | null)[] = []
  const colors: number[] = []
  let next = 0
  let width = 1
  const rows = commits.map((commit) => {
    let col = lanes.indexOf(commit.sha)
    if (col < 0) {
      // A branch tip nothing above points at: start a new lane.
      col = lanes.indexOf(null)
      if (col < 0) col = lanes.push(null) - 1
      colors[col] = next++
    }
    const up: Seg[] = []
    lanes.forEach((l, i) => l && up.push({ from: i, to: l === commit.sha ? col : i, color: colors[i] }))
    // Other lanes that were also waiting for this commit join it here.
    lanes.forEach((l, i) => i !== col && l === commit.sha && (lanes[i] = null))

    const fresh = new Set<number>()
    const merges: Seg[] = []
    lanes[col] = commit.parents[0] ?? null
    for (const p of commit.parents.slice(1)) {
      let j = lanes.indexOf(p)
      if (j < 0) {
        j = lanes.indexOf(null)
        if (j < 0) j = lanes.push(null) - 1
        lanes[j] = p
        colors[j] = next++
        fresh.add(j)
      }
      merges.push({ from: col, to: j, color: colors[j] })
    }
    const down: Seg[] = [...merges]
    lanes.forEach((l, i) => l && !fresh.has(i) && down.push({ from: i, to: i, color: colors[i] }))
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    width = Math.max(width, up.length ? Math.max(...up.map((s) => s.from)) + 1 : 1, lanes.length, col + 1)
    return { commit, col, color: colors[col], up, down }
  })
  return { rows, width: Math.min(width, MAX_LANES) }
}

const x = (lane: number) => lane * LANE + LANE / 2 + 2
const color = (i: number) => COLORS[i % COLORS.length]

/** The graph cell for one row: lines coming in from above, going out below, and the commit's dot. */
function GraphCell({ row, width }: { row: Row; width: number }) {
  const mid = ROW / 2
  const path = (s: Seg, y1: number, y2: number) =>
    s.from === s.to ? `M${x(s.from)} ${y1}V${y2}` : `M${x(s.from)} ${y1}C${x(s.from)} ${(y1 + y2) / 2} ${x(s.to)} ${(y1 + y2) / 2} ${x(s.to)} ${y2}`
  const merge = row.commit.parents.length > 1
  const head = row.commit.refs.some((r) => r.startsWith('head:'))
  return (
    <svg className="graph-cell" width={width * LANE + 4} height={ROW} aria-hidden>
      {row.up.map((s, i) => (
        <path key={`u${i}`} d={path(s, 0, mid)} stroke={color(s.color)} />
      ))}
      {row.down.map((s, i) => (
        <path key={`d${i}`} d={path(s, mid, ROW)} stroke={color(s.color)} />
      ))}
      {head && <circle cx={x(row.col)} cy={mid} r={7} fill="none" stroke={color(row.color)} strokeWidth={1.5} />}
      <circle cx={x(row.col)} cy={mid} r={merge ? 3.5 : 4.5} fill={merge ? 'var(--bg)' : color(row.color)} stroke={color(row.color)} strokeWidth={merge ? 2 : 0} />
    </svg>
  )
}

/** Branch, remote and tag labels for a commit. */
export function RefChips({ refs }: { refs: string[] }) {
  return (
    <>
      {refs.map((r) => {
        const [kind, name] = [r.slice(0, r.indexOf(':')), r.slice(r.indexOf(':') + 1)]
        return (
          <span key={r} className={`ref-chip ref-${kind}`} title={{ head: 'Checked out', branch: 'Branch', remote: 'Remote branch', tag: 'Tag' }[kind]}>
            {kind === 'tag' ? '◆ ' : kind === 'remote' ? '☁ ' : kind === 'head' ? '⎇ ' : ''}
            {name}
          </span>
        )
      })}
    </>
  )
}

/** A commit list with the branch graph drawn alongside: lanes, merges and branch/tag labels. */
export const CommitGraph = memo(function CommitGraph({ commits, selected, onSelect, highlight, graph = true }: {
  commits: GraphCommit[]
  selected?: string
  onSelect?: (c: GraphCommit) => void
  /** SHAs to emphasise (search matches); the rest are dimmed. */
  highlight?: Set<string>
  /** Plain list without lanes (search results, file history), where commits aren't one continuous history. */
  graph?: boolean
}) {
  const now = useNow()
  const { rows, width } = useMemo(() => layoutGraph(commits), [commits])
  return (
    <div className="commit-graph" role="list">
      {rows.map((row) => {
        const c = row.commit
        return (
          <div
            key={c.sha}
            role="listitem"
            className={`graph-row${selected === c.sha ? ' on' : ''}${highlight && !highlight.has(c.sha) ? ' faded' : ''}${onSelect ? ' clickable' : ''}`}
            onClick={() => onSelect?.(c)}
          >
            {graph ? <GraphCell row={row} width={width} /> : <span className="graph-dot" style={{ background: color(row.color) }} />}
            <span className="graph-subject">
              <RefChips refs={c.refs} />
              <span className="graph-text" title={c.subject}>
                {c.subject}
              </span>
            </span>
            <span className="graph-author" title={c.email ?? c.author}>
              {c.avatar && <Avatar src={c.avatar} login={c.author} size={16} />}
              {c.author}
            </span>
            <span className="graph-date" title={new Date(c.date).toLocaleString()}>
              {timeAgo(c.date, now)}
            </span>
            <span className="graph-sha mono">{c.sha.slice(0, 7)}</span>
          </div>
        )
      })}
    </div>
  )
})

/** A unified diff, starting at the first hunk (the header lines repeat the file name shown above it). */
export function DiffView({ text }: { text?: string }) {
  if (text === undefined) return null
  const lines = text.split('\n')
  const body = lines.slice(Math.max(0, lines.findIndex((l) => l.startsWith('@@'))))
  if (!text.trim()) return <p className="dim small">No changes to show (binary file or mode change only).</p>
  return (
    <pre className="diff">
      {body.map((l, i) => (
        <div key={i} className={l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'ins' : l.startsWith('-') ? 'rem' : undefined}>
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}
