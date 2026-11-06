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
  /** Repos open as tabs, in order. The dashboard tab is always first and isn't listed. */
  openTabs: string[]
  /** Repos pinned as tabs: always open, shown as icons first. A repo is in pinnedTabs or openTabs, never both. */
  pinnedTabs: string[]
  /** "home" (the dashboard) or one of openTabs / pinnedTabs. */
  activeTab: string
  /** Tabs across the top, or down a sidebar on the left. */
  tabLayout: 'horizontal' | 'vertical'
  /** Whether the left repo sidebar is shown. */
  sidebarOpen: boolean
  /** Local clone folder for each repo that has one linked. */
  localPaths: Record<string, string>
  /** Command used for "Open in editor", given the folder as its argument (e.g. code, cursor, idea). */
  editorCommand: string
  /** Look for new clones in the home folder at startup and link them (watching is still up to the user). */
  autoLinkClones: boolean
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
  /** Set when the action created something (an issue, PR, release…). */
  url?: string
  number?: number
}

export interface Label {
  name: string
  color: string
  description?: string | null
}

export interface IssueSummary {
  repo: string
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  author: string
  authorAvatar: string
  createdAt: string
  updatedAt: string
  comments: number
  labels: Label[]
  assignees: string[]
}

export interface IssueDetail extends Omit<IssueSummary, 'comments'> {
  bodyHtml: string
  stateReason: string | null
  timeline: PrComment[]
}

export interface BranchInfo {
  name: string
  sha: string
  isDefault: boolean
  date: string
  message: string
  author: string
  authorAvatar?: string
  /** Commits on this branch that the default branch doesn't have, and vice versa. */
  ahead: number
  behind: number
  openPr?: number
}

export interface CommitInfo {
  sha: string
  message: string
  author: string
  authorAvatar?: string
  date: string
  url: string
}

export interface ReleaseInfo {
  id: number
  tag: string
  name: string
  url: string
  draft: boolean
  prerelease: boolean
  publishedAt: string | null
  createdAt: string
  author: string
  bodyHtml: string
  assets: { name: string; size: number; downloads: number; url: string }[]
}

export interface NewPr {
  title: string
  head: string
  base: string
  body: string
  draft: boolean
}

export interface NewRelease {
  tag: string
  target: string
  name: string
  body: string
  draft: boolean
  prerelease: boolean
  generateNotes: boolean
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

/** One changed file from `git status`: X (index/staged) and Y (worktree) status letters, "?" for untracked. */
export interface GitFile {
  path: string
  index: string
  worktree: string
}

export interface GitStatus {
  path: string
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  stashes: number
}

export interface GitCommit {
  sha: string
  subject: string
  author: string
  date: string
  refs: string
}

export interface GitBranch {
  name: string
  upstream: string | null
  /** e.g. "ahead 2, behind 1", or "gone" when the remote branch was deleted. */
  track: string
  current: boolean
  date: string
}

export type GitAction =
  | 'fetch'
  | 'pull'
  | 'push'
  | 'switch'
  | 'create-branch'
  | 'stage'
  | 'unstage'
  | 'stage-all'
  | 'unstage-all'
  | 'discard'
  | 'commit'
  | 'stash'
  | 'stash-pop'

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

/** A clone of a GitHub repo found on disk by "Find repos on this computer". */
export interface FoundClone {
  repo: string
  path: string
}

/** An editor or IDE found on this machine; `command` is what Settings.editorCommand is set to. */
export interface EditorOption {
  id: string
  name: string
  command: string
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
  listIssues(repo: string, state: 'open' | 'closed'): Promise<IssueSummary[]>
  issueDetail(repo: string, num: number): Promise<IssueDetail>
  createIssue(repo: string, issue: { title: string; body: string; labels: string[] }): Promise<ActionResult>
  setIssueState(repo: string, num: number, state: 'open' | 'closed', reason?: 'completed' | 'not_planned'): Promise<ActionResult>
  listLabels(repo: string): Promise<Label[]>
  listBranches(repo: string, defaultBranch: string): Promise<BranchInfo[]>
  createBranch(repo: string, name: string, from: string): Promise<ActionResult>
  deleteBranch(repo: string, name: string): Promise<ActionResult>
  listCommits(repo: string, ref?: string): Promise<CommitInfo[]>
  listReleases(repo: string): Promise<ReleaseInfo[]>
  createRelease(repo: string, release: NewRelease): Promise<ActionResult>
  createPr(repo: string, pr: NewPr): Promise<ActionResult>
  /** Asks for a folder and links it as the repo's local clone (its remote must point at the repo). */
  gitLink(repo: string): Promise<ActionResult>
  /** Asks for a parent folder and clones the repo into it. */
  gitClone(repo: string): Promise<ActionResult>
  gitUnlink(repo: string): Promise<void>
  /** null when the repo has no local clone linked. */
  gitStatus(repo: string): Promise<GitStatus | null>
  gitLog(repo: string): Promise<GitCommit[]>
  gitBranches(repo: string): Promise<GitBranch[]>
  gitDiff(repo: string, file: string, staged: boolean): Promise<string>
  gitRun(repo: string, action: GitAction, arg?: string | string[]): Promise<ActionResult & { output?: string }>
  gitOpen(repo: string, where: 'editor' | 'terminal' | 'folder'): Promise<ActionResult>
  /**
   * Looks for clones of GitHub repos in the home folder, or in a folder picked in a dialog (`pick`).
   * Undefined if the dialog was cancelled.
   */
  scanClones(pick: boolean): Promise<FoundClone[] | undefined>
  /** Links clones from the last scan (by repo name; the paths come from the scan, not the caller). */
  linkScanned(repos: string[]): Promise<number>
  /** Editors and IDEs installed on this machine, for the default-editor setting. */
  listEditors(): Promise<EditorOption[]>
  /** Fired when a notification is clicked: open this GitHub URL inside the app. */
  onNavigate(cb: (url: string) => void): () => void
}
