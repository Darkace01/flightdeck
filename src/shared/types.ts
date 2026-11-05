// Types shared between the main process, preload bridge and renderer.

export type RunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'

export interface WorkflowRun {
  repo: string
  id: number
  workflowId: number
  name: string
  title: string
  status: RunStatus
  conclusion: string | null
  event: string
  branch: string
  sha: string
  actor: string
  actorAvatar: string
  runNumber: number
  attempt: number
  createdAt: string
  startedAt: string
  updatedAt: string
  url: string
}

export type ChecksState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | 'EXPECTED' | null

export interface PullRequest {
  repo: string
  number: number
  title: string
  url: string
  author: string
  authorAvatar: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  branch: string
  additions: number
  deletions: number
  comments: number
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  checks: ChecksState
  labels: { name: string; color: string }[]
  reviewers: string[]
}

export interface DispatchInput {
  name: string
  description?: string
  required: boolean
  default?: string
  type: 'string' | 'boolean' | 'choice' | 'number' | 'environment'
  options?: string[]
}

export interface Workflow {
  repo: string
  id: number
  name: string
  path: string
  state: string
  url: string
  dispatchable: boolean
  inputs: DispatchInput[]
}

export interface RepoState {
  repo: string
  defaultBranch?: string
  runs: WorkflowRun[]
  prs: PullRequest[]
  workflows: Workflow[]
  error?: string
  fetchedAt?: number
}

export type EventKind =
  | 'run-started'
  | 'run-success'
  | 'run-failure'
  | 'run-cancelled'
  | 'pr-opened'
  | 'pr-merged'
  | 'pr-closed'
  | 'pr-ready'
  | 'pr-review'
  | 'pr-checks-failed'

export interface AppEvent {
  id: string
  ts: number
  repo: string
  kind: EventKind
  title: string
  body: string
  url: string
  /** Who triggered it (run actor / PR author), used for the "only mine" filter. */
  actor?: string
  read: boolean
}

export type WidgetType = 'summary' | 'runs' | 'prs' | 'workflows' | 'events'

export interface WidgetConfig {
  id: string
  type: WidgetType
  title?: string
  /** Repos to show; empty means all tracked repos. */
  repos: string[]
  options: Record<string, string | number | boolean>
}

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface NotifySettings {
  runStarted: boolean
  runSuccess: boolean
  runFailure: boolean
  prOpened: boolean
  prClosed: boolean
  prReady: boolean
  reviewRequested: boolean
  checksFailed: boolean
  /** Only notify about runs triggered by / PRs authored by the signed-in user. */
  onlyMine: boolean
}

export interface Settings {
  repos: string[]
  pollSeconds: number
  /** Faster interval used while any run is queued or in progress. */
  activePollSeconds: number
  notify: NotifySettings
  theme: 'dark' | 'light' | 'system'
  accent: string
  density: 'comfortable' | 'compact'
  closeToTray: boolean
  widgets: WidgetConfig[]
  layout: LayoutItem[]
}

export interface RateLimit {
  limit: number
  remaining: number
  reset: number
}

export interface Snapshot {
  auth: 'ok' | 'missing' | 'error'
  authSource?: 'pat' | 'gh'
  authError?: string
  viewer?: { login: string; avatarUrl: string }
  repos: Record<string, RepoState>
  events: AppEvent[]
  rateLimit?: RateLimit
  lastPoll?: number
  nextPoll?: number
  polling: boolean
}

export interface InitialState {
  snapshot: Snapshot
  settings: Settings
}

export interface RepoOption {
  fullName: string
  description: string | null
  private: boolean
  pushedAt: string
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface RepoDeckApi {
  getState(): Promise<InitialState>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  onSettings(cb: (s: Settings) => void): () => void
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  setToken(token: string | null): Promise<ActionResult>
  refresh(): Promise<void>
  listMyRepos(): Promise<RepoOption[]>
  dispatch(repo: string, workflowId: number, ref: string, inputs: Record<string, string>): Promise<ActionResult>
  rerun(repo: string, runId: number, failedOnly: boolean): Promise<ActionResult>
  cancel(repo: string, runId: number): Promise<ActionResult>
  openExternal(url: string): Promise<void>
  markRead(ids?: string[]): Promise<void>
  clearEvents(): Promise<void>
}
