import { useMemo, type MouseEvent } from 'react'
import { openInApp } from '../lib/open'

const DROP = 'script, style, iframe, frame, object, embed, form, input, button, link, meta, base'
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset'])

/**
 * GitHub already sanitises body_html, but it lands in our privileged renderer, so strip anything
 * executable again. Relative links in a README are resolved against the repo.
 */
function clean(html: string, repo?: string, branch?: string): string {
  // DOMParser documents are inert: nothing in them loads or runs while we clean.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll(DROP).forEach((el) => el.remove())
  for (const el of doc.body.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      const n = name.toLowerCase()
      if (n.startsWith('on') || n === 'style' || (URL_ATTRS.has(n) && /^\s*(javascript|vbscript|data):/i.test(value) && !/^data:image\//i.test(value)))
        el.removeAttribute(name)
    }
    if (!repo || !branch) continue
    const relative = (v: string | null) => v && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(v)
    const src = el.getAttribute('src')
    if (el.tagName === 'IMG' && relative(src)) el.setAttribute('src', `https://raw.githubusercontent.com/${repo}/${branch}/${src!.replace(/^\.?\//, '')}`)
    const href = el.getAttribute('href')
    if (el.tagName === 'A' && relative(href)) el.setAttribute('href', `https://github.com/${repo}/blob/${branch}/${href!.replace(/^\.?\//, '')}`)
  }
  return doc.body.innerHTML
}

export function Markdown({ html, repo, branch, empty = 'No description provided.' }: { html: string; repo?: string; branch?: string; empty?: string }) {
  const safe = useMemo(() => clean(html, repo, branch), [html, repo, branch])

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (!href) return
    e.preventDefault()
    if (href.startsWith('#')) {
      // GitHub prefixes heading ids with "user-content-".
      const id = decodeURIComponent(href.slice(1))
      e.currentTarget.querySelector(`[id="${CSS.escape(id)}"], [id="user-content-${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth' })
    } else if (/^https?:\/\//.test(href)) openInApp(href)
  }

  if (!safe.trim()) return <p className="dim">{empty}</p>
  return <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: safe }} />
}
