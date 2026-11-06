# Contributing to Pushback

Thanks for helping out! Bug reports, feature ideas, docs fixes and code are all welcome. This guide covers how to get set up, how the app is put together, and what a good pull request looks like.

## Ways to contribute

- **Report a bug**: [open an issue](https://github.com/Darkace01/pushback/issues/new?template=bug_report.md) with what you did, what you expected, and what happened. Include your OS and Pushback version (Settings → Advanced).
- **Suggest a feature**: [open an issue](https://github.com/Darkace01/pushback/issues/new?template=feature_request.md) describing the problem you want solved, not just the solution.
- **Send a pull request**: for anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- **Add a theme**: the easiest first contribution. See [Adding a theme](#adding-a-theme).

> **Never paste tokens, logs containing tokens, or private repo data into issues.** If you've found a security problem, email the maintainer instead of opening a public issue. The address is on [the maintainer's GitHub profile](https://github.com/Darkace01).

## Development setup

You need Node.js 22 or newer and Git. The [GitHub CLI](https://cli.github.com) is optional, but it makes signing in effortless.

```bash
git clone https://github.com/Darkace01/pushback.git
cd pushback
npm install
npm run dev
```

`npm run dev` opens the app with hot reload: renderer changes apply instantly, and main-process changes restart the app.

> On npm 11+, `npm install` may skip Electron's download script. If `npm run dev` says Electron failed to install, run `node node_modules/electron/install.js` once.

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the app with hot reload |
| `npm run typecheck` | Type-check everything (run this before every PR) |
| `npm run build` | Production build into `out/` |
| `npm run dist` | Build an installer for your current OS into `dist/` |
| `npm run icon` | Re-render `build/icon.png` after changing `src/shared/icon.ts` |

**Tip:** to test without touching your real settings, use a throwaway profile: `npm run dev -- -- --user-data-dir=/tmp/pushback-test`.

## How it works

```
src/
  main/        Electron main process (Node)
    index.ts     window, tray, notifications, IPC handlers
    poller.ts    polls GitHub, diffs snapshots into events
    github.ts    REST + GraphQL client with ETag caching
    details.ts   on-demand fetches for the PR and repo views
    repoTools.ts issues, branches, commits, releases, creating PRs (repo tab sections)
    git.ts       local git: status, diff, commit, sync, branches; runs `git` with execFile
    store.ts     settings/events on disk, token storage
    updater.ts   auto-updates from GitHub Releases
  preload/     typed bridge exposed to the UI as window.pushback
  shared/      types, defaults, theme presets, dashboard templates, icon drawing (used by both sides)
  renderer/    React UI
    src/components/   dashboard, PR and repo views, settings, dialogs, command palette
    src/widgets/      one file per widget
    src/lib/          store, modal stack, dashboards, in-app link routing, theme, formatting
```

The key ideas:

1. **The main process owns all GitHub access.** The UI never sees the token. It calls `window.pushback.*` methods, which go over IPC to handlers in `main/index.ts`.
2. **The poller builds a `Snapshot`.** Every cycle it fetches runs over REST and PRs over GraphQL for each tracked repo, then pushes the whole snapshot to the UI. GETs use ETags, so a 304 response costs no rate limit. It polls faster while runs are active or just after you take an action.
3. **Events come from diffs.** `poller.ts` compares each snapshot with the previous one (a run went from in progress to failed, a PR was merged, and so on). These events feed both the Activity widget and desktop notifications.
4. **GitHub links open in the app.** Send any click on GitHub content through `openInApp(url)` in `lib/open.ts`. It opens the PR, run or repo view if there is one, and the browser otherwise. Open views with `pushModal` so that closing them returns to where the user came from.
5. **Repo tabs.** `settings.openTabs` / `settings.activeTab` hold the open tabs (`lib/tabs.ts`). A repo tab is `components/RepoWorkspace.tsx`: add a section by adding an entry to `SECTIONS`, either a component that gets `{ repo, info }` or a dashboard widget scoped to the repo. Sections load their data on demand with `useLoad(repo, …)` from `lib/useLoad.ts`. After creating or changing something, call `invalidate(repo)` so every section showing that repo reloads.
6. **Local git is locked to linked folders.** The renderer only ever passes a repo name; `main/index.ts` looks up the folder in `settings.localPaths`. Only the link and clone dialogs and the clone scanner (`main/scan.ts`, which reads `.git/config` files and links by name from its own results) can set those. Keep it that way: never accept a path from the renderer, and pass user-typed values to git after `--` or validate them (see `branchName` in `git.ts`).
7. **Dashboards.** The open dashboard's widgets and layout live in `settings.widgets` / `settings.layout`, so widget code doesn't need to know about dashboards. `lib/dashboards.ts` writes them back into `settings.dashboards` when switching. Templates are in `shared/templates.ts`.
8. **Settings live in the main process.** The UI applies changes optimistically (`updateSettings` in `lib/store.ts`), and the main process persists them to `settings.json`. When you add a setting, also give it a default in `shared/defaults.ts`. Old settings files are filled in from the defaults, so no migration is needed for new fields.

## Adding a widget

1. Add the type name to `WidgetType` in `src/shared/types.ts`.
2. Add its default title, size and options to `WIDGET_DEFAULTS` in `src/shared/defaults.ts`.
3. Create `src/renderer/src/widgets/YourWidget.tsx`. It receives `WidgetProps` (see `widgets/types.ts`): the widget's config and the current filter text. Use `widgetRepos()` from `lib/store.ts` to work out which repos it should show. Copy a small existing widget such as `SummaryWidget.tsx` as a starting point.
4. Register it in `WIDGETS` in `src/renderer/src/components/Dashboard.tsx` with a one-line description (this appears in the Add widget dialog).
5. If it has options, describe them in `OPTIONS` in `src/renderer/src/components/WidgetModals.tsx`. The settings form is generated from that list.

If the widget needs new data from GitHub, fetch it in `poller.ts` and add it to `RepoState` or `Snapshot`, rather than calling the API from the UI. Keep an eye on request counts: each tracked repo is polled every cycle.

## Adding a theme

Add an entry to `THEMES` in `src/shared/themes.ts`:

```ts
{
  id: 'my-theme',          // unique, kebab-case
  name: 'My Theme',        // shown in Settings and the command palette
  mode: 'dark',            // or 'light'
  colors: { bg, panel, panel2, hover, border, text, dim, accent, ok, bad, warn, run, muted },
  // optional: font: MONO, radius: 0, effect: 'glow' | 'crt'
}
```

Check it in both the dashboard and the settings dialog, and make sure `dim` text is still readable on `panel`. Aim for a WCAG contrast ratio of at least 4.5:1 between `text` and `bg`.

## Code style

- **TypeScript, strict.** `npm run typecheck` must pass. Avoid `any`, and prefer narrowing over casts.
- **Match the code around you**: naming, file layout and comment density. Comments explain *why*, not *what*.
- **Keep it fast.** Avoid extra API calls per poll and re-renders of the whole dashboard, and don't add heavy dependencies. Discuss new runtime dependencies in an issue first.
- **Keep it secure.** The renderer stays sandboxed with context isolation. Don't expose Node APIs to it, and only open `https://` links externally.
- **Formatting**: 2 spaces, single quotes, no semicolons, lines up to about 150 characters.

## Testing your change

There's no automated UI test suite yet, so please check your change by hand:

1. `npm run typecheck` and `npm run build` pass.
2. Run `npm run dev` and try the feature with at least one real repo.
3. If you touched the layout or styles, check both a dark and a light theme.
4. If you touched actions (dispatch, re-run, merge and so on), test them on a **sandbox repo you own**, not on real projects.

CI runs the type check and build on every pull request.

## Pull requests

- Branch from `main` and keep each PR focused on one change.
- Write commit messages in the imperative ("Add Gruvbox Light theme", not "Added…").
- In the PR description, say what changed and why, and how you tested it. Add a screenshot for anything visual.
- Update the README if you change user-facing behaviour.

## Adding a dashboard template

Add an entry to `TEMPLATES` in `src/shared/templates.ts`. Each widget gives its type, its position as `[x, y, w, h]` on the 12-column grid, and optionally a title and options. The New dashboard dialog draws the preview from the same data.

## Releasing (maintainers)

1. Bump `version` in `package.json` (and run `npm install` to update the lockfile).
2. Write `release-notes/vX.Y.Z.md`: what's new, improved and fixed, in words users understand (see the earlier files for the format). Commit it with the version bump.
3. Tag and push: `git tag v0.3.0 && git push origin main v0.3.0`.
4. The **Release** workflow builds Windows, macOS and Linux installers and publishes them to a GitHub Release, with your notes as its description. It stops if the notes file is missing. Installed copies pick up the update automatically.
5. The same workflow updates the package managers, if their secrets are set (repo **Settings → Secrets and variables → Actions**):

   | Secret | What it does | Token needed |
   | --- | --- | --- |
   | `HOMEBREW_TAP_TOKEN` | Bumps the version and checksums in [Darkace01/homebrew-tap](https://github.com/Darkace01/homebrew-tap) | Fine-grained, *Contents: read and write* on `homebrew-tap` |
   | `WINGET_TOKEN` | Opens a PR on [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) for the new version | Classic, `public_repo` scope (you also need a fork of winget-pkgs) |

   Without a secret, that step is skipped and the workflow says so.

The tag must match the `package.json` version, or the workflow stops.

The source manifests are in `packaging/`. `packaging/winget` holds the version first submitted to winget, under `manifests/<first letter of the publisher>/` (`d/Darkace01/…`) as winget-pkgs requires; check changes with `winget validate --manifest <folder>`. `packaging/homebrew/pushback.rb` is the cask as published in the tap.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
