import { useEffect, useMemo, useState } from 'react'
import type { FoundClone } from '../../../shared/types'
import { BUSY_REPO_COUNT, FIRST_IMPORT_LIMIT, limitFirstImport, pollSlowdown } from '../../../shared/repos'
import { api, toast, updateSettings, useSettings } from '../lib/store'
import { closeModal } from '../lib/ui'
import { Empty, Modal, Skeleton } from './ui'

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Finds clones of GitHub repos on this computer, then links them (and optionally watches them) in one go. */
export function FindClonesModal() {
  const settings = useSettings()
  const [found, setFound] = useState<FoundClone[]>()
  const [where, setWhere] = useState('your home folder')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [watch, setWatch] = useState(true)
  const [auto, setAuto] = useState(true)
  const [busy, setBusy] = useState(false)

  const show = (clones: FoundClone[]) => {
    setFound(clones)
    // Pre-select whatever isn't fully set up yet: not linked to this folder, or not watched.
    const fresh = clones.filter((c) => settings.localPaths[c.repo] !== c.path || !settings.repos.some((r) => same(r, c.repo)))
    setPicked(new Set(fresh.map((c) => c.repo)))
  }
  useEffect(() => {
    api.scanClones(false).then((c) => c && show(c), () => setFound([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One row per repo: the scanner lists the most recently used clone first.
  const rows = useMemo(() => {
    const byRepo = new Map<string, { clone: FoundClone; copies: number }>()
    for (const c of found ?? []) {
      const key = c.repo.toLowerCase()
      const row = byRepo.get(key)
      if (row) row.copies++
      else byRepo.set(key, { clone: c, copies: 1 })
    }
    return [...byRepo.values()]
  }, [found])

  const toggle = (repo: string) => setPicked((p) => (p.has(repo) ? (p.delete(repo), new Set(p)) : new Set(p.add(repo))))
  // The first import watches at most FIRST_IMPORT_LIMIT repos (favourites first); everything picked is still linked.
  const wanted = [...picked].filter((r) => !settings.repos.some((w) => same(w, r)))
  const newlyWatched = limitFirstImport(wanted, settings.favoriteRepos, settings.repos.length)
  const heldBack = wanted.length - newlyWatched.length
  const watchedAfter = settings.repos.length + (watch ? newlyWatched.length : 0)

  const lookElsewhere = async () => {
    const before = found
    setFound(undefined)
    const clones = await api.scanClones(true)
    if (!clones) return setFound(before)
    setWhere('the folder you picked')
    show(clones)
  }

  const add = async () => {
    setBusy(true)
    const repos = [...picked]
    const linked = await api.linkScanned(repos)
    await updateSettings({ autoLinkClones: auto, ...(watch && newlyWatched.length ? { repos: [...settings.repos, ...newlyWatched] } : {}) })
    setBusy(false)
    toast(`Linked ${linked} ${linked === 1 ? 'repo' : 'repos'}${watch && newlyWatched.length ? `, now watching ${newlyWatched.length} more` : ''}`, 'ok')
    closeModal()
  }

  return (
    <Modal title="Find repos on this computer" onClose={closeModal} width={680}>
      {!found ? (
        <>
          <p className="dim">Looking for GitHub clones in {where}… This takes a few seconds.</p>
          <Skeleton rows={6} />
        </>
      ) : !rows.length ? (
        <Empty>No clones with a GitHub remote were found in {where}. Try another folder.</Empty>
      ) : (
        <>
          <label className="check select-all">
              <input
                type="checkbox"
                checked={picked.size === rows.length}
                ref={(el) => {
                  if (el) el.indeterminate = picked.size > 0 && picked.size < rows.length
                }}
                onChange={(e) => setPicked(new Set(e.target.checked ? rows.map((r) => r.clone.repo) : []))}
              />
              Found {rows.length} {rows.length === 1 ? 'repo' : 'repos'} in {where}
          </label>
          <ul className="clone-list">
            {rows.map(({ clone: c, copies }) => {
              const linkedHere = settings.localPaths[c.repo] === c.path
              const watched = settings.repos.some((r) => same(r, c.repo))
              return (
                <li key={c.repo}>
                  <label className="check">
                    <input type="checkbox" checked={picked.has(c.repo)} onChange={() => toggle(c.repo)} />
                    <span className="clone-main">
                      <span className="picker-name">
                        <span className="dim">{c.repo.split('/')[0]}/</span>
                        {c.repo.split('/')[1]}
                        {linkedHere && <span className="badge badge-muted">Linked</span>}
                        {watched && <span className="badge badge-ok">Watching</span>}
                      </span>
                      <span className="dim small mono clone-path" title={c.path}>
                        {c.path}
                        {copies > 1 && ` (+${copies - 1} other ${copies === 2 ? 'copy' : 'copies'}; using the most recently used)`}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <label className="check">
            <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
            Also watch them on the dashboard (runs, PRs and notifications)
          </label>
          {watch && heldBack > 0 && (
            <p className="warn-text small">
              To start, only {FIRST_IMPORT_LIMIT} repos are watched ({heldBack} more will be linked but not watched). Star your favourites in Settings → Repositories
              to choose which ones, and add more there later.
            </p>
          )}
          {watch && watchedAfter >= BUSY_REPO_COUNT && (
            <p className="dim small">
              With {watchedAfter} watched repos, Pushback polls {pollSlowdown(watchedAfter)}x less often to stay within GitHub's rate limit.
            </p>
          )}
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Link new clones automatically each time Pushback starts
          </label>
        </>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={() => void lookElsewhere()} disabled={!found}>
          Look in another folder…
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={!found || !picked.size || busy} onClick={() => void add()}>
          {busy ? 'Adding…' : `Add ${picked.size || ''} ${picked.size === 1 ? 'repo' : 'repos'}`}
        </button>
      </div>
    </Modal>
  )
}
