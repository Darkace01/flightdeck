import { memo, useMemo, useState } from 'react'
import { filterPackages, PACKAGE_TYPE_LABEL, shortVersion } from '../../../shared/packages'
import type { PackageInfo } from '../../../shared/types'
import { Empty, Icon, Skeleton } from '../components/ui'
import { matches, timeAgo, useNow } from '../lib/format'
import { useOrgs, usePackages, useVersions, versionKey } from '../lib/packages'
import { api } from '../lib/store'
import type { WidgetProps } from './types'

/** Versions of one opened package. Loaded only when the row is opened, since each package costs a request. */
function Versions({ pkg }: { pkg: PackageInfo }) {
  const now = useNow()
  const { data, loading, errors } = useVersions([versionKey(pkg.owner, pkg.type, pkg.name)])
  const list = data[0] ?? []
  if (loading) return <div className="dim small pkg-versions">Loading versions…</div>
  if (errors.length) return <div className="dim small pkg-versions">{errors[0].split(': ').slice(1).join(': ')}</div>
  if (!list.length) return <div className="dim small pkg-versions">No versions.</div>
  return (
    <ul className="pkg-versions">
      {list.map((v) => (
        <li key={v.id} className="pkg-version clickable" onClick={() => void api.openExternal(v.url || pkg.url)}>
          <span className="mono">{shortVersion(v.name)}</span>
          {v.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          <span className="dim small">{timeAgo(v.createdAt, now)}</span>
        </li>
      ))}
      {pkg.versionCount > list.length && <li className="dim small">and {pkg.versionCount - list.length} older. Open on GitHub to see them all.</li>}
    </ul>
  )
}

/** Packages you have published (switch to "Organisations" for the ones your orgs publish), with each package's versions. */
export const PackagesWidget = memo(function PackagesWidget({ widget, filter }: WidgetProps) {
  const now = useNow()
  const [open, setOpen] = useState<string | null>(null)
  const scope = widget.options.scope === 'org' ? 'org' : 'user'
  const org = String(widget.options.org ?? '').trim()

  // Organisation level with no org named covers every org you belong to.
  const orgs = useOrgs(['orgs'])
  const owners = scope === 'user' ? ['@me'] : org ? [org] : (orgs.data[0] ?? [])
  const { data, loading, errors } = usePackages(owners)

  const packages = useMemo(
    () =>
      filterPackages(
        data.flatMap((d) => d.packages),
        String(widget.options.type ?? ''),
        String(widget.options.visibility ?? '')
      ).filter((p) => !filter || matches(`${p.name} ${p.owner} ${p.repo ?? ''} ${PACKAGE_TYPE_LABEL[p.type]}`, filter)),
    [data, widget.options.type, widget.options.visibility, filter]
  )

  if (scope === 'org' && !org && orgs.loading) return <Skeleton />
  if (scope === 'org' && !org && !owners.length && !orgs.errors.length) return <Empty>You are not in any organisations.</Empty>
  if (loading && !data.length) return <Skeleton />

  const multiOwner = owners.length > 1
  const notes = [...new Set([...data.flatMap((d) => (d.unavailable ? [`${d.owner === '@me' ? 'Your packages' : d.owner}: ${d.unavailable}`] : [])), ...errors, ...orgs.errors])]
  const total = data.flatMap((d) => d.packages).length

  return (
    <div className="packages">
      {!packages.length ? (
        <Empty>{total ? 'No packages match the filters.' : 'No packages published.'}</Empty>
      ) : (
        <ul className="list">
          {packages.map((p) => {
            const key = `${p.owner}/${p.type}/${p.name}`
            const isOpen = open === key
            return (
              <li key={key} className="pkg">
                <div className="row clickable" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                  <span className={`pkg-caret${isOpen ? ' open' : ''}`}>
                    <Icon name="up" size={12} />
                  </span>
                  <div className="row-main">
                    <div className="row-title strong">{p.name}</div>
                    <div className="row-meta">
                      {multiOwner && <span className="chip">{p.owner}</span>}
                      <span className="chip">{PACKAGE_TYPE_LABEL[p.type]}</span>
                      {p.visibility !== 'public' && <span className="chip">{p.visibility}</span>}
                      <span>
                        {p.versionCount} {p.versionCount === 1 ? 'version' : 'versions'}
                      </span>
                      <span>updated {timeAgo(p.updatedAt, now)}</span>
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    title="Open on GitHub"
                    onClick={(e) => {
                      e.stopPropagation()
                      void api.openExternal(p.url)
                    }}
                  >
                    <Icon name="external" />
                  </button>
                </div>
                {isOpen && <Versions pkg={p} />}
              </li>
            )
          })}
        </ul>
      )}
      {notes.length > 0 && <div className="dim small pkg-note">{notes.join(' · ')}</div>}
    </div>
  )
})
