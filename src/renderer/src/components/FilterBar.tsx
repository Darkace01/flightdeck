import { useId, useRef, useState } from 'react'
import type { WidgetType } from '../../../shared/types'
import { OPTIONS, suggestions } from '../lib/filters'
import { useSettings, useSnapshot } from '../lib/store'
import { Popover } from './ui'

type Options = Record<string, string | number | boolean>

/**
 * Inline filters for a widget or repo view: which repos (when `repos` is given) plus the widget type's
 * filter options, applied as you change them.
 */
export function FilterBar({ type, repos, scope, options, defaults, onChange }: {
  type: WidgetType
  /** The widget's chosen repos; leave out for views fixed to one repo. */
  repos?: string[]
  /** Repos the suggestions come from. */
  scope: string[]
  options: Options
  defaults: Options
  onChange: (patch: { repos?: string[]; options?: Options }) => void
}) {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const id = useId()
  const repoBtn = useRef<HTMLButtonElement>(null)
  const [picking, setPicking] = useState(false)
  const specs = (OPTIONS[type] ?? []).filter((o) => o.filter)
  const set = (key: string, value: string | number | boolean) => onChange({ options: { ...options, [key]: value } })
  const clear = () => {
    const reset: Options = { ...options }
    for (const o of specs) if (o.key !== 'view') reset[o.key] = defaults[o.key] ?? (o.kind === 'bool' ? false : o.kind === 'select' ? o.choices[0][0] : '')
    onChange({ options: reset, ...(repos ? { repos: [] } : {}) })
  }

  return (
    <div className="filter-bar" onMouseDown={(e) => e.stopPropagation()}>
      {repos && (
        <>
          <button ref={repoBtn} className={`filter-chip${repos.length ? ' on' : ''}`} onClick={() => setPicking(!picking)}>
            {repos.length ? `${repos.length} repo${repos.length === 1 ? '' : 's'}` : 'All repos'} ▾
          </button>
          {picking && (
            <Popover anchor={repoBtn.current} onClose={() => setPicking(false)}>
              {settings.repos.map((r) => (
                <label key={r} className="check menu-check">
                  <input type="checkbox" checked={repos.includes(r)} onChange={() => onChange({ repos: repos.includes(r) ? repos.filter((x) => x !== r) : [...repos, r] })} />
                  {r}
                </label>
              ))}
            </Popover>
          )}
        </>
      )}
      {specs.map((o) => {
        const v = options[o.key] ?? defaults[o.key]
        if (o.kind === 'select')
          return (
            <select key={o.key} className={`filter-select${v && v !== o.choices[0][0] ? ' on' : ''}`} title={o.label} value={String(v ?? o.choices[0][0])} onChange={(e) => set(o.key, e.target.value)}>
              {o.choices.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )
        if (o.kind === 'bool')
          return (
            <button key={o.key} className={`filter-chip${v ? ' on' : ''}`} aria-pressed={!!v} onClick={() => set(o.key, !v)}>
              {o.label}
            </button>
          )
        if (o.kind === 'text') {
          const list = o.suggest ? suggestions(o.suggest, snapshot, scope) : []
          return (
            <span key={o.key} className="filter-text">
              <input className={v ? 'on' : ''} title={o.label} placeholder={`${o.label}: ${o.placeholder ?? 'any'}`} value={String(v ?? '')} list={list.length ? `${id}-${o.key}` : undefined} onChange={(e) => set(o.key, e.target.value)} />
              {list.length > 0 && (
                <datalist id={`${id}-${o.key}`}>
                  {list.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </span>
          )
        }
        return null
      })}
      <button className="link small" onClick={clear}>
        Clear
      </button>
    </div>
  )
}
