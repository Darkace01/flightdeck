import { describe, expect, it } from 'vitest'
import { favoritesFirst, FIRST_IMPORT_LIMIT, limitFirstImport, pollSlowdown } from '../../src/shared/repos'

const names = (n: number) => Array.from({ length: n }, (_, i) => `o/r${i}`)

describe('limitFirstImport', () => {
  it('caps the first import at 10', () => {
    expect(limitFirstImport(names(25), [], 0)).toHaveLength(FIRST_IMPORT_LIMIT)
    expect(limitFirstImport(names(25), [], 0)).toEqual(names(10))
  })
  it('puts favourites first, even from further down the list', () => {
    const picked = limitFirstImport(names(25), ['o/r20', 'O/R22'], 0)
    expect(picked.slice(0, 2)).toEqual(['o/r20', 'o/r22'])
    expect(picked).toHaveLength(10)
  })
  it('does not cap later imports', () => expect(limitFirstImport(names(25), [], 3)).toHaveLength(25))
  it('drops duplicates', () => expect(limitFirstImport(['o/a', 'O/A', 'o/b'], [], 0)).toEqual(['o/a', 'o/b']))
})

describe('favoritesFirst', () => {
  it('keeps each group in order', () => expect(favoritesFirst(['o/a', 'o/b', 'o/c', 'o/d'], ['o/d', 'o/b'])).toEqual(['o/b', 'o/d', 'o/a', 'o/c']))
})

describe('pollSlowdown', () => {
  it('leaves small sets alone and slows polling from 10 repos', () => {
    expect(pollSlowdown(0)).toBe(1)
    expect(pollSlowdown(9)).toBe(1)
    expect(pollSlowdown(10)).toBe(2)
    expect(pollSlowdown(19)).toBe(2)
    expect(pollSlowdown(20)).toBe(3)
    expect(pollSlowdown(500)).toBe(5)
  })
})
