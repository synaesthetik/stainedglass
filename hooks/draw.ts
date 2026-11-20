export type Style = 'id' | 'range' | 'measure' | 'heading' | 'ok' | 'warn' | 'bad' | 'info' | 'border' | 'banner' | 'key' | 'exit' | 'added' | 'removed'
  | 'code' | 'path' | 'strong' | 'em' | 'link' | 'header' | 'bullet'
  | 'keyword' | 'string' | 'number' | 'constant' | 'comment' | 'command' | 'flag' | 'variable' | 'operator' | 'field' | 'literal' | 'hunk' | 'count' | 'lead' | 'decision' | 'plan'
export type Seg = { text: string; style?: Style }
export type Line = Seg[]

export type Gauge = { gauge: number; max: number; target?: number; tone?: Style }
export type Cell = string | Gauge
export type MarkKind = 'highlight' | 'point' | 'active' | 'error' | 'marker' | 'reference'
export type Mark = { at: number; kind?: MarkKind; label?: string }
export type Option = { key: string; label: string; detail?: string; disabled?: string; recommended?: boolean }
export type StepStatus = 'complete' | 'current' | 'locked'
export type Step = { name: string; status: StepStatus }

export type Timeline = {
  type: 'timeline'
  title?: string
  low: number
  high: number
  lowLabel?: string
  highLabel?: string
  density?: number[]
  marks?: Mark[]
  legend?: boolean
}

export type Block =
  | { type: 'banner'; title: string; lines?: string[] }
  | { type: 'box'; title?: string; lines: string[] }
  | { type: 'text'; lines: string[] }
  | { type: 'kv'; title?: string; rows: [string, string][] }
  | { type: 'table'; title?: string; header: string[]; rows: Cell[][] }
  | { type: 'gauge'; label?: string; value: number; max: number; target?: number; caption?: string }
  | Timeline
  | { type: 'phases'; steps: Step[] }
  | { type: 'options'; options: Option[] }

export const TEXT_PROPS: Record<Style, { color?: string; backgroundColor?: string; bold?: boolean; dimColor?: boolean; italic?: boolean; underline?: boolean }> = {
  id: { color: 'cyan' },
  range: { color: 'blueBright' },
  measure: { bold: true },
  heading: { bold: true },
  ok: { color: 'green' },
  warn: { color: 'yellow' },
  bad: { color: 'red' },
  info: { dimColor: true },
  border: { color: 'gray' },
  banner: { color: 'magenta' },
  key: { color: 'cyan', bold: true },
  exit: { color: 'red' },
  added: { color: 'whiteBright', backgroundColor: '#1f6b35' },
  removed: { color: 'whiteBright', backgroundColor: '#8b1e2a' },
  code: { color: 'magentaBright' },
  path: { color: 'blueBright' },
  strong: { color: 'white', bold: true },
  em: { italic: true },
  link: { color: 'blueBright', underline: true },
  header: { color: 'whiteBright', bold: true },
  bullet: { color: 'cyan' },
  keyword: { color: 'magenta' },
  string: { color: 'greenBright' },
  number: { color: 'yellowBright' },
  constant: { color: 'blueBright' },
  comment: { color: 'blackBright', italic: true },
  command: { color: 'whiteBright', bold: true },
  flag: { color: 'cyanBright' },
  variable: { color: 'redBright' },
  operator: { color: 'blackBright' },
  field: { color: 'cyan' },
  literal: { color: 'magenta' },
  hunk: { color: 'cyan' },
  count: { color: 'magenta' },
  lead: { color: 'magentaBright', bold: true },
  decision: { color: 'magenta' },
  plan: { color: 'cyan' },
}

const MARKUP = /\{(id|range|measure|heading|ok|warn|bad|info):([^{}]*)\}/g
const GAUGE_CELLS = 12
const DENSITY = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
export const MARK_GLYPHS: Record<MarkKind, [string, Style | undefined]> = {
  highlight: ['★', 'ok'],
  point: ['▲', undefined],
  active: ['●', 'id'],
  error: ['✗', 'bad'],
  marker: ['◆', 'measure'],
  reference: ['·', 'info'],
}
export const STEP_GLYPHS: Record<StepStatus, [string, Style]> = {
  complete: ['✓', 'ok'],
  current: ['●', 'id'],
  locked: ['○', 'info'],
}
const EXIT_KEYS = ['q', '<']

