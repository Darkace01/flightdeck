import { useState } from 'react'
import { WIDGET_DEFAULTS } from '../../../shared/defaults'
import type { WidgetConfig, WidgetType } from '../../../shared/types'
import { updateSettings, useSettings } from '../lib/store'
import { closeModal } from '../lib/ui'
import { addWidget, removeWidget, WIDGETS } from './Dashboard'
import { OPTIONS } from '../lib/filters'
import { Modal } from './ui'

export function WidgetSettingsModal({ id }: { id: string }) {
  const settings = useSettings()
  const widget = settings.widgets.find((w) => w.id === id)
  const [draft, setDraft] = useState<WidgetConfig | undefined>(widget)
  if (!widget || !draft) return null

  const set = (key: string, value: string | number | boolean) => setDraft({ ...draft, options: { ...draft.options, [key]: value } })
  const toggleRepo = (repo: string) =>
    setDraft({ ...draft, repos: draft.repos.includes(repo) ? draft.repos.filter((r) => r !== repo) : [...draft.repos, repo] })
  const save = () => {
    void updateSettings({ widgets: settings.widgets.map((w) => (w.id === id ? draft : w)) })
    closeModal()
  }

  return (
    <Modal title={`${WIDGET_DEFAULTS[widget.type].title} settings`} onClose={closeModal} width={480}>
      <label className="field">
        <span>Title</span>
        <input value={draft.title ?? ''} placeholder={WIDGET_DEFAULTS[widget.type].title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>

      {widget.type !== 'inbox' && (
        <fieldset className="field">
          <legend>Repositories {draft.repos.length === 0 && <span className="dim">(all tracked)</span>}</legend>
          <div className="checks">
            {settings.repos.map((repo) => (
              <label key={repo} className="check">
                <input type="checkbox" checked={draft.repos.includes(repo)} onChange={() => toggleRepo(repo)} />
                {repo}
              </label>
            ))}
            {!settings.repos.length && <span className="dim">No repositories tracked yet.</span>}
          </div>
        </fieldset>
      )}

      {(OPTIONS[widget.type] ?? []).map((o) => {
        const v = draft.options[o.key]
        if (o.kind === 'bool')
          return (
            <label key={o.key} className="check">
              <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(o.key, e.target.checked)} />
              {o.label}
            </label>
          )
        return (
          <label key={o.key} className="field">
            <span>{o.label}</span>
            {o.kind === 'select' ? (
              <select value={String(v ?? o.choices[0][0])} onChange={(e) => set(o.key, e.target.value)}>
                {o.choices.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            ) : o.kind === 'number' ? (
              <input type="number" min={o.min} max={o.max} value={Number(v ?? o.min)} onChange={(e) => set(o.key, Number(e.target.value))} />
            ) : (
              <input value={String(v ?? '')} placeholder={o.placeholder} onChange={(e) => set(o.key, e.target.value)} />
            )}
          </label>
        )
      })}

      <footer className="modal-actions">
        <button
          className="btn btn-danger"
          onClick={() => {
            removeWidget(id)
            closeModal()
          }}
        >
          Remove
        </button>
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
      </footer>
    </Modal>
  )
}

export function AddWidgetModal() {
  return (
    <Modal title="Add widget" onClose={closeModal} width={520}>
      <p className="dim">Widgets can be added more than once — e.g. one Runs widget per repo, or one just for failures.</p>
      <div className="widget-picker">
        {(Object.keys(WIDGETS) as WidgetType[]).map((type) => (
          <button
            key={type}
            className="picker-item"
            onClick={() => {
              addWidget(type)
              closeModal()
            }}
          >
            <span className="strong">{WIDGET_DEFAULTS[type].title}</span>
            <span className="dim small">{WIDGETS[type].description}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
