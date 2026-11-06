import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ChecksState, WorkflowRun } from '../../../shared/types'
import { useToasts } from '../lib/store'

type Tone = 'ok' | 'bad' | 'warn' | 'muted' | 'run'

export function runTone(run: Pick<WorkflowRun, 'status' | 'conclusion'>): Tone {
  if (run.status === 'in_progress') return 'run'
  if (run.status !== 'completed') return 'warn'
  if (run.conclusion === 'success') return 'ok'
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'muted'
  return 'bad'
}

export function checksTone(state: ChecksState): Tone {
  if (state === 'SUCCESS') return 'ok'
  if (state === 'FAILURE' || state === 'ERROR') return 'bad'
  if (state === 'PENDING' || state === 'EXPECTED') return 'warn'
  return 'muted'
}

const GLYPH: Record<Tone, ReactNode> = {
  ok: <path d="M4 8.5l2.5 2.5L12 5.5" />,
  bad: <path d="M5 5l6 6M11 5l-6 6" />,
  warn: <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />,
  muted: <path d="M4.5 11.5l7-7" />,
  run: <path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />
}

export function StatusIcon({ tone, title, size = 16 }: { tone: Tone; title?: string; size?: number }) {
  return (
    <span className={`status status-${tone}`} title={title}>
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {tone !== 'run' && tone !== 'warn' && <circle cx="8" cy="8" r="7" strokeWidth="1.2" opacity="0.35" />}
        {GLYPH[tone]}
      </svg>
    </span>
  )
}

export function Avatar({ src, login, size = 18 }: { src?: string; login: string; size?: number }) {
  if (!src) return <span className="avatar avatar-empty" style={{ width: size, height: size }} title={login} />
  return <img className="avatar" src={`${src}${src.includes('?') ? '&' : '?'}s=${size * 2}`} width={size} height={size} alt="" title={login} />
}

const ICONS = {
  refresh: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3',
  gear: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  external: 'M9 3h4v4M13 3L7 9M11 9v4H3V5h4',
  play: 'M5 3.5v9l7-4.5z',
  stop: 'M4.5 4.5h7v7h-7z',
  rerun: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  check: 'M3.5 8.5l3 3 6-7',
  up: 'M8 13V3M4 7l4-4 4 4',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  bell: 'M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14h3',
  trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9',
  comment: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  branch: 'M5 2.5v11M5 10a3 3 0 0 0 3-3h1.5M11 7a1.5 1.5 0 1 0 0-.01'
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled
}: {
  icon: IconName
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`icon-btn${active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton icon="close" title="Close" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

/**
 * Placeholder shown while data loads, shaped like what replaces it so the page doesn't jump.
 * `list` mimics icon + two-line rows; `text` mimics a heading and paragraphs (READMEs, PR bodies).
 */
export function Skeleton({ kind = 'list', rows = 4 }: { kind?: 'list' | 'text'; rows?: number }) {
  if (kind === 'text')
    return (
      <div className="skeleton skeleton-text" aria-busy="true" aria-label="Loading">
        <span className="sk sk-title" />
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="sk sk-line" style={{ width: `${[96, 88, 92, 64][i % 4]}%` }} />
        ))}
      </div>
    )
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          <span className="sk sk-dot" />
          <span className="sk-lines">
            <span className="sk sk-line" style={{ width: `${[70, 55, 80, 62][i % 4]}%` }} />
            <span className="sk sk-line sk-small" style={{ width: `${[40, 32, 46, 28][i % 4]}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A dropdown rendered at the top level of the page, under its anchor button, so containers that scroll or
 * clip (the tab bar) can't cut it off.
 */
export function Popover({ anchor, onClose, children, className = '', align = 'left' }: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  className?: string
  align?: 'left' | 'right'
}) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>()
  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      setPos(align === 'left' ? { top: r.bottom + 6, left: Math.max(8, r.left) } : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, align])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!pos) return null
  return createPortal(
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className={`menu popover ${className}`} style={pos}>
        {children}
      </div>
    </>,
    document.body
  )
}

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}
