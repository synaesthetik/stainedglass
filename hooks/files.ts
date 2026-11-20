import { wrap } from './draw'
import type { Line, Seg, Style } from './draw'
import { highlight } from './highlight'

export type Hunk = { oldStart: number; newStart: number; lines: string[] }

const DIFF_ROWS = 40
const HEAD_ROWS = 12
const GUTTER = 4
const LANG_OF: Record<string, string> = {
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby', py: 'python', ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', mjs: 'js', go: 'go', rs: 'rust',
  tf: 'hcl', hcl: 'hcl', yml: 'yaml', yaml: 'yaml', json: 'json', sh: 'bash', zsh: 'bash', bash: 'bash', log: 'log', diff: 'diff', patch: 'diff',
}

export const shortPath = (path: string) => String(path ?? '').replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~')

export const langOf = (path: string) => LANG_OF[String(path ?? '').split('.').pop()?.toLowerCase() ?? ''] ?? ''

const lineCount = (text: string) => (text ? text.split('\n').length : 0)

export function changeCounts(input: any, output: any): [number, number] {
  const hunks: Hunk[] | undefined = output?.structuredPatch
  if (Array.isArray(hunks) && hunks.length) {
    const all = hunks.flatMap(h => h.lines)
    return [all.filter(l => l.startsWith('+')).length, all.filter(l => l.startsWith('-')).length]
  }
  if (typeof input?.content === 'string') return [lineCount(input.content), 0]
  return [lineCount(input?.new_string ?? ''), lineCount(input?.old_string ?? '')]
}

export function counts(added: number, removed: number): Line {
  return [
    ...(added ? [{ text: `+${added}`, style: 'ok' as Style }] : []),
    ...(added && removed ? [{ text: ' ' }] : []),
    ...(removed ? [{ text: `−${removed}`, style: 'bad' as Style }] : []),
  ]
}

function numbered(n: number | undefined, body: Line, inner: number): Line[] {
  const gutter: Seg = { text: (n === undefined ? '' : String(n)).padStart(GUTTER) + ' ', style: 'comment' }
  const room = inner - GUTTER - 1
  const style = body.length === 1 ? body[0]!.style : undefined
  const rows = wrap(body, room).map(r => (style === 'added' || style === 'removed' ? [{ text: r.map(s => s.text).join('').padEnd(room), style }] : r))
  return rows.map((r, i) => [i ? { text: ' '.repeat(GUTTER + 1) } : gutter, ...r])
}

const more = (n: number): Line => [{ text: `${n} more lines · ctrl+o`, style: 'info' }]

export function diffLines(hunks: Hunk[], lang: string, inner: number): Line[] {
  const out: Line[] = []
  for (const [i, hunk] of hunks.entries()) {
    if (i) out.push([{ text: ' '.repeat(GUTTER) + ' ⋮', style: 'comment' }])
    let oldNo = hunk.oldStart
    let newNo = hunk.newStart
    for (const line of hunk.lines) {
      const mark = line[0]
      if (mark === '+') out.push(...numbered(newNo++, [{ text: line, style: 'added' }], inner))
      else if (mark === '-') out.push(...numbered(oldNo++, [{ text: line, style: 'removed' }], inner))
      else {
        out.push(...numbered(newNo, [{ text: ' ' }, ...(highlight(lang, line.slice(1))[0] ?? [])], inner))
        oldNo++
        newNo++
      }
    }
  }
  return out.length > DIFF_ROWS ? [...out.slice(0, DIFF_ROWS), more(out.length - DIFF_ROWS)] : out
}

export function headLines(content: string, lang: string, inner: number): Line[] {
  const lines = content.split('\n')
  const shown = highlight(lang, lines.slice(0, HEAD_ROWS).join('\n')).flatMap((l, i) => numbered(i + 1, [{ text: ' ' }, ...l], inner))
  return lines.length > HEAD_ROWS ? [...shown, more(lines.length - HEAD_ROWS)] : shown
}
