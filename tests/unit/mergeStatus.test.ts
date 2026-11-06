import { describe, expect, it } from 'vitest'
import { toMergeStatus, type RawContext, type RawMergeStatus } from '../../src/shared/mergeStatus'
import { fetchMergeStatus } from '../../src/main/mergeStatus'
import type { GitHub } from '../../src/main/github'

const check = (name: string, over: Partial<Extract<RawContext, { __typename: 'CheckRun' }>> = {}): RawContext => ({
  __typename: 'CheckRun',
  name,
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
  isRequired: true,
  ...over
})

const raw = (over: Partial<RawMergeStatus> = {}, contexts: RawContext[] = []): RawMergeStatus => ({
  isDraft: false,
  mergeStateStatus: 'CLEAN',
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  isInMergeQueue: false,
  mergeQueueEntry: null,
  autoMergeRequest: null,
  baseRef: { name: 'main', branchProtectionRule: null },
  reviewThreads: { nodes: [] },
  latestOpinionatedReviews: { nodes: [] },
  commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: contexts } } } }] },
  ...over
})

const rule = (over: object = {}) => ({
  requiresApprovingReviews: true,
  requiredApprovingReviewCount: 2,
  requiresCodeOwnerReviews: false,
  requiresConversationResolution: false,
  requiresStrictStatusChecks: false,
  requiredStatusCheckContexts: [] as string[],
  ...over
})

describe('toMergeStatus', () => {
  it('reports a clean PR with no blockers', () => {
    const s = toMergeStatus(raw({}, [check('build')]))
    expect(s.blockers).toEqual([])
    expect(s.checks).toEqual([{ name: 'build', required: true, state: 'pass' }])
  })

  it('lists failing and pending required checks but not optional ones', () => {
    const s = toMergeStatus(
      raw({ mergeStateStatus: 'BLOCKED' }, [check('lint', { conclusion: 'FAILURE' }), check('e2e', { status: 'IN_PROGRESS', conclusion: null }), check('docs', { conclusion: 'FAILURE', isRequired: false })])
    )
    expect(s.blockers.map((b) => b.text)).toEqual(['1 required check failing: lint.', 'Waiting on 1 required check: e2e.'])
    // Required checks sort ahead of optional ones, failures first.
    expect(s.checks.map((c) => c.name)).toEqual(['lint', 'e2e', 'docs'])
  })

  it('flags required checks that have not reported at all', () => {
    const s = toMergeStatus(raw({ mergeStateStatus: 'BLOCKED', baseRef: { name: 'main', branchProtectionRule: rule({ requiredStatusCheckContexts: ['build', 'deploy'] }) } }, [check('build')]))
    expect(s.blockers).toEqual([{ kind: 'missing-check', text: '1 required check not reported yet: deploy.' }])
  })

  it('counts approvals against the rule and names who requested changes', () => {
    const base = { baseRef: { name: 'main', branchProtectionRule: rule() } }
    const need = toMergeStatus(raw({ ...base, reviewDecision: 'REVIEW_REQUIRED', latestOpinionatedReviews: { nodes: [{ author: { login: 'bob' }, state: 'APPROVED' }] } }))
    expect(need.approvals).toEqual({ have: 1, need: 2, codeOwners: false })
    expect(need.blockers[0].text).toBe('An approving review is required (1 of 2 approvals).')
    const changes = toMergeStatus(raw({ reviewDecision: 'CHANGES_REQUESTED', latestOpinionatedReviews: { nodes: [{ author: { login: 'cy' }, state: 'CHANGES_REQUESTED' }, { author: null, state: 'CHANGES_REQUESTED' }] } }))
    expect(changes.blockers[0].text).toBe('Changes requested by cy, someone.')
  })

  it('reports drafts, conflicts, being behind and unresolved conversations', () => {
    expect(toMergeStatus(raw({ isDraft: true, mergeStateStatus: 'DRAFT' })).blockers.map((b) => b.kind)).toEqual(['draft'])
    expect(toMergeStatus(raw({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })).blockers.map((b) => b.kind)).toEqual(['conflict'])
    expect(toMergeStatus(raw({ mergeStateStatus: 'BEHIND' })).blockers[0].text).toBe('The branch is behind main and must be updated first.')
    const talk = toMergeStatus(
      raw({ baseRef: { name: 'main', branchProtectionRule: rule({ requiresConversationResolution: true }) }, reviewThreads: { nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }] } })
    )
    expect(talk.blockers.map((b) => b.text)).toEqual(['2 conversations must be resolved.'])
  })

  it('never claims BLOCKED is clear when the reason is hidden (e.g. a ruleset)', () => {
    expect(toMergeStatus(raw({ mergeStateStatus: 'BLOCKED' })).blockers.map((b) => b.kind)).toEqual(['other'])
  })

  it('shows the merge queue position and auto-merge', () => {
    const s = toMergeStatus(
      raw({ isInMergeQueue: true, mergeQueueEntry: { position: 3, state: 'AWAITING_CHECKS', estimatedTimeToMerge: 120 }, autoMergeRequest: { enabledBy: { login: 'ann' }, mergeMethod: 'SQUASH' } })
    )
    expect(s.queue).toEqual({ position: 3, state: 'AWAITING_CHECKS', etaSeconds: 120 })
    expect(s.autoMerge).toEqual({ by: 'ann', method: 'SQUASH' })
  })

  it('reads legacy commit statuses', () => {
    const s = toMergeStatus(
      raw({}, [
        { __typename: 'StatusContext', context: 'ci/jenkins', state: 'PENDING', isRequired: true },
        { __typename: 'StatusContext', context: 'ci/other', state: 'ERROR', isRequired: true }
      ])
    )
    expect(s.checks.map((c) => [c.name, c.state])).toEqual([
      ['ci/other', 'fail'],
      ['ci/jenkins', 'pending']
    ])
  })
})

describe('fetchMergeStatus', () => {
  const gh = (pullRequest: RawMergeStatus | null) => ({ graphql: async () => ({ repository: { pullRequest } }) }) as unknown as GitHub
  it('maps the GraphQL answer', async () => expect((await fetchMergeStatus(gh(raw()), 'o/r', 1)).base).toBe('main'))
  it('fails clearly when the PR is gone', async () => await expect(fetchMergeStatus(gh(null), 'o/r', 9)).rejects.toThrow('o/r#9 was not found'))
})
