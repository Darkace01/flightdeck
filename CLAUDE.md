# CLAUDE.md

Guidance for AI coding agents working in this repo. For the full picture of how the app fits together, read [CONTRIBUTING.md](CONTRIBUTING.md#how-it-works).

## What this is

Pushback is an Electron + React desktop dashboard for GitHub Actions and pull requests. It's built with electron-vite (Vite 8), React 19, TypeScript (strict), react-grid-layout 2.x and electron-builder. It's published as `Darkace01/pushback`.

## Commands

```bash
npm run dev         # run with hot reload
npm run typecheck   # must pass before every commit
npm run build       # production build into out/ (main, preload, renderer)
npm run dist        # installer for the current OS into dist/ (never publishes)
npm run icon        # re-render build/icon.png after editing src/shared/icon.ts
npm test            # unit + integration tests (Vitest)
npm run test:coverage  # same, failing below the coverage thresholds in vitest.config.mts
npm run test:e2e    # build, then drive the app with Playwright against a fake GitHub (e2e/)
npm run test:all    # everything CI runs
```

Tests must pass before every commit: `npm run test:all`. CI runs it on Windows, macOS and Linux for every push and PR, and the Release workflow runs the same suite and won't build or publish if anything fails.

- `tests/unit/`: pure logic (environment parsing, graph layout, filters, settings migrations, templates, GitHub data mapping with a fake client).
- `tests/integration/`: real `git` in temp repos (`helpers.ts` builds a repo with branches, a merge and tags) for every query and action in `git.ts`/`gitTools.ts`, including refusing option-injection input; and the clone scanner on a fake home folder.
- `e2e/`: launches `out/main/index.js` with `PUSHBACK_API_URL` (a fake GitHub from `fake-github.ts`), `PUSHBACK_TOKEN` and `PUSHBACK_USER_DATA` (a temp profile). Every test also checks the app made no write requests to GitHub and threw no errors.
- New features need tests: logic in a pure module with unit tests, git behaviour in the integration suite, and a user-visible flow in `e2e/`. Add the fake API's responses to `fake-github.ts` when a feature calls a new endpoint.

## Layout

- `src/main/`: Electron main process. All GitHub access lives here: `github.ts` (ETag-cached REST + GraphQL), `poller.ts` (snapshots, diffed into events), `details.ts` (PR and repo views), `repoTools.ts` (issues, branches, commits, releases, new PRs), `git.ts` (local git), `updater.ts`, `store.ts` (settings, events, encrypted token).
- `src/preload/index.ts`: the `window.pushback` bridge.
- `src/shared/`: types, defaults, themes, dashboard templates and the icon drawing. Used by both processes, so keep it free of Node and DOM APIs.
- `src/renderer/src/`: React UI. `components/` (views and dialogs), `widgets/` (one file per widget), `lib/` (store, modal stack, dashboards, link routing, theme).

## Rules of the road

- **Adding an IPC call means touching 3 places**: the `PushbackApi` interface in `shared/types.ts`, `preload/index.ts`, and an `ipcMain.handle` in `main/index.ts`. The renderer is sandboxed with context isolation. Never give it Node access, and never pass it the token.
- **New settings fields** need a default in `shared/defaults.ts`. Anything that renames or restructures an existing field needs a migration in `normalizeSettings` (`main/store.ts`). Users' old `settings.json` files must keep loading.
- **Clicks on GitHub content** go through `openInApp(url)` (`lib/open.ts`): PRs, issues and runs open as views, and repos open as tabs (`lib/tabs.ts`). Open views from inside other views with `pushModal`, so that Esc goes back. Kinds listed in `PAGES` (`lib/ui.ts`) render as sub-pages in the main area via `PageArea`, with breadcrumbs from the view stack (`useTrail`); everything else is a dialog. A `Modal` inside a page renders without its frame (`PageMode`).
- **Filters**: widget options marked `filter: true` in `lib/filters.ts` appear in the inline `FilterBar` and in the settings dialog. Add a filter there, then apply it in the widget. Keep an "Open in browser" button on every view.
- **Local history tools** (`components/GitTools.tsx`, `main/gitTools.ts`) read through one typed IPC call, `gitQuery(repo, { kind, … })`, which returns `GitAnswer[kind]`. Add a query by extending `GitQuery`/`GitAnswer` in `shared/types.ts` and its `case` in `gitTools.ts`. Actions that change the repo are `GitAction`s: history ones are in `HISTORY_ACTIONS`, handled by `gitTools.act`. Validate SHAs and ref names with `sha()`/`refName()` there. `CommitGraph` draws any `GraphCommit[]`, local or from GitHub.
- **Deployments** come from one GraphQL query per repo (`main/deployments.ts`), not the poller. The renderer shares them through `lib/deployments.ts` (`useDeployments`, refreshed every 3 minutes while mounted). `shared/deploy.ts` splits environment names into stage and client.
- **Tabs**: `settings.openTabs` and `pinnedTabs` never share a repo. `tabLayout` is `horizontal` (the `TabBar`) or `vertical` (inside `RepoSidebar`, shown when `sidebarOpen`). Use the helpers in `lib/tabs.ts` rather than writing these fields directly.
- **Repo tab sections** are entries in `SECTIONS` (`components/RepoWorkspace.tsx`). Load data with `useLoad(repo, …)` and call `invalidate(repo)` after any write, so open sections refresh.
- **Local git safety**: the renderer passes repo names, never paths. Folders come only from `settings.localPaths`, which only the main process may set: the link and clone dialogs, and the clone scanner (`main/scan.ts`). Its link call takes repo names and looks the paths up in the main process's last scan results. `settings:save` and imports strip `localPaths`. Run git with `execFile` (no shell), put user input after `--` or validate it, and keep **Pull** fast-forward only. Confirm before anything destructive (discard, delete branch).
- **The open dashboard** is `settings.widgets` / `settings.layout`. `lib/dashboards.ts` syncs it into `settings.dashboards` on switch. Widget code shouldn't care which dashboard it's on.
- **GitHub-rendered HTML** (`body_html`, READMEs) must go through `<Markdown>`, which sanitises it again. Never `dangerouslySetInnerHTML` raw API content anywhere else.
- **Accounts and GitHub Enterprise Server**: the github.com login is the primary account; extra accounts (`settings.accounts`) and the repo→account map (`settings.repoAccounts`) are written only by the main process, like `localPaths`. Their tokens live encrypted in `accounts.bin` (`main/accounts.ts`) and never reach the renderer. In `main/index.ts` get a repo's client with `clientFor(repo)`, never `requireClient()` (primary only). Build repo links with `webUrl(repo, path)` (`lib/hosts.ts`), not a hard-coded `https://github.com/`.
- **Mind the rate limit.** Every tracked repo is polled every cycle. Prefer REST GETs (ETag 304s are free) and add new per-poll requests only when unavoidable. GraphQL is split into one inbox query plus one query per repo, because a single combined query returned 502s. GraphQL has its own budget (5,000 points an hour), so the poller only re-runs those queries at `pollSeconds` (not the faster active rate), and `GitHub.graphql` stops sending queries while the budget is spent.
- **Style**: 2 spaces, single quotes, no semicolons, lines up to about 150 characters, comments that explain *why*. Match the surrounding code.

## Testing the app

- To run the built app against a throwaway profile: `npm run build`, then launch Electron with a small harness script that calls `app.setPath('userData', <temp dir>)` and then `require('<repo>/out/main/index.js')`. Drive the UI with `webContents.executeJavaScript` and screenshot with `webContents.capturePage()`. A packaged build accepts `--user-data-dir=<dir>` and `--remote-debugging-port=<port>` instead.
- Synthetic `keydown` events must be dispatched on an element (for example `document.body`), not `window`: the shortcut handler calls `e.target.closest`.
- **Never trigger real deploy or publish workflows, merge real PRs, or comment on real PRs while testing.** Use a sandbox repo you own.
- Windows toasts in dev use `process.execPath` as the AppUserModelID. If none appear, Focus Assist / Do Not Disturb is the usual cause.

## Gotchas

- npm 11+ may skip install scripts. If Electron's binary is missing, run `node node_modules/electron/install.js`.
- `package.json` is `"type": "commonjs"`, so `scripts/render-icon.mts` loads `icon.ts` through `module.stripTypeScriptTypes`.
- The first launch copies settings from an older user-data folder: the app was called `RepoDeck` before 0.2 and `Flightdeck` in 0.2. The name was changed because an unrelated FlightDeck app already exists, so check winget, Homebrew and GitHub before ever renaming again.
- Files are committed with LF line endings. Git's CRLF warnings on Windows are expected.

## Commits and releases

- Commit after each logical step, with an imperative subject and a body that explains why.
- **Don't add AI attribution**: no `Co-Authored-By` trailers for Claude or other AI tools, and no "Generated with" lines in commits or PRs. The maintainer doesn't want Claude listed as a contributor.
- To release, bump `version` in `package.json`, write `release-notes/vX.Y.Z.md` describing every new feature (plus improvements and fixes) for users, commit both, then push a `vX.Y.Z` tag. The workflow refuses to release without the notes file and uses it as the release description. The Release workflow builds every platform, publishes the GitHub Release, bumps the Homebrew cask and opens a winget PR (when those token secrets are set). The tag must match `package.json`.