export const plain = (line: Line) => line.map(s => s.text).join('')
export const width = (line: Line) => [...plain(line)].length
export const pad = (line: Line, to: number): Line => [...line, { text: ' '.repeat(Math.max(0, to - width(line))) }]

export function parse(text: string): Line {
  const source = String(text ?? '')
  const line: Line = []
  let last = 0
  for (const m of source.matchAll(MARKUP)) {
    if (m.index! > last) line.push({ text: source.slice(last, m.index) })
    line.push({ text: m[2] ?? '', style: m[1] as Style })
    last = m.index! + m[0].length
  }
  if (last < source.length) line.push({ text: source.slice(last) })
  return line
}

function merged(line: Line): Line {
  const out: Line = []
  for (const seg of line) {
    const prev = out[out.length - 1]
    if (prev && prev.style === seg.style) prev.text += seg.text
    else out.push({ ...seg })
  }
  return out
}

export function wrap(line: Line, inner: number, hang = 0): Line[] {
  if (width(line) <= inner) return [line]
  const words = line.flatMap(seg => seg.text.split(/(?<= )/).map(text => ({ text, style: seg.style })))
  const rows: Line[] = []
  let row: Line = []
  for (const word of words) {
    const room = inner - (rows.length ? hang : 0)
    if (row.length && width([...row, { text: word.text.trimEnd() }]) > room) {
      rows.push(row)
      row = []
    }
    let rest = word.text
    while ([...rest].length > room) {
      rows.push([...row, { text: [...rest].slice(0, room).join(''), style: word.style }])
      row = []
      rest = [...rest].slice(room).join('')
    }
    row.push({ text: rest, style: word.style })
  }
  if (row.length) rows.push(row)
  return rows.map((r, i) => merged([...(i ? [{ text: ' '.repeat(hang) }] : []), ...r.map((seg, j) => (j === r.length - 1 ? { ...seg, text: seg.text.trimEnd() } : seg))]))
}

export function titleLabel(title: string | Line | undefined, titleStyle: Style = 'heading'): Line {
  const segs: Line = typeof title === 'string' ? [{ text: title }] : (title ?? [])
  return width(segs) ? merged([{ text: ' ' }, ...segs, { text: ' ' }].map(s => ({ ...s, style: s.style && s.style !== 'count' ? s.style : titleStyle }))) : []
}

export function frame(title: string | Line | undefined, body: Line[], outer: number, border: Style = 'border', titleStyle: Style = 'heading'): Line[] {
  const inner = Math.max(1, outer - 4)
  const label = titleLabel(title, titleStyle)
  const top: Line = [
    { text: '┌', style: border },
    ...label,
    { text: '─'.repeat(Math.max(0, outer - 2 - width(label))) + '┐', style: border },
  ]
  const rows = body.flatMap(line => wrap(line, inner)).map(line => [{ text: '│ ', style: border }, ...pad(line, inner), { text: ' │', style: border }])
  return [top, ...rows, [{ text: '└' + '─'.repeat(outer - 2) + '┘', style: border }]]
}

export function testBar(pass: number, fail: number): Line {
  const failed = fail > 0 ? Math.max(1, Math.round((fail / (pass + fail)) * GAUGE_CELLS)) : 0
  return [
    { text: '█'.repeat(GAUGE_CELLS - failed), style: 'ok' },
    ...(failed ? [{ text: '█'.repeat(failed), style: 'bad' as Style }] : []),
  ]
}

export function gaugeLine(value: number, max: number, target?: number, tone?: Style): Line {
  const filled = Math.min(GAUGE_CELLS, Math.max(0, Math.round((value / max) * GAUGE_CELLS)))
  const tick = target === undefined ? -1 : Math.round((target / max) * GAUGE_CELLS)
  const verdict: Style = tone ?? (value >= max ? 'bad' : target !== undefined && value >= target ? 'warn' : 'ok')
  const cells = Array.from({ length: GAUGE_CELLS }, (_, i) => (i === tick ? '▏' : i < filled ? '█' : '░'))
  return [{ text: cells.join(''), style: verdict }]
}

