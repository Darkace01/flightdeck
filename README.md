# RepoDeck

A fast, customizable desktop dashboard for the GitHub repos you work on: Actions runs, pull requests, workflow dispatch and desktop notifications. Runs on Windows, macOS and Linux (Electron + React).

## Features

- **Dashboard of widgets** you can drag, resize, add more than once and scope to specific repos: repo health, workflow runs, pull requests, run-a-workflow, activity feed, "My work" inbox (review requests / your PRs / assigned issues across all of GitHub) and CI insights (pass rate, average duration, recent outcomes).
- **Actions**: trigger `workflow_dispatch` workflows with their inputs, cancel, re-run failed jobs or the whole run. You can also open a run to see its jobs and steps live and read the tail of a failed job's log.
- **Pull requests**: checks status, review state, labels and diff size. You can approve, or merge (squash / merge / rebase) after a confirm step.
- **Notifications** for failed/succeeded/started runs, PRs opened/merged/closed/ready, review requests and failing checks on your PRs. Each type can be turned on or off, and an "only mine" filter limits them to your own runs and PRs. Keeps running in the tray.
- **Fast**: polls with ETag conditional requests, which don't count against the GitHub rate limit. While runs are active it polls faster (every 10s by default).
- **Command palette** (`Ctrl/⌘+K`) to jump to any PR, run, workflow, repo, theme or command.
- **Themes**: dark, light or follow the OS. Presets include GitHub Dark/Light (default), Terminal, Amber CRT, Atom One Dark/Light, Dracula, Synthwave '84, Monokai, Nord, Tokyo Night, Catppuccin, Gruvbox, Solarized, Rosé Pine Dawn and Paper. You can override any colour, and pick the font and text size.
- **Portable config**: export or import all settings as JSON.

## Run it

```bash
npm install
npm run dev        # hot-reloading dev build
```

Sign in by either:

- having the GitHub CLI logged in (`gh auth login`); RepoDeck picks up its token automatically, or
- pasting a personal access token in **Settings → Account**. It needs the `repo` and `workflow` scopes, and is stored encrypted with your OS keychain.

## Build installers

```bash
npm run dist       # NSIS installer on Windows, DMG on macOS, AppImage/deb on Linux → dist/
```

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘+K` or `/` | Command palette |
| `Ctrl/⌘+R` / `F5` | Refresh now |
| `E` | Toggle layout editing |
| `Ctrl/⌘+,` | Settings |
| `Esc` | Close dialog / stop editing |

## Layout

```
src/main      Electron main process: GitHub client, poller, notifications, tray, IPC
src/preload   Typed bridge exposed to the UI as window.repodeck
src/shared    Types, defaults and theme presets shared by both sides
src/renderer  React UI: dashboard, widgets, dialogs, command palette
```

Settings, the activity history and the encrypted token live in the Electron user-data folder (`%APPDATA%/repodeck` on Windows).
