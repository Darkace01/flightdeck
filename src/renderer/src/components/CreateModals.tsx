import { useEffect, useState } from 'react'
import { api, toast } from '../lib/store'
import { closeModal, openModal } from '../lib/ui'
import { invalidate, useLoad } from '../lib/useLoad'
import { Modal } from './ui'

/** Branches plus the default branch, which the PR and release forms both need. */
function useBranches(repo: string) {
  return useLoad(
    repo,
    async () => {
      const info = await api.repoInfo(repo)
      return { defaultBranch: info.defaultBranch, branches: await api.listBranches(repo, info.defaultBranch) }
    },
    []
  )
}

export function NewPrModal({ repo, head: initialHead }: { repo: string; head?: string }) {
  const { data, error } = useBranches(repo)
  const [base, setBase] = useState('')
  const [head, setHead] = useState(initialHead ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)

  // Once branches load: default the base, pick the newest other branch as head, and suggest a title from its last commit.
  useEffect(() => {
    if (!data) return
    setBase((b) => b || data.defaultBranch)
    const h = head || data.branches.find((b) => !b.isDefault)?.name || ''
    setHead(h)
    const branch = data.branches.find((b) => b.name === h)
    if (branch && !title) setTitle(branch.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const headInfo = data?.branches.find((b) => b.name === head)
  const submit = async () => {
    setBusy(true)
    const r = await api.createPr(repo, { title: title.trim(), head, base, body, draft })
    setBusy(false)
    if (!r.ok) return toast(`Couldn't open the pull request: ${r.error}`, 'error')
    toast(`Opened #${r.number}`, 'ok')
    invalidate(repo)
    openModal({ kind: 'pr', repo, number: r.number! })
  }

  return (
    <Modal title={`New pull request · ${repo}`} onClose={closeModal} width={680}>
      {error && <p className="del">{error}</p>}
      <div className="form-row">
        <label className="field">
          <span>Merge into (base)</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} disabled={!data}>
            {data?.branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
        <span className="form-arrow">←</span>
        <label className="field">
          <span>From (head)</span>
          <select value={head} onChange={(e) => setHead(e.target.value)} disabled={!data}>
            {data?.branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>
      {headInfo && base === data?.defaultBranch && (
        <p className={`small ${headInfo.ahead ? 'dim' : 'del'}`}>
          {headInfo.ahead ? `${head} has ${headInfo.ahead} commit${headInfo.ahead === 1 ? '' : 's'} that ${base} doesn't.` : `${head} has nothing that ${base} doesn't.`}
          {headInfo.openPr && ` It already has an open PR (#${headInfo.openPr}).`}
        </p>
      )}
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Description (Markdown)</span>
        <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What does this change, and why?" />
      </label>
      <label className="check">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
        Open as a draft
      </label>
      <footer className="modal-actions">
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !title.trim() || !head || !base || head === base} onClick={() => void submit()}>
          {busy ? 'Opening…' : draft ? 'Open draft pull request' : 'Open pull request'}
        </button>
      </footer>
    </Modal>
  )
}

export function NewIssueModal({ repo }: { repo: string }) {
  const { data: labels } = useLoad(repo, () => api.listLabels(repo), [])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const r = await api.createIssue(repo, { title: title.trim(), body, labels: picked })
    setBusy(false)
    if (!r.ok) return toast(`Couldn't create the issue: ${r.error}`, 'error')
    toast(`Created #${r.number}`, 'ok')
    invalidate(repo)
    openModal({ kind: 'issue', repo, number: r.number! })
  }

  return (
    <Modal title={`New issue · ${repo}`} onClose={closeModal} width={640}>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Description (Markdown)</span>
        <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {labels && labels.length > 0 && (
        <div className="field">
          <span>Labels</span>
          <div className="inline wrap">
            {labels.map((l) => {
              const on = picked.includes(l.name)
              return (
                <button
                  key={l.name}
                  className={`label label-pick${on ? ' on' : ''}`}
                  style={{ ['--label' as string]: `#${l.color}` }}
                  title={l.description ?? undefined}
                  onClick={() => setPicked(on ? picked.filter((p) => p !== l.name) : [...picked, l.name])}
                >
                  {on && '✓ '}
                  {l.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <footer className="modal-actions">
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
          {busy ? 'Creating…' : 'Create issue'}
        </button>
      </footer>
    </Modal>
  )
}

/** v1.2.3 -> v1.2.4 (keeps any "v" prefix); anything else gets no suggestion. */
function nextTag(tag?: string): string {
  const m = tag?.match(/^(v?)(\d+)\.(\d+)\.(\d+)$/)
  return m ? `${m[1]}${m[2]}.${m[3]}.${Number(m[4]) + 1}` : ''
}

export function NewReleaseModal({ repo }: { repo: string }) {
  const { data } = useBranches(repo)
  const { data: releases } = useLoad(repo, () => api.listReleases(repo), [])
  const latest = releases?.find((r) => !r.draft && !r.prerelease)
  const [tag, setTag] = useState('')
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [generateNotes, setGenerateNotes] = useState(true)
  const [draft, setDraft] = useState(false)
  const [prerelease, setPrerelease] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data && !target) setTarget(data.defaultBranch)
  }, [data, target])
  useEffect(() => {
    if (releases && !tag) setTag(nextTag(latest?.tag))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases])

  const exists = releases?.some((r) => r.tag === tag.trim())
  const submit = async () => {
    setBusy(true)
    const r = await api.createRelease(repo, { tag: tag.trim(), target, name: name.trim(), body, draft, prerelease, generateNotes })
    setBusy(false)
    if (!r.ok) return toast(`Couldn't create the release: ${r.error}`, 'error')
    toast(draft ? `Saved draft ${tag}` : `Published ${tag}`, 'ok')
    invalidate(repo)
    closeModal()
  }

  return (
    <Modal title={`New release · ${repo}`} onClose={closeModal} width={640}>
      <div className="form-row">
        <label className="field">
          <span>Tag</span>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.0.0" autoFocus />
          {latest && <small>Latest release: {latest.tag}</small>}
        </label>
        <label className="field">
          <span>Target (if the tag is new)</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!data}>
            {data?.branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>
      {exists && <p className="del small">A release for {tag} already exists.</p>}
      <label className="field">
        <span>Title</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tag || 'Release title'} />
      </label>
      <label className="field">
        <span>Notes (Markdown)</span>
        <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={generateNotes ? 'Optional — GitHub adds generated notes below this' : ''} />
      </label>
      <label className="check">
        <input type="checkbox" checked={generateNotes} onChange={(e) => setGenerateNotes(e.target.checked)} />
        Generate release notes from merged PRs
      </label>
      <label className="check">
        <input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} />
        Mark as a pre-release
      </label>
      <label className="check">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
        Save as a draft (not visible to others until published)
      </label>
      {!draft && <p className="dim small">Publishing creates the tag (if it's new), notifies watchers and can start release workflows.</p>}
      <footer className="modal-actions">
        <span className="spacer" />
        <button className="btn" onClick={closeModal}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !tag.trim() || exists} onClick={() => void submit()}>
          {busy ? 'Saving…' : draft ? 'Save draft' : 'Publish release'}
        </button>
      </footer>
    </Modal>
  )
}