function cellLine(cell: Cell): Line {
  return typeof cell === 'object' && cell !== null
    ? gaugeLine(cell.gauge, cell.max, cell.target, cell.tone)
    : parse(String(cell ?? ''))
}

export function table(header: string[], rows: Cell[][]): Line[] {
  const head: Line[] = header.map(h => [{ text: h, style: 'heading' }])
  const body = rows.map(r => header.map((_, i) => cellLine(r[i] ?? '')))
  const widths = header.map((_, i) => Math.max(width(head[i] ?? []), ...body.map(r => width(r[i] ?? []))))
  const rule = (l: string, m: string, r: string): Line => [
    { text: l + widths.map(w => '─'.repeat(w + 2)).join(m) + r, style: 'border' },
  ]
  const row = (cells: Line[]): Line => [
    { text: '│', style: 'border' },
    ...cells.flatMap((c, i): Line => [{ text: ' ' }, ...pad(c, widths[i] ?? 0), { text: ' ' }, { text: '│', style: 'border' }]),
  ]
  return [rule('┌', '┬', '┐'), row(head), rule('├', '┼', '┤'), ...body.map(row), rule('└', '┴', '┘')]
}

function grid(cells: Seg[]): Line {
  const line: Line = []
  for (const c of cells) {
    const prev = line[line.length - 1]
    if (prev && prev.style === c.style) prev.text += c.text
    else line.push({ ...c })
  }
  return line
}

export function timeline(b: Timeline, outer: number): Line[] {
  const cols = Math.max(8, outer - 2)
  const span = b.high - b.low || 1
  const colOf = (at: number) => Math.min(cols - 1, Math.max(0, Math.floor(((at - b.low) / span) * cols)))
  const lines: Line[] = []

  const low = b.lowLabel ?? String(b.low)
  const high = b.highLabel ?? String(b.high)
  lines.push([
    { text: low, style: 'range' },
    { text: ' '.repeat(Math.max(1, outer - low.length - high.length)) },
    { text: high, style: 'range' },
  ])

  if (b.density?.length) {
    const density = b.density
    const values = Array.from({ length: cols }, (_, c) => density[Math.floor((c * density.length) / cols)] ?? 0)
    const peak = Math.max(...values, 1)
    const scale = DENSITY.length * DENSITY.length
    const glyphs = values.map(v => {
      if (v <= 0) return ' '
      const k = DENSITY.findIndex((_, i) => v * scale <= (i + 1) * (i + 1) * peak)
      return DENSITY[k < 0 ? DENSITY.length - 1 : k]
    })
    lines.push([{ text: ' ' }, { text: glyphs.join(''), style: 'id' }])
  }

  const marks = b.marks ?? []
  const axis: Seg[] = Array.from({ length: cols }, () => ({ text: '─', style: 'info' as Style }))
  for (const m of marks) {
    const [glyph, style] = MARK_GLYPHS[m.kind ?? 'point'] ?? MARK_GLYPHS.point
    axis[colOf(m.at)] = { text: glyph, style }
  }
  lines.push(grid([{ text: '├', style: 'info' }, ...axis, { text: '┤', style: 'info' }]))

  const labelled = marks.filter(m => m.label)
  if (labelled.length) {
    const row: Seg[] = Array.from({ length: outer }, () => ({ text: ' ' }))
    for (const m of labelled) {
      const col = colOf(m.at) + 1
      const right = `^ ${m.label}`
      const left = `${m.label} ^`
      const start = col + right.length <= outer ? col : Math.max(0, col - left.length + 1)
      const text = start === col ? right : left
      if (![...text].every((_, i) => row[start + i]?.text === ' ')) continue
      ;[...text].forEach((ch, i) => (row[start + i] = { text: ch, style: ch === '^' ? 'measure' : 'range' }))
    }
    lines.push(grid(row))
  }

  if (b.legend) {
    const kinds = [...new Set(marks.map(m => m.kind ?? 'point'))]
    lines.push(kinds.flatMap((k): Line => [{ text: MARK_GLYPHS[k][0], style: MARK_GLYPHS[k][1] }, { text: ` ${k}  `, style: 'info' }]))
  }
  return lines
}

