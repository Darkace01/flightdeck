import { useEffect, useLayoutEffect, useState } from 'react'
import { updateSettings } from '../lib/store'

// The first-run walkthrough: a spotlight on each part of the app with a short note. Steps whose element
// isn't on screen (sidebar hidden, no widgets yet) show as a centred card instead.

interface Step {
  title: string
  body: string
  /** CSS selector of the element to spotlight; the first match that's visible is used. */
  target?: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Pushback',
    body: 'A quick tour of where everything is. It takes under a minute; press Esc to skip, and replay it any time from the command palette (Take the tour).'
  },
  {
    title: 'Your repos, down the side',
    body: 'Pinned repos sit at the top as tiles. Below them are the dashboard, your open tabs, and every repo you watch. Right-click a tab to pin it. Ctrl+B hides or shows the sidebar.',
    target: '.repo-sidebar'
  },
  {
    title: 'Dashboards',
    body: 'Switch dashboards here. ▾ holds the rest, and New dashboard starts one from a template such as CI monitor, Code review or Deployments.',
    target: '.dash-tabs'
  },
  {
    title: 'Where you are',
    body: 'Everything opens as a page in this tree. The breadcrumbs show how deep you are; click any crumb to go back up to it, or press Esc to go back one level.',
    target: '.crumbs'
  },
  {
    title: 'Widgets and filters',
    body: 'Each widget has filters (the funnel): choose repos, branch, workflow, author and more. The gear opens its settings.',
    target: '.widget-head'
  },
  {
    title: 'Make the dashboard yours',
    body: 'Edit layout (or press E) to drag, resize, add and remove widgets.',
    target: '.topbar .icon-btn[title^="Edit layout"]'
  },
  {
    title: 'Find anything',
    body: 'Ctrl+K searches every PR, run, workflow, repo, theme and command.',
    target: '.search-trigger'
  },
  {
    title: 'Open a repo',
    body: 'Open any repo in a tab. Each repo tab has its README, PRs, issues, branches, runs, deployments, and local git tools such as the commit graph, blame, compare and search.',
    target: '.side-add, .tab-add'
  },
  {
    title: 'Settings',
    body: 'Themes, tabs (across the top or down the side), notifications, your default editor, and Find repos on this computer to link all your clones at once.',
    target: '.topbar .icon-btn[title^="Settings"]'
  },
  { title: "You're all set", body: 'Click a PR, run or repo anywhere to dive in. Happy shipping!' }
]

function visible(selector?: string): HTMLElement | null {
  if (!selector) return null
  for (const el of document.querySelectorAll<HTMLElement>(selector)) if (el.offsetWidth && el.offsetHeight) return el
  return null
}

export function Tour() {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]
  const finish = () => void updateSettings({ tourDone: true })

  useLayoutEffect(() => {
    const place = () => setRect(visible(step.target)?.getBoundingClientRect() ?? null)
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') i < STEPS.length - 1 ? setI(i + 1) : finish()
      else if (e.key === 'ArrowLeft' && i > 0) setI(i - 1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Put the card beside the spotlight: below it if there's room, else above; otherwise centred.
  const pad = 6
  const card = rect
    ? {
        top: rect.bottom + 180 < window.innerHeight ? rect.bottom + 12 : Math.max(12, rect.top - 192),
        left: Math.min(Math.max(12, rect.left), window.innerWidth - 372)
      }
    : undefined
  // A tall target (the sidebar) gets the card to its right instead.
  const beside = rect && rect.height > window.innerHeight * 0.6 ? { top: Math.max(12, rect.top + 40), left: Math.min(rect.right + 16, window.innerWidth - 372) } : undefined

  return (
    <div className="tour" role="dialog" aria-label="Pushback walkthrough">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className={`tour-card${rect ? '' : ' centred'}`} style={beside ?? card}>
        <div className="tour-step dim small">
          {i + 1} of {STEPS.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-dots">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <div className="inline">
          <button className="link small" onClick={finish}>
            Skip tour
          </button>
          <span className="spacer" />
          {i > 0 && (
            <button className="btn btn-sm" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-primary btn-sm" autoFocus onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}>
            {i < STEPS.length - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
