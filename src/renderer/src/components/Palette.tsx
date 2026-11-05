import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import { THEMES } from '../../../shared/themes'
import type { WidgetType } from '../../../shared/types'
import { matches, shortRepo } from '../lib/format'
import { api, getSettings, updateSettings, useSettings, useSnapshot } from '../lib/store'
import { closeModal, openModal, setEditing } from '../lib/ui'
import { switchDashboard } from '../lib/dashboards'
import { openInApp } from '../lib/open'
import { addWidget } from './Dashboard'
import { checksTone, runTone, StatusIcon } from './ui'

interface Item {
  id: string
  kind: string
  label: string
  sub?: string
  icon?: ReactNode
  /** Extra text that matches but isn't shown. */
  keywords?: string
  action: () => void
}

/** Ctrl/Cmd+K: jump to any PR, run, workflow or repo, or run an app command, from the keyboard. */
export function Palette() {
  const snapshot = useSnapshot()
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const items = useMemo<Item[]>(() => {
    const open = (url: string) => () => {
      closeModal()
      openInApp(url)
    }
    const commands: Item[] = [
      { id: 'c-refresh', kind: 'Command', label: 'Refresh now', keywords: 'reload poll', action: () => (closeModal(), void api.refresh()) },
      { id: 'c-settings', kind: 'Command', label: 'Open settings', keywords: 'preferences config', action: () => openModal({ kind: 'settings' }) },
      { id: 'c-edit', kind: 'Command', label: 'Edit dashboard layout', keywords: 'customize arrange move resize', action: () => (setEditing(true), closeModal()) },
      {
        id: 'c-mode',
        kind: 'Command',
        label: `Switch to ${settings.mode === 'light' ? 'dark' : 'light'} mode`,
        keywords: 'theme toggle',
        action: () => (void updateSettings({ mode: getSettings().mode === 'light' ? 'dark' : 'light' }), closeModal())
      },
      ...THEMES.map((t) => ({
        id: `c-theme-${t.id}`,
        kind: 'Theme',
        label: `Theme: ${t.name}`,
        sub: `${t.mode} theme`,
        icon: <span className="palette-swatch" style={{ background: t.colors.bg, borderColor: t.colors.accent }} />,
        action: () => (void updateSettings(t.mode === 'dark' ? { darkTheme: t.id, mode: 'dark' } : { lightTheme: t.id, mode: 'light' }), closeModal())
      })),
      ...settings.dashboards.map((d) => ({
        id: `c-dash-${d.id}`,
        kind: 'Dashboard',
        label: `Dashboard: ${d.name}`,
        keywords: 'switch layout view',
        action: () => (switchDashboard(d.id), closeModal())
      })),
      { id: 'c-dash-new', kind: 'Command', label: 'New dashboard…', keywords: 'create template layout', action: () => openModal({ kind: 'new-dashboard' }) },
      { id: 'c-dash-manage', kind: 'Command', label: 'Manage dashboards…', keywords: 'rename delete reorder', action: () => openModal({ kind: 'dashboards' }) },
      { id: 'c-read', kind: 'Command', label: 'Mark all activity read', action: () => (void api.markRead(), closeModal()) },
      ...(Object.keys(WIDGET_DEFAULTS) as WidgetType[]).map((t) => ({
        id: `c-add-${t}`,
        kind: 'Command',
        label: `Add widget: ${WIDGET_DEFAULTS[t].title}`,
        action: () => (addWidget(t), closeModal())
      }))
    ]
    const repoItems: Item[] = settings.repos.map((repo) => ({
      id: `r-${repo}`,
      kind: 'Repo',
      label: repo,
      action: () => openModal({ kind: 'repo', repo })
    }))
    const all = settings.repos.map((r) => snapshot.repos[r]).filter(Boolean)
    const prs: Item[] = all.flatMap((s) =>
      s.prs.map((p) => ({
        id: `p-${p.url}`,
        kind: 'PR',
        label: p.title,
        sub: `${shortRepo(p.repo)}#${p.number} · ${p.author} · ${p.branch}`,
        icon: <StatusIcon tone={checksTone(p.checks)} size={14} />,
        action: () => openModal({ kind: 'pr', repo: p.repo, number: p.number })
      }))
    )
    const inbox: Item[] = (snapshot.inbox?.reviewRequests ?? [])
      .concat(snapshot.inbox?.assigned ?? [])
      .filter((i) => !settings.repos.includes(i.repo))
      .map((i) => ({ id: `i-${i.url}`, kind: i.kind === 'pr' ? 'PR' : 'Issue', label: i.title, sub: `${i.repo}#${i.number}`, action: open(i.url) }))
    const workflows: Item[] = all.flatMap((s) =>
      s.workflows
        .filter((w) => w.dispatchable)
        .map((w) => ({
          id: `w-${w.repo}-${w.id}`,
          kind: 'Run',
          label: `Run workflow: ${w.name}`,
          sub: shortRepo(w.repo),
          keywords: 'dispatch trigger start',
          action: () => openModal({ kind: 'dispatch', workflow: w })
        }))
    )
    const runs: Item[] = all.flatMap((s) =>
      s.runs.slice(0, 15).map((r) => ({
        id: `x-${r.id}`,
        kind: 'Run',
        label: `${r.name} #${r.runNumber}`,
        sub: `${shortRepo(r.repo)} · ${r.branch} · ${r.title}`,
        icon: <StatusIcon tone={runTone(r)} size={14} />,
        keywords: `${r.conclusion ?? r.status} ${r.actor}`,
        action: () => openModal({ kind: 'run', run: r })
      }))
    )
    return [...commands, ...repoItems, ...prs, ...inbox, ...workflows, ...runs]
  }, [snapshot, settings])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return items.filter((i) => i.kind !== 'Run' || i.label.startsWith('Run workflow')).slice(0, 40)
    return items.filter((i) => matches(`${i.kind} ${i.label} ${i.sub ?? ''} ${i.keywords ?? ''}`, q)).slice(0, 60)
  }, [items, query])

  useEffect(() => setSel(0), [query])
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1))
    else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
    else if (e.key === 'Enter') results[sel]?.action()
    else if (e.key === 'Escape') closeModal()
    else return
    e.preventDefault()
  }

  return (
    <div className="modal-backdrop" onMouseDown={closeModal}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input autoFocus placeholder="Search PRs, runs, workflows, repos, commands…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} />
        <ul ref={listRef} role="listbox">
          {results.map((item, i) => (
            <li key={item.id} className={i === sel ? 'sel' : ''} onMouseMove={() => setSel(i)} onClick={item.action} role="option" aria-selected={i === sel}>
              <span className="palette-kind">{item.kind}</span>
              {item.icon}
              <div className="row-main">
                <div className="row-title">{item.label}</div>
                {item.sub && <div className="row-meta">{item.sub}</div>}
              </div>
            </li>
          ))}
          {!results.length && <li className="dim">No matches</li>}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
