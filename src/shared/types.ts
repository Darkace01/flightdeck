// Types shared between the main process, preload bridge and renderer.

import type { ThemeColors } from './themes'

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

export type WidgetType = 'summary' | 'runs' | 'prs' | 'workflows' | 'events' | 'inbox' | 'insights'

export interface WidgetConfig {
  id: string
  type: WidgetType
  title?: string
  /** Repos to show; empty means all tracked repos. */
  repos: string[]
  options: Record<string, string | number | boolean>
}

/** A saved dashboard. The open one's widgets and layout are mirrored in Settings.widgets/layout while it's active. */
export interface SavedDashboard {
  id: string
  name: string
  widgets: WidgetConfig[]
  layout: LayoutItem[]
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
  /** Which palette is active; 'system' follows the OS light/dark setting. */
  mode: 'dark' | 'light' | 'system'
  darkTheme: string
  lightTheme: string
  /** Per-mode colour overrides layered on top of the chosen preset. */
  colorOverrides: { dark: Partial<ThemeColors>; light: Partial<ThemeColors> }
  /** 'theme' (preset's font), 'system', 'custom' (uses customFont) or a CSS font-family. */
  font: string
  customFont: string
  fontSize: number
  density: 'comfortable' | 'compact'
  closeToTray: boolean
  autoUpdate: boolean
  widgets: WidgetConfig[]
  layout: LayoutItem[]
  dashboards: SavedDashboard[]
  activeDashboard: string
}

export interface InboxItem {
  repo: string
  number: number
  title: string
  url: string
  kind: 'pr' | 'issue'
  author: string
  authorAvatar: string
  updatedAt: string
  isDraft?: boolean
  checks?: ChecksState
  reviewDecision?: PullRequest['reviewDecision']
}

export interface Inbox {
  reviewRequests: InboxItem[]
  myPrs: InboxItem[]
  assigned: InboxItem[]
}

export interface JobStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  startedAt: string | null
  completedAt: string | null
}

export interface Job {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  url: string
  steps: JobStep[]
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
  inbox?: Inbox
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

export interface PrComment {
  author: string
  authorAvatar: string
  createdAt: string
  bodyHtml: string
  url: string
  /** Set for reviews: APPROVED, CHANGES_REQUESTED, COMMENTED… */
  reviewState?: string
}

export interface PrFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

export interface PrCommit {
  sha: string
  message: string
  author: string
  authorAvatar?: string
  date: string
}

export interface PrCheck {
  name: string
  status: string
  conclusion: string | null
  url: string
}

/** Everything the in-app PR view shows, fetched on demand when it opens. */
export interface PrDetail {
  repo: string
  number: number
  title: string
  url: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  author: string
  authorAvatar: string
  createdAt: string
  base: string
  head: string
  bodyHtml: string
  additions: number
  deletions: number
  changedFiles: number
  mergeableState: string
  labels: { name: string; color: string }[]
  requestedReviewers: string[]
  comments: PrComment[]
  commits: PrCommit[]
  files: PrFile[]
  checks: PrCheck[]
}

export interface RepoInfo {
  fullName: string
  description: string | null
  url: string
  homepage: string | null
  private: boolean
  archived: boolean
  defaultBranch: string
  language: string | null
  stars: number
  forks: number
  openIssues: number
  topics: string[]
  pushedAt: string
  readmeHtml: string | null
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported'
  current: string
  /** Whether this install can update itself (Windows, AppImage) or only link to the download (macOS, .deb). */
  canInstall: boolean
  version?: string
  percent?: number
  url?: string
  error?: string
}

export interface PushbackApi {
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
  runJobs(repo: string, runId: number): Promise<Job[]>
  jobLog(repo: string, jobId: number): Promise<string>
  approvePr(repo: string, num: number): Promise<ActionResult>
  mergePr(repo: string, num: number, method: 'merge' | 'squash' | 'rebase'): Promise<ActionResult>
  exportSettings(): Promise<string>
  importSettings(json: string): Promise<ActionResult>
  openExternal(url: string): Promise<void>
  markRead(ids?: string[]): Promise<void>
  clearEvents(): Promise<void>
  updateStatus(): Promise<UpdateStatus>
  onUpdate(cb: (s: UpdateStatus) => void): () => void
  checkForUpdates(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  prDetail(repo: string, num: number): Promise<PrDetail>
  commentPr(repo: string, num: number, body: string): Promise<ActionResult>
  repoInfo(repo: string): Promise<RepoInfo>
  /** Fired when a notification is clicked: open this GitHub URL inside the app. */
  onNavigate(cb: (url: string) => void): () => void
}
