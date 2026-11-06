import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../src/shared/types'
import { layoutGraph } from '../../src/renderer/src/lib/graph'

const c = (sha: string, parents: string[] = []): GraphCommit => ({ sha, parents, subject: sha, author: 'a', date: '2026-01-01T00:00:00Z', refs: [] })

describe('layoutGraph', () => {
  it('keeps a straight history in one lane', () => {
    const { rows, width } = layoutGraph([c('c', ['b']), c('b', ['a']), c('a')])
    expect(width).toBe(1)
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0])
    // The root commit has nothing below it.
    expect(rows[2].down).toEqual([])
  })

  it('draws a merge: a second lane opens for the merged branch and closes where it forks', () => {
    //   m (merge of b2 into a2)
    //   |\
    //   a2 b2
    //   |  b1
    //   | /
    //   base
    const { rows, width } = layoutGraph([c('m', ['a2', 'b2']), c('a2', ['base']), c('b2', ['b1']), c('b1', ['base']), c('base')])
    expect(width).toBe(2)
    const byId = Object.fromEntries(rows.map((r) => [r.commit.sha, r]))
    expect(byId.m.col).toBe(0)
    // The merge commit sends a line to the new lane.
    expect(byId.m.down).toContainEqual(expect.objectContaining({ from: 0, to: 1 }))
    expect(byId.a2.col).toBe(0)
    expect(byId.b2.col).toBe(1)
    expect(byId.b1.col).toBe(1)
    // At the fork point both lanes come into the same commit.
    expect(byId.base.up.map((s) => s.to)).toEqual([0, 0])
  })

  it('gives each branch tip its own lane and colour', () => {
    const { rows } = layoutGraph([c('x', ['base']), c('y', ['base']), c('base')])
    expect(rows[0].col).toBe(0)
    expect(rows[1].col).toBe(1)
    expect(rows[0].color).not.toBe(rows[1].color)
  })

  it('reuses a freed lane instead of growing wider', () => {
    // Two short side branches, one after the other, should share lane 1.
    const commits = [c('m2', ['m1', 's2']), c('s2', ['m1']), c('m1', ['a', 's1']), c('s1', ['a']), c('a')]
    const { rows, width } = layoutGraph(commits)
    expect(width).toBe(2)
    expect(rows.find((r) => r.commit.sha === 's1')!.col).toBe(1)
    expect(rows.find((r) => r.commit.sha === 's2')!.col).toBe(1)
  })

  it('joins a merge into a lane already waiting for the same parent', () => {
    // Both tips have parent p; the merge commit also points at p through its second parent.
    const { rows } = layoutGraph([c('t1', ['p']), c('m', ['q', 'p']), c('q', ['p']), c('p')])
    const m = rows.find((r) => r.commit.sha === 'm')!
    expect(m.down.some((s) => s.from === m.col && s.to === 0)).toBe(true)
  })

  it('caps very wide graphs', () => {
    const tips = Array.from({ length: 30 }, (_, i) => c(`t${i}`, ['root']))
    const { width } = layoutGraph([...tips, c('root')])
    expect(width).toBe(18)
  })

  it('handles commits whose parents are outside the list (a partial history)', () => {
    const { rows } = layoutGraph([c('b', ['a']), c('a', ['not-loaded'])])
    expect(rows[1].down).toContainEqual({ from: 0, to: 0, color: rows[1].color })
  })
})
