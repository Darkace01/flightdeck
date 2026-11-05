import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { NotifySettings, RepoOption } from '../../../shared/types'
import { api, toast, updateSettings, useSettings, useSnapshot } from '../lib/store'
import { closeModal } from '../lib/ui'
import { Avatar, IconButton, Modal, Segmented } from './ui'

type Tab = 'account' | 'repos' | 'notify' | 'look' | 'advanced'

const ACCENTS = ['#58a6ff', '#3fb950', '#a371f7', '#f778ba', '#f0883e', '#e3b341', '#39c5cf']

const NOTIFY_LABELS: [keyof NotifySettings, string][] = [
  ['runFailure', 'Workflow run failed or was cancelled'],
  ['runSuccess', 'Workflow run succeeded'],
  ['runStarted', 'Workflow run started'],
  ['prOpened', 'Pull request opened'],
  ['prClosed', 'Pull request merged or closed'],
  ['prReady', 'Draft marked ready for review'],
  ['reviewRequested', 'Review requested from me'],
  ['checksFailed', 'Checks failed on my pull request'],
  ['onlyMine', 'Only notify about runs and PRs that are mine']
]

export function AccountSection() {
  const snapshot = useSnapshot()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (value: string | null) => {
    setBusy(true)
    const r = await api.setToken(value)
    setBusy(false)
    if (r.ok) {
      setToken('')
      toast(value ? 'Signed in' : 'Token removed', 'ok')
    } else toast(`Sign-in failed: ${r.error}`, 'error')
  }
  return (
    <div className="stack">
      {snapshot.auth === 'ok' && snapshot.viewer ? (
        <div className="account">
          <Avatar src={snapshot.viewer.avatarUrl} login={snapshot.viewer.login} size={36} />
          <div>
            <div className="strong">{snapshot.viewer.login}</div>
            <div className="dim small">{snapshot.authSource === 'gh' ? 'Using your GitHub CLI login (gh auth token)' : 'Using a saved personal access token'}</div>
          </div>
          {snapshot.authSource === 'pat' && (
            <button className="btn btn-sm" disabled={busy} onClick={() => void save(null)}>
              Remove token
            </button>
          )}
        </div>
      ) : (
        <p className="dim">{snapshot.authError ?? 'Not signed in.'}</p>
      )}
      <p className="dim small">
        RepoDeck uses your <code>gh</code> CLI login automatically. To use a different account, paste a token with <code>repo</code> and <code>workflow</code>{' '}
        scopes (or a fine-grained token with Actions, Contents and Pull requests read/write). It's stored encrypted with your OS keychain.
      </p>
      <div className="inline">
        <input type="password" placeholder="ghp_… or github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn btn-primary" disabled={!token.trim() || busy} onClick={() => void save(token)}>
          {busy ? 'Checking…' : 'Save token'}
        </button>
      </div>
      <button className="link" onClick={() => void api.openExternal('https://github.com/settings/tokens/new?scopes=repo,workflow&description=RepoDeck')}>
        Create a token on GitHub →
      </button>
    </div>
  )
}

