import type { Choice } from '../types'

const OPTION = /^\s*(\d+)[.)]\s+(.+)$/
const TRAILING_LINES = 2
const TRADEOFF = /\s+[—–-]\s+/
const SECTION_HEAD = /^\s*(\*\*[^*]{1,60}\*\*[.:]?|#{1,6}\s+.+)\s*$/

export function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\[(recommended|rec)\]\s*/gi, ' ')
    .trim()
}

function isRecommended(raw: string): boolean {
  return /^\*\*/.test(raw.trim()) || /\[(recommended|rec)\]|\(recommended\)/i.test(raw)
}

export type Split = { before: string; question: string; options: Choice[]; after: string[] }

export function splitOptions(answer: string): Split | null {
  const lines = answer.split('\n')
  const at = (i: number) => lines[i] ?? ''
  let end = lines.length - 1
  while (end >= 0 && !OPTION.test(at(end))) end--
  if (end < 0) return null
  const after = lines.slice(end + 1).filter(l => l.trim())
  if (after.length > TRAILING_LINES) return null

  let start = end
  while (start > 0 && (OPTION.test(at(start - 1)) || (!at(start - 1).trim() && OPTION.test(at(start - 2))))) start--
  const rows = lines.slice(start, end + 1).filter(l => OPTION.test(l))
  if (rows.length < 2) return null

  let q = start - 1
  while (q >= 0 && !at(q).trim()) q--
  let question = q >= 0 ? plain(at(q)).replace(/:$/, '') : ''
  let trailing = after
  let beforeEnd = Math.max(0, q)
  if (!question.endsWith('?') && !/^(options|choose|pick)/i.test(question)) {
    if (q >= 0 && SECTION_HEAD.test(at(q))) return null
    const asked = after.findIndex(l => plain(l).endsWith('?'))
    if (asked < 0) return null
    question = plain(after[asked]!)
    trailing = after.filter((_, i) => i !== asked)
    beforeEnd = start
  }

  const pointedAt = trailing.join(' ').match(/go with \**(\d+)/i)?.[1]
  const options = rows.map((raw): Choice => {
    const [, key = '', text = ''] = raw.match(OPTION) ?? []
    const [label = '', ...rest] = plain(text).split(TRADEOFF)
    const detail = rest.join(' — ') || undefined
    return { key, label, detail, recommended: isRecommended(text) || key === pointedAt || undefined }
  })
  return { before: lines.slice(0, beforeEnd).join('\n').trimEnd(), question, options, after: trailing.map(plain) }
}
