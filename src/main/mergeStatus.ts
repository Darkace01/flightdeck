import { toMergeStatus, type MergeStatus, type RawMergeStatus } from '../shared/mergeStatus'
import type { GitHub } from './github'

// One GraphQL query when a PR view opens: its merge state, merge queue entry, the base branch's protection rule,
// and each check with `isRequired` (which tells us which checks block the merge without needing admin rights).

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      isDraft mergeStateStatus mergeable reviewDecision isInMergeQueue
      mergeQueueEntry { position state estimatedTimeToMerge }
      autoMergeRequest { enabledBy { login } mergeMethod }
      baseRef {
        name
        branchProtectionRule {
          requiresApprovingReviews requiredApprovingReviewCount requiresCodeOwnerReviews
          requiresConversationResolution requiresStrictStatusChecks requiredStatusCheckContexts
        }
      }
      reviewThreads(first: 100) { nodes { isResolved } }
      latestOpinionatedReviews(first: 50) { nodes { author { login } state } }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion isRequired(pullRequestNumber: $number) }
                  ... on StatusContext { context state isRequired(pullRequestNumber: $number) }
                }
              }
            }
          }
        }
      }
    }
  }
}`

export async function fetchMergeStatus(gh: GitHub, repo: string, number: number): Promise<MergeStatus> {
  const [owner, name] = repo.split('/')
  const data = await gh.graphql<{ repository: { pullRequest: RawMergeStatus | null } }>(QUERY, { owner, name, number })
  if (!data.repository?.pullRequest) throw new Error(`${repo}#${number} was not found`)
  return toMergeStatus(data.repository.pullRequest)
}
