import type { GraphCommit } from '../../../shared/types'

// Lane layout for the commit graph, kept free of React so it can be unit-tested.

const MAX_LANES = 18

/** A line through one half of a row: lane `from` to lane `to`, top half (up) or bottom half (down). */
export interface Seg {
  from: number
  to: number
  color: number
}

export interface Row {
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
