import { useEffect, useRef, useState } from 'react'
import type { AccountInfo } from '../../../shared/types'
import { api, toast, useSettings } from '../lib/store'
import { Popover } from './ui'

/** Switches which signed-in account the dashboard follows. Hidden until there is a second account to switch to. */
export function AccountSwitcher() {
  const settings = useSettings()
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (settings.accounts.length) api.listAccounts().then(setAccounts, () => setAccounts([]))
  }, [settings.accounts, settings.activeAccount])
  if (!settings.accounts.length) return null

  const active = accounts.find((a) => a.active)
  const label = (a: AccountInfo) => a.login ?? a.name
  const pick = async (a: AccountInfo) => {
    setOpen(false)
    const r = await api.setActiveAccount(a.primary ? 'primary' : a.id)
    if (!r.ok) toast(`Couldn't switch account: ${r.error}`, 'error')
  }
  return (
    <>
      <button ref={ref} className="btn btn-sm account-switch" aria-expanded={open} title="Switch account" onClick={() => setOpen(!open)}>
        {active ? label(active) : 'Account'} <span className="dim">▾</span>
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)}>
          <div role="menu" style={{ display: 'contents' }}>
            {accounts.map((a) => (
              <button key={a.primary ? 'primary' : a.id} role="menuitemradio" aria-checked={!!a.active} disabled={a.status !== 'ok'} onClick={() => void pick(a)}>
                <span>
                  {a.active ? '✓ ' : ''}
                  {label(a)} <span className="dim small">{a.host}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}