export function strip(steps: { status: StepStatus }[]): Line {
  return steps.map((s): Seg => {
    const [text, style] = STEP_GLYPHS[s.status] ?? STEP_GLYPHS.locked
    return { text, style }
  })
}

export function options(list: Option[], inner: number): Line[] {
  const enabled = list.filter(o => !o.disabled)
  const ordered = [...enabled.filter(o => o.key !== 'q'), ...enabled.filter(o => o.key === 'q')]
  const keyed = (o: Option): Line => [
    ...String(o.key)
      .split('/')
      .flatMap((part, i): Line => [
        ...(i ? [{ text: '/' }] : []),
        { text: `[${part}]`, style: EXIT_KEYS.includes(part) ? 'exit' : 'key' },
      ]),
    { text: ' ' },
    { text: o.label, style: o.recommended ? 'ok' : undefined },
  ]
  const cells = ordered.map(keyed)
  const cell = Math.max(1, ...cells.map(width)) + 2
  const per = ordered.some(o => o.detail) ? 1 : Math.min(3, Math.max(1, Math.floor(inner / cell)))
  const rows: Line[] = []
  for (let i = 0; i < cells.length; i += per) {
    const slice = cells.slice(i, i + per)
    const hang = per === 1 ? width(slice[0]!) - width([{ text: slice[0]![slice[0]!.length - 1]!.text }]) : 0
    rows.push(...wrap(slice.flatMap((c, j) => (j === slice.length - 1 ? c : pad(c, cell))), inner, hang))
    const detail = per === 1 ? ordered[i]?.detail : undefined
    if (detail) rows.push(...wrap([{ text: ' '.repeat(hang) }, { text: detail, style: 'info' }], inner, hang))
  }
  for (const o of list.filter(o => o.disabled)) {
    rows.push([{ text: `[${o.key}] ${o.label} -- ${o.disabled}`, style: 'info' }])
  }
  return rows
}

export function block(b: Block, outer: number): Line[] {
  const inner = outer - 4
  switch (b.type) {
    case 'banner':
      return frame(undefined, [[{ text: b.title, style: 'heading' }], ...(b.lines ?? []).map(parse)], outer, 'banner')
    case 'box':
      return frame(b.title, (b.lines ?? []).map(parse), outer)
    case 'text':
      return (b.lines ?? []).map(parse)
    case 'kv': {
      const keyWidth = Math.max(0, ...(b.rows ?? []).map(([k]) => [...k].length))
      const rows = (b.rows ?? []).map(([k, v]): Line => [{ text: k.padEnd(keyWidth) + '  ', style: 'info' }, ...parse(v)])
      return b.title ? frame(b.title, rows, outer) : rows
    }
    case 'table': {
      const rows = table(b.header ?? [], b.rows ?? [])
      return b.title ? [[{ text: b.title, style: 'heading' }], ...rows] : rows
    }
    case 'gauge':
      return [[
        ...(b.label ? [{ text: `${b.label}  ` }] : []),
        ...gaugeLine(b.value, b.max, b.target),
        ...(b.caption ? [{ text: '  ' }, ...parse(b.caption)] : []),
      ]]
    case 'timeline':
      return frame(b.title, timeline(b, inner), outer)
    case 'phases': {
      const steps = b.steps ?? []
      const current = steps.findIndex(s => s.status === 'current')
      const tail = current >= 0 ? `  ${current + 1}/${steps.length} ${steps[current]?.name}` : ''
      return [[...strip(steps), { text: tail }]]
    }
    case 'options':
      return frame('Options', options(b.options ?? [], inner), outer)
  }
  return [[{ text: `(unknown block type ${(b as { type?: string }).type})`, style: 'info' }]]
}
