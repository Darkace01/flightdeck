import { useState } from 'react'
import { SEARCH_PRESETS } from '../../../shared/search'
import type { SavedSearch } from '../../../shared/types'
import { pinSearch } from './Dashboard'
import { toast, updateSettings, useSettings } from '../lib/store'
import { closeModal } from '../lib/ui'
import { IconButton, Modal } from './ui'

/** Cross-repo searches (your PRs in every org, issues assigned to you…) that can be pinned to the dashboard as widgets. */
export function SavedSearchesModal() {
  const settings = useSettings()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SavedSearch['kind']>('pr')

  const pin = (s: SavedSearch) => {
    pinSearch(s)
    toast(`Pinned “${s.name}” to this dashboard`, 'ok')
    closeModal()
  }
  const save = () => {
    const s: SavedSearch = { id: `s-${Date.now().toString(36)}`, name: name.trim() || query.trim().slice(0, 40), query: query.trim(), kind }
    void updateSettings({ savedSearches: [...settings.savedSearches, s] })
    setName('')
    setQuery('')
  }
  const row = (s: SavedSearch, removable: boolean) => (
    <li key={s.id} className="row">
      <div className="row-main">
        <div className="row-title">
          <span className="strong">{s.name}</span>
          <span className="badge badge-muted">{s.kind === 'pr' ? 'PRs' : 'Issues'}</span>
        </div>
        <div className="row-meta">
          <span className="mono">{s.query}</span>
        </div>
      </div>
      <div className="inline">
        <button className="btn btn-sm" onClick={() => pin(s)}>
          Pin to dashboard
        </button>
        {removable && <IconButton icon="trash" title="Delete" onClick={() => void updateSettings({ savedSearches: settings.savedSearches.filter((x) => x.id !== s.id) })} />}
      </div>
    </li>
  )

  return (
    <Modal title="Saved searches" onClose={closeModal} width={680}>
      <p className="dim small">
        A search runs across every repo and org you can see, not only the ones you track. Pin one and it becomes a widget with its own filters. Use GitHub's
        search qualifiers, such as <code>is:open author:@me org:acme label:bug</code>.
      </p>
      {settings.savedSearches.length > 0 && (
        <>
          <h4>Yours</h4>
          <ul className="list">{settings.savedSearches.map((s) => row(s, true))}</ul>
        </>
      )}
      <h4>Ready-made</h4>
      <ul className="list">{SEARCH_PRESETS.map((s) => row(s, false))}</ul>
      <h4>New search</h4>
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder="e.g. Open bugs in acme" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Look for</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as SavedSearch['kind'])}>
            <option value="pr">Pull requests</option>
            <option value="issue">Issues</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Search</span>
        <input value={query} placeholder="is:open org:acme label:bug" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <footer className="modal-actions">
        <span className="spacer" />
        <button className="btn" onClick={save} disabled={!query.trim()}>
          Save search
        </button>
        <button className="btn btn-primary" onClick={closeModal}>
          Done
        </button>
      </footer>
    </Modal>
  )
}