export function ReposSection() {
  const settings = useSettings()
  const snapshot = useSnapshot()
  const [input, setInput] = useState('')
  const [mine, setMine] = useState<RepoOption[]>([])
  useEffect(() => {
    if (snapshot.auth === 'ok') api.listMyRepos().then(setMine, () => setMine([]))
  }, [snapshot.auth])

  const add = (repo: string) => {
    const name = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) return toast('Use the owner/name format, e.g. vercel/next.js', 'error')
    if (settings.repos.includes(name)) return toast(`${name} is already tracked`)
    void updateSettings({ repos: [...settings.repos, name] })
    setInput('')
  }
  const remove = (repo: string) => void updateSettings({ repos: settings.repos.filter((r) => r !== repo) })
  const move = (repo: string, dir: -1 | 1) => {
    const list = [...settings.repos]
    const i = list.indexOf(repo)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    void updateSettings({ repos: list })
  }
  const suggestions = mine.filter((r) => !settings.repos.includes(r.fullName))

  return (
    <div className="stack">
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          add(input)
        }}
      >
        <input list="my-repos" placeholder="owner/name or GitHub URL" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
        <datalist id="my-repos">
          {suggestions.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.description ?? ''}
            </option>
          ))}
        </datalist>
        <button className="btn btn-primary" type="submit" disabled={!input.trim()}>
          Add
        </button>
      </form>
      <ul className="repo-list">
        {settings.repos.map((repo) => (
          <li key={repo}>
            <span className="mono">{repo}</span>
            {snapshot.repos[repo]?.error && <span className="del small">{snapshot.repos[repo].error}</span>}
            <span className="spacer" />
            <button className="icon-btn" title="Move up" onClick={() => move(repo, -1)}>
              ↑
            </button>
            <button className="icon-btn" title="Move down" onClick={() => move(repo, 1)}>
              ↓
            </button>
            <IconButton icon="close" title="Stop tracking" onClick={() => remove(repo)} />
          </li>
        ))}
        {!settings.repos.length && <li className="dim">No repositories yet.</li>}
      </ul>
      {suggestions.length > 0 && (
        <>
          <h4 className="group-head">Recently pushed</h4>
          <div className="suggestions">
            {suggestions.slice(0, 12).map((r) => (
              <button key={r.fullName} className="chip chip-btn" onClick={() => add(r.fullName)} title={r.description ?? ''}>
                + {r.fullName}
                {r.private && ' 🔒'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NotifySection() {
  const settings = useSettings()
  return (
    <div className="stack">
      {NOTIFY_LABELS.map(([key, label]) => (
        <label key={key} className="check">
          <input type="checkbox" checked={settings.notify[key]} onChange={(e) => void updateSettings({ notify: { ...settings.notify, [key]: e.target.checked } })} />
          {label}
        </label>
      ))}
      <p className="dim small">Clicking a notification opens the run or pull request on GitHub. Bursts of more than three updates are grouped.</p>
    </div>
  )
}

function LookSection() {
  const settings = useSettings()
  return (
    <div className="stack">
      <div className="field">
        <span>Theme</span>
        <Segmented
          value={settings.theme}
          onChange={(theme) => void updateSettings({ theme })}
          options={[
            ['dark', 'Dark'],
            ['light', 'Light'],
            ['system', 'System']
          ]}
        />
      </div>
      <div className="field">
        <span>Accent</span>
        <div className="inline">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`swatch${settings.accent === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => void updateSettings({ accent: c })}
            />
          ))}
          <input type="color" value={settings.accent} onChange={(e) => void updateSettings({ accent: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <span>Density</span>
        <Segmented
          value={settings.density}
          onChange={(density) => void updateSettings({ density })}
          options={[
            ['comfortable', 'Comfortable'],
            ['compact', 'Compact']
          ]}
        />
      </div>
    </div>
  )
}

function AdvancedSection() {
  const settings = useSettings()
  const [json, setJson] = useState('')
  return (
    <div className="stack">
      <label className="field">
        <span>Poll every (seconds)</span>
        <input type="number" min={15} max={3600} value={settings.pollSeconds} onChange={(e) => void updateSettings({ pollSeconds: Math.max(15, Number(e.target.value)) })} />
      </label>
      <label className="field">
        <span>While runs are active, poll every (seconds)</span>
        <input
          type="number"
          min={5}
          max={600}
          value={settings.activePollSeconds}
          onChange={(e) => void updateSettings({ activePollSeconds: Math.max(5, Number(e.target.value)) })}
        />
      </label>
      <p className="dim small">Unchanged data costs nothing: RepoDeck uses ETag requests, which GitHub doesn't count against your rate limit.</p>
      <label className="check">
        <input type="checkbox" checked={settings.closeToTray} onChange={(e) => void updateSettings({ closeToTray: e.target.checked })} />
        Keep running in the tray when the window is closed (so notifications keep coming)
      </label>
      <div className="field">
        <span>Configuration</span>
        <div className="inline">
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(await api.exportSettings())
              toast('Settings copied to clipboard', 'ok')
            }}
          >
            Copy settings JSON
          </button>
          <button
            className="btn"
            onClick={() => {
              void updateSettings({ widgets: DEFAULT_SETTINGS.widgets, layout: DEFAULT_SETTINGS.layout })
              toast('Dashboard reset', 'ok')
            }}
          >
            Reset dashboard layout
          </button>
        </div>
        <textarea rows={4} placeholder="Paste settings JSON to import…" value={json} onChange={(e) => setJson(e.target.value)} />
        <button
          className="btn"
          disabled={!json.trim()}
          onClick={async () => {
            const r = await api.importSettings(json)
            toast(r.ok ? 'Settings imported' : `Import failed: ${r.error}`, r.ok ? 'ok' : 'error')
            if (r.ok) setJson('')
          }}
        >
          Import
        </button>
      </div>
    </div>
  )
}

export function SettingsModal() {
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>(settings.repos.length ? 'notify' : 'repos')
  return (
    <Modal title="Settings" onClose={closeModal} width={620}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          ['account', 'Account'],
          ['repos', 'Repositories'],
          ['notify', 'Notifications'],
          ['look', 'Appearance'],
          ['advanced', 'Advanced']
        ]}
      />
      <div className="settings-body">
        {tab === 'account' && <AccountSection />}
        {tab === 'repos' && <ReposSection />}
        {tab === 'notify' && <NotifySection />}
        {tab === 'look' && <LookSection />}
        {tab === 'advanced' && <AdvancedSection />}
      </div>
    </Modal>
  )
}
