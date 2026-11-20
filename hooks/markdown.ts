import { table, wrap } from './draw'
import type { Line, Style } from './draw'

const URL = /https?:\/\/[^\s<>()`\]]*[^\s<>()`\].,;:!?'"]/g
const INLINE = new RegExp(/`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s](?:[^*]*[^*\s])?)\*/.source + `|(${URL.source})`, 'g')
const PATH = /^(?:~|\.{1,2})?\/?(?:[\w.@-]+\/)+[\w.@-]*(?::\d+)?$|^[\w.-]+\.(?:rb|ts|tsx|js|jsx|json|ya?ml|md|py|go|tf|hcl|sh|toml|lock|css|html|erb|sql)(?::\d+)?$/
const COUNT = /\b\d+(?:[.,:]\d+)*(?:%|ms|[smhkx]|KB|MB|GB|KiB|MiB|GiB)?\b/g
const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const HEADER = /^#{1,6}\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}/

export function inline(text: string, base?: Style): Line {
  const line: Line = []
  const plain = (t: string) => {
    if (!t) return
    if (base) return void line.push({ text: t, style: base })
    let last = 0
    for (const m of t.matchAll(COUNT)) {
      if (m.index! > last) line.push({ text: t.slice(last, m.index) })
      line.push({ text: m[0], style: 'count' })
      last = m.index! + m[0].length
    }
    if (last < t.length) line.push({ text: t.slice(last) })
  }
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    plain(text.slice(last, m.index))
    if (m[1] !== undefined) line.push({ text: m[1], style: PATH.test(m[1]) ? 'path' : 'code' })
    else if (m[2] !== undefined || m[3] !== undefined) line.push(...inline((m[2] ?? m[3])!, 'strong'))
    else if (m[4] !== undefined) line.push({ text: m[4], style: 'link' })
    else if (m[6] !== undefined) line.push(...inline(m[6], 'em'))
    else line.push({ text: m[7]!, style: 'link' })
    last = m.index! + m[0].length
  }
  plain(text.slice(last))
  return line
}

export const urls = (text: string): string[] => [...new Set(text.match(URL) ?? [])]

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(c => c.trim().replace(/[`*]/g, ''))

function leadIn(line: Line): Line {
  const end = line.findIndex(s => s.style !== 'strong')
  if (end === 0) return line
  return line.map((s, i) => (end === -1 || i < end ? { ...s, style: 'lead' as Style } : s))
}

export function markdown(text: string, inner: number): Line[] {
  const out: Line[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.trim()) {
      if (out.length && out[out.length - 1]!.length) out.push([])
      continue
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const header = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(cells(lines[i++]!))
      i -= 1
      out.push(...table(header, rows))
      continue
    }
    const header = line.match(HEADER)
    if (header) {
      out.push(...wrap(inline(header[1]!, 'header'), inner))
      continue
    }
    const bullet = line.match(BULLET)
    if (bullet) {
      const indent = bullet[1]!
      const marker = /^\d/.test(bullet[2]!) ? bullet[2]! : '•'
      const lead = [{ text: indent }, { text: marker, style: 'bullet' as Style }, { text: ' ' }]
      out.push(...wrap([...lead, ...leadIn(inline(bullet[3]!))], inner, indent.length + marker.length + 1))
      continue
    }
    const indent = line.length - line.trimStart().length
    out.push(...wrap([{ text: ' '.repeat(indent) }, ...leadIn(inline(line.trim()))], inner, indent))
  }
  while (out.length && !out[out.length - 1]!.length) out.pop()
  return out.map(l => l.filter(s => s.text))
}
