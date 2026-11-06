// What stands between a PR and being merged: required checks, reviews, conflicts, conversations, and its place in
// the merge queue. GitHub's GraphQL answers all of this in one query (see main/mergeStatus.ts); this module turns
// that raw shape into the list of blockers the PR view shows. It is pure, so it is unit-tested without GitHub.

export type RawContext =
  | { __typename: 'CheckRun'; name: string; status: string; conclusion: string | null; isRequired: boolean }
  | { __typename: 'StatusContext'; context: string; state: string; isRequired: boolean }

export interface RawMergeStatus {
  isDraft: boolean
  mergeStateStatus: string
  mergeable: string
  reviewDecision: string | null
  isInMergeQueue: boolean
  mergeQueueEntry: { position: number; state: string; estimatedTimeToMerge: number | null } | null
  autoMergeRequest: { enabledBy: { login: string } | null; mergeMethod: string } | null
  baseRef: {
    name: string
    branchProtectionRule: {
      requiresApprovingReviews: boolean
      requiredApprovingReviewCount: number | null
      requiresCodeOwnerReviews: boolean
      requiresConversationResolution: boolean
      requiresStrictStatusChecks: boolean
      requiredStatusCheckContexts: string[]
    } | null
  } | null
  reviewThreads: { nodes: { isResolved: boolean }[] }
  latestOpinionatedReviews: { nodes: { author: { login: string } | null; state: string }[] }
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: RawContext[] } } | null } }[] }
}

export interface MergeCheck {
  name: string
  required: boolean
  state: 'pass' | 'fail' | 'pending'
}

export type BlockerKind = 'draft' | 'conflict' | 'behind' | 'checks' | 'missing-check' | 'changes' | 'review' | 'conversations' | 'other'

export interface Blocker {
  kind: BlockerKind
  text: string
}

export interface MergeStatus {
  /** GitHub's mergeStateStatus: CLEAN, BLOCKED, BEHIND, DIRTY, DRAFT, UNSTABLE, HAS_HOOKS or UNKNOWN. */
  state: string
  base: string
  /** True when a branch protection rule applies to the base branch. */
  protected: boolean
  /** Set while the PR sits in the merge queue. */
  queue?: { position: number; state: string; etaSeconds: number | null }
  /** Set when auto-merge is switched on: the PR merges itself once the blockers clear. */
  autoMerge?: { by: string | null; method: string }
  approvals: { have: number; need: number; codeOwners: boolean }
  /** Required checks first, then failing, then the rest. */
  checks: MergeCheck[]
  blockers: Blocker[]
}

const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAIL = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED', 'STALE'])

function toChecks(contexts: RawContext[]): MergeCheck[] {
  const checks = contexts.map((c): MergeCheck => {
    if (c.__typename === 'CheckRun') {
      const done = c.status === 'COMPLETED'
      const conclusion = (c.conclusion ?? '').toUpperCase()
      return { name: c.name, required: c.isRequired, state: !done ? 'pending' : PASS.has(conclusion) ? 'pass' : 'fail' }
    }
    const state = c.state.toUpperCase()
    return { name: c.context, required: c.isRequired, state: state === 'SUCCESS' ? 'pass' : FAIL.has(state) ? 'fail' : 'pending' }
  })
  const rank = (c: MergeCheck) => (c.required ? 0 : 3) + (c.state === 'fail' ? 0 : c.state === 'pending' ? 1 : 2)
  return checks.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function toMergeStatus(raw: RawMergeStatus): MergeStatus {
  const rule = raw.baseRef?.branchProtectionRule ?? null
  const checks = toChecks(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [])
  const reviews = raw.latestOpinionatedReviews.nodes
  const approvals = {
    have: reviews.filter((r) => r.state === 'APPROVED').length,
    need: rule?.requiresApprovingReviews ? (rule.requiredApprovingReviewCount ?? 1) : 0,
    codeOwners: !!rule?.requiresCodeOwnerReviews
  }

  const blockers: Blocker[] = []
  if (raw.isDraft || raw.mergeStateStatus === 'DRAFT') blockers.push({ kind: 'draft', text: 'This is a draft. Mark it ready for review first.' })
  if (raw.mergeable === 'CONFLICTING' || raw.mergeStateStatus === 'DIRTY') blockers.push({ kind: 'conflict', text: 'Merge conflicts with the base branch.' })
  if (raw.mergeStateStatus === 'BEHIND') blockers.push({ kind: 'behind', text: `The branch is behind ${raw.baseRef?.name ?? 'the base branch'} and must be updated first.` })

  const required = checks.filter((c) => c.required)
  const failing = required.filter((c) => c.state === 'fail')
  const pending = required.filter((c) => c.state === 'pending')
  if (failing.length) blockers.push({ kind: 'checks', text: `${plural(failing.length, 'required check')} failing: ${failing.map((c) => c.name).join(', ')}.` })
  if (pending.length) blockers.push({ kind: 'checks', text: `Waiting on ${plural(pending.length, 'required check')}: ${pending.map((c) => c.name).join(', ')}.` })
  // A required context that no check has reported yet blocks the merge just the same.
  const seen = new Set(checks.map((c) => c.name))
  const missing = (rule?.requiredStatusCheckContexts ?? []).filter((n) => !seen.has(n))
  if (missing.length) blockers.push({ kind: 'missing-check', text: `${plural(missing.length, 'required check')} not reported yet: ${missing.join(', ')}.` })

  if (raw.reviewDecision === 'CHANGES_REQUESTED') {
    const by = reviews.filter((r) => r.state === 'CHANGES_REQUESTED').map((r) => r.author?.login ?? 'someone')
    blockers.push({ kind: 'changes', text: `Changes requested${by.length ? ` by ${by.join(', ')}` : ''}.` })
  } else if (raw.reviewDecision === 'REVIEW_REQUIRED') {
    const detail = approvals.need ? ` (${approvals.have} of ${approvals.need} approvals${approvals.codeOwners ? ', code owners must review' : ''})` : ''
    blockers.push({ kind: 'review', text: `An approving review is required${detail}.` })
  }

  const unresolved = raw.reviewThreads.nodes.filter((t) => !t.isResolved).length
  if (rule?.requiresConversationResolution && unresolved) blockers.push({ kind: 'conversations', text: `${plural(unresolved, 'conversation')} must be resolved.` })

  // GitHub says BLOCKED but we found no reason (e.g. a repository ruleset): don't claim it's clear.
  if (raw.mergeStateStatus === 'BLOCKED' && !blockers.length) blockers.push({ kind: 'other', text: 'Blocked by a branch protection rule or ruleset that Pushback cannot see in detail.' })

  const queue = raw.mergeQueueEntry
  return {
    state: raw.mergeStateStatus,
    base: raw.baseRef?.name ?? '',
    protected: !!rule || raw.mergeStateStatus === 'BLOCKED',
    queue: raw.isInMergeQueue && queue ? { position: queue.position, state: queue.state, etaSeconds: queue.estimatedTimeToMerge } : undefined,
    autoMerge: raw.autoMergeRequest ? { by: raw.autoMergeRequest.enabledBy?.login ?? null, method: raw.autoMergeRequest.mergeMethod } : undefined,
    approvals,
    checks,
    blockers
  }
}
