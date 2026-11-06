import type { MergedPr } from './types'

// Drafting release notes from merged PRs. Pure, so the same text can be previewed, edited and tested.

const SECTIONS: { title: string; labels: RegExp }[] = [
  { title: 'Breaking changes', labels: /^(breaking|breaking[- ]change)$/i },
  { title: 'Features', labels: /^(feature|enhancement|feat)$/i },
  { title: 'Fixes', labels: /^(bug|fix|bugfix)$/i },
  { title: 'Documentation', labels: /^(docs?|documentation)$/i },
  { title: 'Maintenance', labels: /^(chore|maintenance|dependencies|deps|ci|refactor)$/i }
]

const OTHER = 'Other changes'
const PREFIX = /^(\w+)(\(.+?\))?(!)?:\s*/

/** The section a PR belongs to: the first matching label, then a conventional-commit prefix in the title, else "Other". */
export function sectionOf(pr: Pick<MergedPr, 'title' | 'labels'>): string {
  for (const s of SECTIONS) if (pr.labels.some((l) => s.labels.test(l))) return s.title
  const prefix = pr.title.match(PREFIX)
  if (prefix) {
    if (prefix[3]) return 'Breaking changes'
    const hit = SECTIONS.find((s) => s.labels.test(prefix[1]))
    if (hit) return hit.title
  }
  return OTHER
}

/** Markdown release notes: one bullet per PR under headings, each linking its PR and crediting the author. */
export function draftReleaseNotes(prs: MergedPr[], opts: { repo: string; since?: string | null; tag?: string }): string {
  if (!prs.length) return 'No merged pull requests since the last release.'
  const groups = new Map<string, MergedPr[]>()
  for (const pr of [...prs].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))) {
    const key = sectionOf(pr)
    groups.set(key, [...(groups.get(key) ?? []), pr])
  }
  const lines: string[] = []
  for (const title of [...SECTIONS.map((s) => s.title), OTHER]) {
    const list = groups.get(title)
    if (!list) continue
    lines.push(`## ${title}`, '')
    for (const pr of list) lines.push(`- ${pr.title.replace(PREFIX, '')} ([#${pr.number}](${pr.url})) by @${pr.author}`)
    lines.push('')
  }
  const authors = [...new Set(prs.map((p) => p.author))].filter((a) => !a.endsWith('[bot]')).sort((a, b) => a.localeCompare(b))
  if (authors.length) lines.push(`Thanks to ${authors.map((a) => `@${a}`).join(', ')}.`, '')
  if (opts.since && opts.tag) lines.push(`**Full changelog**: https://github.com/${opts.repo}/compare/${opts.since}...${opts.tag}`)
  return lines.join('\n').trimEnd()
}
