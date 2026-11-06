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
```

There is no test suite. Verify with `typecheck` + `build`, then run the app (see **Testing** below).

## Layout

- `src/main/`: Electron main process. All GitHub access lives here: `github.ts` (ETag-cached REST + GraphQL), `poller.ts` (snapshots, diffed into events), `details.ts` (PR and repo views), `repoTools.ts` (issues, branches, commits, releases, new PRs), `git.ts` (local git), `updater.ts`, `store.ts` (settings, events, encrypted token).
- `src/preload/index.ts`: the `window.pushback` bridge.
- `src/shared/`: types, defaults, themes, dashboard templates and the icon drawing. Used by both processes, so keep it free of Node and DOM APIs.
- `src/renderer/src/`: React UI. `components/` (views and dialogs), `widgets/` (one file per widget), `lib/` (store, modal stack, dashboards, link routing, theme).

## Rules of the road

- **Adding an IPC call means touching 3 places**: the `PushbackApi` interface in `shared/types.ts`, `preload/index.ts`, and an `ipcMain.handle` in `main/index.ts`. The renderer is sandboxed with context isolation. Never give it Node access, and never pass it the token.
- **New settings fields** need a default in `shared/defaults.ts`. Anything that renames or restructures an existing field needs a migration in `normalizeSettings` (`main/store.ts`). Users' old `settings.json` files must keep loading.
- **Clicks on GitHub content** go through `openInApp(url)` (`lib/open.ts`): PRs, issues and runs open as views, and repos open as tabs (`lib/tabs.ts`). Open views from inside other views with `pushModal`, so that Esc goes back. Keep an "Open in browser" button on every view.
- **Repo tab sections** are entries in `SECTIONS` (`components/RepoWorkspace.tsx`). Load data with `useLoad(repo, …)` and call `invalidate(repo)` after any write, so open sections refresh.
- **Local git safety**: the renderer passes repo names, never paths. Folders come only from `settings.localPaths`, which only the link and clone dialogs in `main/index.ts` may set (`settings:save` and imports strip it). Run git with `execFile` (no shell), put user input after `--` or validate it, and keep **Pull** fast-forward only. Confirm before anything destructive (discard, delete branch).
- **The open dashboard** is `settings.widgets` / `settings.layout`. `lib/dashboards.ts` syncs it into `settings.dashboards` on switch. Widget code shouldn't care which dashboard it's on.
- **GitHub-rendered HTML** (`body_html`, READMEs) must go through `<Markdown>`, which sanitises it again. Never `dangerouslySetInnerHTML` raw API content anywhere else.
- **Mind the rate limit.** Every tracked repo is polled every cycle. Prefer REST GETs (ETag 304s are free) and add new per-poll requests only when unavoidable. GraphQL is split into one inbox query plus one query per repo, because a single combined query returned 502s.
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
