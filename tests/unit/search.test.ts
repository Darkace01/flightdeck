import { describe, expect, it, vi } from 'vitest'
import type { GitHub } from '../../src/main/github'
import { runSearch } from '../../src/main/search'
import { buildSearchQuery, cleanSavedSearches, filterSearchItems, SEARCH_PRESETS } from '../../src/shared/search'
import type { SearchItem } from '../../src/shared/types'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))

const item = (over: Partial<SearchItem>): SearchItem => ({
  repo: 'acme/api', number: 1, title: 't', url: 'u', kind: 'pr', state: 'open', author: 'alice', authorAvatar: '', createdAt: '', updatedAt: '', comments: 0, isDraft: false, labels: [], ...over
})
const has = (hay: string, q: string) => hay.toLowerCase().includes(q.toLowerCase())

describe('buildSearchQuery', () => {
  it('adds the type from the kind and replaces any typed one', () => {
    expect(buildSearchQuery('is:open author:@me', 'pr')).toBe('is:open author:@me is:pr')
    expect(buildSearchQuery('is:issue is:open type:pr', 'issue')).toBe('is:open is:issue')
  })
  it('rejects empty and oversized searches', () => {
    expect(() => buildSearchQuery('  is:pr ', 'pr')).toThrow(/Enter a search/)
    expect(() => buildSearchQuery('x'.repeat(300), 'pr')).toThrow(/at most/)
  })
  it('every preset is a valid search', () => {
    for (const p of SEARCH_PRESETS) expect(() => buildSearchQuery(p.query, p.kind)).not.toThrow()
  })
})

describe('filterSearchItems', () => {
  const items = [
    item({ number: 1, repo: 'acme/api', author: 'alice', labels: [{ name: 'bug', color: '' }] }),
    item({ number: 2, repo: 'globex/web', author: 'bob', isDraft: true }),
    item({ number: 3, repo: 'globex/tool', author: 'alice' })
  ]
  it('filters by org, author, label and drafts', () => {
    expect(filterSearchItems(items, { repo: 'globex' }, has).map((i) => i.number)).toEqual([2, 3])
    expect(filterSearchItems(items, { author: 'ali' }, has).map((i) => i.number)).toEqual([1, 3])
    expect(filterSearchItems(items, { label: 'bug' }, has).map((i) => i.number)).toEqual([1])
    expect(filterSearchItems(items, { hideDrafts: true }, has).map((i) => i.number)).toEqual([1, 3])
    expect(filterSearchItems(items, { repo: '', author: '' }, has)).toHaveLength(3)
  })
})

describe('cleanSavedSearches', () => {
  it('drops malformed and duplicate entries and defaults the kind', () => {
    const out = cleanSavedSearches([{ id: 'a', name: 'A', query: 'q', kind: 'issue' }, { id: 'a', name: 'dup', query: 'q' }, { id: 'b', name: 'B', query: 'q', kind: 'weird' }, null, { id: 3 }])
    expect(out).toEqual([{ id: 'a', name: 'A', query: 'q', kind: 'issue' }, { id: 'b', name: 'B', query: 'q', kind: 'pr' }])
    expect(cleanSavedSearches('nope')).toEqual([])
  })
  it('is applied when settings load: old files get an empty list, bad ones are cleaned', async () => {
    const { normalizeSettings } = await import('../../src/main/store')
    expect(normalizeSettings({ repos: [] }).savedSearches).toEqual([])
    expect(normalizeSettings({ savedSearches: [{ id: 'x', name: 'X', query: 'is:open', kind: 'pr' }, { id: 1 }] as never }).savedSearches).toHaveLength(1)
  })
})

describe('runSearch', () => {
  it('asks GitHub once, with the type added, and maps cross-org results', async () => {
    const get = vi.fn(async () => ({
      total_count: 120,
      incomplete_results: false,
      items: [
        { number: 5, title: 'Fix it', html_url: 'https://github.com/other/tool/pull/5', state: 'closed', repository_url: 'https://api.github.com/repos/other/tool', user: { login: 'me', avatar_url: 'a' },
          created_at: 'c', updated_at: 'u', comments: 2, draft: false, labels: [{ name: 'bug', color: 'f00' }], pull_request: { merged_at: '2026-01-01T00:00:00Z' } }
      ]
    }))
    const r = await runSearch({ get } as unknown as GitHub, 'is:open author:@me', 'pr')
    expect(get).toHaveBeenCalledTimes(1)
    const path = (get.mock.calls[0] as unknown as [string])[0]
    expect(decodeURIComponent(path)).toContain('q=is:open author:@me is:pr')
    expect(r.total).toBe(120)
    expect(r.items[0]).toMatchObject({ repo: 'other/tool', number: 5, state: 'merged', author: 'me', kind: 'pr' })
  })
  it('rejects an empty query without calling GitHub', async () => {
    const get = vi.fn()
    await expect(runSearch({ get } as unknown as GitHub, '', 'issue')).rejects.toThrow()
    expect(get).not.toHaveBeenCalled()
  })
})
