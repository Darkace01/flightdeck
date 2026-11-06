import { useEffect, useMemo, useState } from 'react'
import { findOldPrs, findStaleBranches, type OldPr, type StaleBranch } from '../../../shared/cleanup'
import { api, toast } from '../lib/store'
import { openPr } from '../lib/open'
import { invalidate, useLoad } from '../lib/useLoad'
import type { SectionProps } from './RepoWorkspace'
import { Empty, Skeleton } from './ui'

// Finds merged and stale branches and old open PRs, and removes the ones you tick. Nothing is touched until you
// have reviewed the exact list and confirmed it; merged branches are ticked for you, anything with unmerged work
// or a PR is not.

export function CleanupSection({ repo, info }: SectionProps) {
  const base = info?.defaultBranch
  const [staleDays, setStaleDays] = useState(90)
  const [now] = useState(Date.now)
  const branches = useLoad(repo, () => (base ? api.listBranches(repo, base) : new Promise<never>(() => {})), [base])
  const prs = useLoad(repo, () => api.listOpenPrs(repo), [])
  const [pickedBranches, setPickedBranches] = useState<Set<string>>(new Set())
  const [pickedPrs, setPickedPrs] = useState<Set<number>>(new Set())
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<{ item: string; error: string }[]>([])

  const staleBranches = useMemo(() => (branches.data ? findStaleBranches(branches.data, { now, staleDays }) : []), [branches.data, now, staleDays])
  const oldPrs = useMemo(() => (prs.data ? findOldPrs(prs.data, { now, days: staleDays }) : []), [prs.data, now, staleDays])

  // Tick the merged branches when the list (or the age threshold) changes. Those are safe: nothing on them is unmerged.
  useEffect(() => {
    setPickedBranches(new Set(staleBranches.filter((b) => b.reason === 'merged').map((b) => b.name)))
    setPickedPrs(new Set())
    setReviewing(false)
  }, [staleBranches, oldPrs])

  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    apply(next)
    setReviewing(false)
  }

  const chosenBranches = staleBranches.filter((b) => pickedBranches.has(b.name))
  const chosenPrs = oldPrs.filter((p) => pickedPrs.has(p.number))
  const unmerged = chosenBranches.filter((b) => b.reason === 'stale')
  const total = chosenBranches.length + chosenPrs.length

  const confirm = async () => {
    setBusy(true)
    const r = await api.cleanup(repo, { branches: chosenBranches.map((b) => b.name), closePrs: chosenPrs.map((p) => p.number) })
    setBusy(false)
    setFailures(r.failed)
    toast(r.failed.length ? `Cleaned up ${r.done.length}, ${r.failed.length} failed` : `Cleaned up ${r.done.length} item${r.done.length === 1 ? '' : 's'}`, r.failed.length ? 'error' : 'ok')
    setReviewing(false)
    invalidate(repo)
  }

  if (!base || branches.loading || prs.loading) return <Skeleton rows={6} />
  if (branches.error || prs.error) return <p className="del">{branches.error ?? prs.error}</p>

  return (
    <div className="repo-tab cleanup">
      <div className="ws-toolbar">
        <label className="inline">
          Stale after
          <input type="number" min={7} max={730} value={staleDays} onChange={(e) => setStaleDays(Math.min(730, Math.max(7, Number(e.target.value) || 90)))} style={{ width: 64 }} />
          days
        </label>
        <span className="dim small">Branches with an open PR, the default branch and long-lived names such as main or develop are never listed.</span>
      </div>

      <Group title={`Merged branches (${staleBranches.filter((b) => b.reason === 'merged').length})`} hint="Everything on these is already in the default branch.">
        {staleBranches
          .filter((b) => b.reason === 'merged')
          .map((b) => (
            <BranchRow key={b.name} b={b} checked={pickedBranches.has(b.name)} onChange={() => toggle(pickedBranches, b.name, setPickedBranches)} />
          ))}
      </Group>
      <Group title={`Stale branches (${staleBranches.filter((b) => b.reason === 'stale').length})`} hint="Unmerged commits, untouched for a long time. Deleting one loses that work.">
        {staleBranches
          .filter((b) => b.reason === 'stale')
          .map((b) => (
            <BranchRow key={b.name} b={b} checked={pickedBranches.has(b.name)} onChange={() => toggle(pickedBranches, b.name, setPickedBranches)} />
          ))}
      </Group>
      <Group title={`Old pull requests (${oldPrs.length})`} hint="Open and not updated for a while. Closing one doesn't delete its branch.">
        {oldPrs.map((p) => (
          <PrRow key={p.number} repo={repo} p={p} checked={pickedPrs.has(p.number)} onChange={() => toggle(pickedPrs, p.number, setPickedPrs)} />
        ))}
      </Group>

      {!staleBranches.length && !oldPrs.length && <Empty>Nothing to clean up. No merged or stale branches, no old pull requests.</Empty>}

      {failures.length > 0 && (
        <div className="cleanup-failures del" role="alert">
          {failures.map((f) => (
            <div key={f.item}>
              Couldn't handle {f.item}: {f.error}
            </div>
          ))}
        </div>
      )}

      {total > 0 && !reviewing && (
        <div className="cleanup-bar">
          <button className="btn btn-danger" onClick={() => setReviewing(true)}>
            Review {chosenBranches.length > 0 && `${chosenBranches.length} branch${chosenBranches.length === 1 ? '' : 'es'}`}
            {chosenBranches.length > 0 && chosenPrs.length > 0 && ' and '}
            {chosenPrs.length > 0 && `${chosenPrs.length} PR${chosenPrs.length === 1 ? '' : 's'}`}…
          </button>
        </div>
      )}

      {reviewing && (
        <section className="cleanup-confirm" role="alertdialog" aria-label="Confirm cleanup">
          <h3>This can't be undone from Pushback</h3>
          <ul>
            {chosenBranches.map((b) => (
              <li key={b.name}>
                Delete branch <span className="mono strong">{b.name}</span>
                {b.reason === 'stale' && <span className="del"> — {b.ahead} unmerged commit{b.ahead === 1 ? '' : 's'} will be lost from this branch</span>}
              </li>
            ))}
            {chosenPrs.map((p) => (
              <li key={p.number}>
                Close pull request #{p.number} <span className="strong">{p.title}</span>
              </li>
            ))}
          </ul>
          {unmerged.length > 0 && <p className="del">{unmerged.length} branch{unmerged.length === 1 ? '' : 'es'} contain work that isn't in {base}.</p>}
          <div className="inline">
            <button className="btn btn-danger" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Working…' : `Yes, delete ${chosenBranches.length} and close ${chosenPrs.length}`}
            </button>
            <button className="btn" disabled={busy} onClick={() => setReviewing(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode[] }) {
  if (!children.length) return null
  return (
    <section>
      <h3 className="cleanup-title">
        {title} <span className="dim small">{hint}</span>
      </h3>
      <ul className="list">{children}</ul>
    </section>
  )
}

function BranchRow({ b, checked, onChange }: { b: StaleBranch; checked: boolean; onChange: () => void }) {
  return (
    <li className="row">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={`Select branch ${b.name}`} />
      <div className="row-main">
        <div className="row-title">
          <span className="strong mono">{b.name}</span>
          {b.reason === 'stale' && <span className="badge badge-muted">{b.ahead} unmerged</span>}
        </div>
        <div className="row-meta">
          <span>{b.author}</span>
          <span>last commit {b.ageDays} days ago</span>
        </div>
      </div>
    </li>
  )
}

function PrRow({ repo, p, checked, onChange }: { repo: string; p: OldPr; checked: boolean; onChange: () => void }) {
  return (
    <li className="row">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={`Select pull request ${p.number}`} />
      <div className="row-main">
        <div className="row-title">
          {p.draft && <span className="badge badge-muted">Draft</span>}
          <button className="link strong" onClick={() => openPr(repo, p.number)}>
            {p.title}
          </button>
        </div>
        <div className="row-meta">
          <span>#{p.number}</span>
          <span>{p.author}</span>
          <span>no activity for {p.ageDays} days</span>
        </div>
      </div>
    </li>
  )
}
