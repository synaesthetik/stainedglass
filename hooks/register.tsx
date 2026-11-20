import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Task, TaskStatus } from '../types'
import { block, gaugeLine, options, strip, testBar, TEXT_PROPS, titleLabel, wrap } from './draw'
import type { Block, Line, Seg, StepStatus, Style } from './draw'
import { splitOptions } from './gates'
import { changeCounts, counts, diffLines, headLines, langOf, shortPath } from './files'
import { highlight } from './highlight'
import { inline, markdown, urls } from './markdown'
import { splitSections } from './sections'
import type { Part, Tone } from './sections'

const TOOL = 'mcp__stainedglass__show'
const TASK_TOOLS = ['TodoWrite', 'TaskCreate', 'TaskUpdate']
const QUIET_TOOLS = [TOOL, ...TASK_TOOLS]
const OUTPUT_TAIL = 10
const TONE_STYLE: Record<Tone, Style> = { border: 'border', ok: 'ok', warn: 'warn', bad: 'bad', ask: 'decision', plan: 'plan', find: 'find', change: 'change' }

const tasks = atom({ plugin: 'stainedglass', key: 'tasks' } as const, [] as Task[], { shape: 'tasks-1' })

const STEP_OF: Record<TaskStatus, StepStatus> = { completed: 'complete', in_progress: 'current', pending: 'locked' }

type Input = { title?: string; blocks?: Block[] }

function applyTask(list: Task[], tool: string, input: any, result: any): Task[] {
  switch (tool) {
    case 'TodoWrite':
      return (input.todos ?? []).map((t: any, i: number): Task => ({
        id: String(i + 1),
        subject: t.content,
        activeForm: t.activeForm,
        status: t.status,
        blockedBy: [],
      }))
    case 'TaskCreate': {
      const id = result?.task?.id
      if (!id) return list
      return [...list, { id: String(id), subject: input.subject, activeForm: input.activeForm, status: 'pending', blockedBy: [] }]
    }
    case 'TaskUpdate': {
      if (input.status === 'deleted') return list.filter(t => t.id !== input.taskId)
      return list.map(t =>
        t.id !== input.taskId
          ? t
          : {
              ...t,
              subject: input.subject ?? t.subject,
              activeForm: input.activeForm ?? t.activeForm,
              status: input.status ?? t.status,
              blockedBy: [...new Set([...t.blockedBy, ...(input.addBlockedBy ?? [])])],
            },
      )
    }
    case 'TaskList':
      return (result?.tasks ?? []).map((t: any): Task => ({
        id: String(t.id),
        subject: t.subject,
        activeForm: list.find(o => o.id === String(t.id))?.activeForm,
        status: t.status,
        blockedBy: t.blockedBy ?? [],
      }))
  }
  return list
}

function stripLine(list: Task[]): Line {
  const current = list.findIndex(t => t.status === 'in_progress')
  const done = list.filter(t => t.status === 'completed').length
  const task = list[current]
  const tail = task ? `  ${current + 1}/${list.length} ${task.activeForm ?? task.subject}` : `  ${done}/${list.length} done`
  return [...strip(list.map(t => ({ status: STEP_OF[t.status] ?? 'locked' }))), { text: '  ' }, ...gaugeLine(done, list.length, undefined, 'ok'), { text: tail }]
}

function taskRow(task: Task, list: Task[]): Line {
  const [glyph, style] = task.status === 'completed' ? ['✓', 'ok'] : task.status === 'in_progress' ? ['●', 'id'] : ['○', 'info']
  const waiting = task.blockedBy.filter(id => list.find(t => t.id === id)?.status !== 'completed')
  const text = task.status === 'in_progress' ? (task.activeForm ?? task.subject) : task.subject
  return [
    { text: glyph, style: style as Style },
    { text: ' ' },
    { text, style: task.status === 'pending' ? undefined : task.status === 'completed' ? 'info' : 'id' },
    ...(waiting.length ? [{ text: `  blocked by ${waiting.map(id => `#${id}`).join(', ')}`, style: 'info' as Style }] : []),
  ]
}

function boardLines(list: Task[], maxRows: number): Line[] {
  const room = Math.max(1, maxRows - 1)
  let shown = list
  if (shown.length > room) {
    const open = list.filter(t => t.status !== 'completed')
    const done = list.filter(t => t.status === 'completed').slice(-(Math.max(0, room - 1 - open.length)))
    shown = list.filter(t => open.includes(t) || done.includes(t)).slice(0, room - 1)
  }
  const hidden = list.length - shown.length
  const rows = [stripLine(list), ...shown.map(t => taskRow(t, list))]
  if (hidden > 0) rows.push([{ text: `+${hidden} more`, style: 'info' }])
  return rows
}

function compactTaskRow(tool: string, input: any, output: any, list: Task[]): Line | undefined {
  if (tool === 'TodoWrite') {
    const todos = (input.todos ?? []) as { status: TaskStatus }[]
    const done = todos.filter(t => t.status === 'completed').length
    return [...strip(todos.map(t => ({ status: STEP_OF[t.status] ?? 'locked' }))), { text: `  ${done}/${todos.length} todos`, style: 'info' }]
  }
  if (tool === 'TaskCreate') {
    const id = output?.task?.id
    return [{ text: '○ ', style: 'info' }, { text: id ? `#${id} ` : '', style: 'id' }, { text: input.subject ?? '' }, { text: ' created', style: 'info' }]
  }
  if (tool === 'TaskUpdate') {
    const task = list.find(t => t.id === input.taskId)
    const subject = input.subject ?? task?.subject ?? ''
    const status = input.status as TaskStatus | 'deleted' | undefined
    const [glyph, style]: [string, Style] =
      status === 'completed' ? ['✓', 'ok'] : status === 'in_progress' ? ['●', 'id'] : status === 'deleted' ? ['✗', 'info'] : ['○', 'info']
    const change = status ? ` → ${status}` : ' updated'
    return [{ text: glyph, style }, { text: ` #${input.taskId} ${subject}` }, { text: change, style: status ? style : 'info' }]
  }
  return undefined
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Optional heading drawn above the blocks.' },
    blocks: {
      type: 'array',
      description: 'Blocks drawn top to bottom.',
      items: {
        type: 'object',
        properties: {
          type: { enum: ['banner', 'box', 'text', 'kv', 'table', 'gauge', 'timeline', 'phases', 'options'] },
          title: { type: 'string' },
          lines: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', description: 'kv: [key, value] pairs. table: arrays of cells; a cell is a string or {gauge, max, target?}.' },
          header: { type: 'array', items: { type: 'string' } },
          value: { type: 'number' },
          max: { type: 'number' },
          target: { type: 'number' },
          label: { type: 'string' },
          caption: { type: 'string' },
          low: { type: 'number' },
          high: { type: 'number' },
          lowLabel: { type: 'string' },
          highLabel: { type: 'string' },
          density: { type: 'array', items: { type: 'number' }, description: 'Values spread evenly across the range, drawn as ▁..█.' },
          marks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                at: { type: 'number' },
                kind: { enum: ['highlight', 'point', 'active', 'error', 'marker', 'reference'] },
                label: { type: 'string' },
              },
              required: ['at'],
            },
          },
          legend: { type: 'boolean' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, status: { enum: ['complete', 'current', 'locked'] } },
              required: ['name', 'status'],
            },
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, label: { type: 'string' }, disabled: { type: 'string' } },
              required: ['key', 'label'],
            },
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['blocks'],
}

const DESCRIPTION = `Draw a boxed terminal display inline in the transcript for the user: framed sections, key/value panels, unicode tables with gauges, step strips and option boxes.

Reach for it where layout helps the user act or keep their bearings: a plan's steps and where you are in them, the options at a decision point side by side, a task or status panel, a summary of what changed or what a review found, a comparison across many items. Keep each display focused; one or two per answer at most. The timeline block is for the rare case where the spread of values along a range is itself the point. The user sees the display; you only read an acknowledgement, so state anything the user must act on in prose too.

Blocks (each {type, ...}):
- banner {title, lines?}            magenta-framed header
- box {title?, lines}               grey titled frame
- text {lines}                      unframed lines
- kv {title?, rows: [[key, value]]} aligned key/value, framed when titled
- table {title?, header, rows}      cells are strings or {gauge, max, target?}
- gauge {label?, value, max, target?, caption?}  12-cell bar, tick at target; green below target, yellow from target, red at max
- timeline {title?, low, high, lowLabel?, highLabel?, density?, marks?: [{at, kind?, label?}], legend?}
    kinds: highlight ★, point ▲, active ●, error ✗, marker ◆, reference ·
- phases {steps: [{name, status: complete|current|locked}]}  ✓●○ strip
- options {options: [{key, label, disabled?}]}  [k] label grid; q sorts last; disabled rows dim with reason

Any string may carry inline styles: {id:name} cyan, {range:a..b} bright blue, {measure:42} bold, {heading:x} bold, {ok:x} green, {warn:x} yellow, {bad:x} red, {info:x} dim.`

function merged(line: Line): Seg[] {
  const out: Seg[] = []
  for (const seg of line) {
    const last = out[out.length - 1]
    if (last && last.style === seg.style) out[out.length - 1] = { ...last, text: last.text + seg.text }
    else out.push(seg)
  }
  return out
}

function paint($: EngineInterface, e: any, lines: Line[], paddingLeft = 0) {
  const { Box, Text } = $.ui.resolve(e) as any
  return (
    <Box flexDirection="column" paddingLeft={paddingLeft}>
      {lines.map(line => {
        const segs = merged(line)
        if (segs.length <= 1)
          return (
            <Text wrap="truncate-end" {...(segs[0]?.style ? TEXT_PROPS[segs[0].style] : {})}>
              {segs[0]?.text || ' '}
            </Text>
          )
        return <Text wrap="truncate-end">{segs.map(seg => (seg.style ? <Text {...TEXT_PROPS[seg.style]}>{seg.text}</Text> : seg.text))}</Text>
      })}
    </Box>
  )
}

const BANDED: Style[] = ['added', 'removed']

function band(lines: Line[], inner: number): Line[] {
  return lines.map(line => {
    const style = line[0]?.style
    if (line.length !== 1 || !style || !BANDED.includes(style)) return line
    return [{ text: line[0]!.text.padEnd(inner), style }]
  })
}

function rule(label: Line, outer: number, tone: Style): Line {
  if (!label.length) return [{ text: '─'.repeat(outer), style: tone }]
  const used = 4 + label.reduce((n, seg) => n + [...seg.text].length, 0)
  return [{ text: '── ', style: tone }, ...label, { text: ' ' + '─'.repeat(Math.max(0, outer - used)), style: tone }]
}

const codeLines = (part: { lang: string; code: string }, outer: number, tone: Style = 'border', title?: Line): Line[] => [
  rule(title ?? (part.lang ? [{ text: part.lang, style: 'comment' as Style }] : []), outer, tone),
  ...band(highlight(part.lang, part.code).flatMap(l => wrap(l, outer)), outer),
  rule([], outer, tone),
]

const linkBlocks = (text: string, outer: number, tone: Style = 'border') =>
  urls(text).map(url => ({
    code: [rule([{ text: 'link', style: 'comment' }], outer, tone), ...wrap([{ text: url, style: 'link' }], outer), rule([], outer, tone)],
  }))

function partLines(part: Part, inner: number): Line[] {
  if ('lang' in part) return band(highlight(part.lang, part.code).flatMap(l => wrap(l, inner)), inner)
  return markdown(part.text, inner)
}

function glyph(p: any): Seg {
  if (p.isRunning) return { text: '●', style: 'id' }
  if (p.isInterrupted) return { text: '▲', style: 'warn' }
  if (p.isErrored) return { text: '✗', style: 'bad' }
  return { text: '✓', style: 'ok' }
}

function fileRow(p: any): Line | undefined {
  const input = p.input ?? {}
  const head: Line = [glyph(p), { text: ' ' }, { text: p.tool, style: 'command' }, { text: ' ' }, { text: shortPath(input.file_path), style: 'path' }]
  if (p.tool === 'Read') {
    const range: Line =
      input.offset !== undefined && input.limit !== undefined
        ? [{ text: ' · lines ', style: 'info' }, { text: `${input.offset}–${input.offset + input.limit - 1}`, style: 'count' }]
        : []
    return [...head, ...range]
  }
  if (p.tool === 'Edit' || p.tool === 'Write') return [...head, { text: '  ' }, ...counts(...changeCounts(input, p.output))]
  return undefined
}

function fileResult(tool: string, output: any, inner: number): Line[] | undefined {
  if (tool === 'Read' && typeof output?.file?.numLines === 'number')
    return [[{ text: '  ' }, { text: String(output.file.numLines), style: 'count' }, { text: ' of ', style: 'info' }, { text: String(output.file.totalLines), style: 'count' }, { text: ' lines', style: 'info' }]]
  if (tool !== 'Edit' && tool !== 'Write') return undefined
  const lang = langOf(output?.filePath)
  if (Array.isArray(output?.structuredPatch) && output.structuredPatch.length) return diffLines(output.structuredPatch, lang, inner)
  if (output?.type === 'create' && typeof output.content === 'string') return headLines(output.content, lang, inner)
  return undefined
}

const outerOf = (e: any) => Math.max(30, Math.min(110, (e.viewport?.columns ?? 80) - 4))

function bashText(output: unknown): string {
  const text = typeof output === 'string' ? output : [(output as any)?.stdout, (output as any)?.stderr].filter(t => typeof t === 'string' && t.trim()).join('\n')
  return String(text ?? '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s+$/, '')
}

function outcome(p: any): Seg {
  if (p.isRunning) return { text: '● running', style: 'id' }
  if (p.isInterrupted || p.output?.interrupted) return { text: '▲ interrupted', style: 'warn' }
  if (p.isErrored) return { text: '✗ failed', style: 'bad' }
  if (p.output?.backgroundTaskId) return { text: '◆ in background', style: 'info' }
  return { text: '✓ done', style: 'ok' }
}

function outputLines(text: string): Line[] {
  const lines = text.split('\n')
  const hidden = lines.length - OUTPUT_TAIL
  return [
    ...(hidden > 0 ? [[{ text: `${hidden} earlier lines · ctrl+o`, style: 'info' as Style }]] : []),
    ...lines.slice(-OUTPUT_TAIL).map((text): Line => [{ text }]),
  ]
}

function testCounts(text: string): { pass: number; fail: number } | null {
  const bunPass = text.match(/^\s*(\d+) pass\s*$/m)
  const bunFail = text.match(/^\s*(\d+) fail\s*$/m)
  if (bunPass && bunFail) return { pass: Number(bunPass[1]), fail: Number(bunFail[1]) }
  const rspec = text.match(/(\d+) examples?, (\d+) failures?/)
  if (rspec) return { pass: Number(rspec[1]) - Number(rspec[2]), fail: Number(rspec[2]) }
  const jest = text.match(/Tests:\s+(?:(\d+) failed, )?(\d+) passed/)
  if (jest) return { pass: Number(jest[2]), fail: Number(jest[1] ?? 0) }
  return null
}

function verdictLine(counts: { pass: number; fail: number }): Line {
  const label = `${counts.fail ? '✗' : '✓'} ${counts.pass} pass · ${counts.fail} fail`
  return [{ text: label, style: counts.fail ? 'bad' : 'ok' }, { text: '  ' }, ...testBar(counts.pass, counts.fail)]
}

function groupLine(calls: readonly { tool: string }[]): string {
  const count = (tools: string[]) => calls.filter(c => tools.includes(c.tool)).length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const reads = count(['Read'])
  const searches = count(['Grep', 'Glob'])
  const others = calls.length - reads - searches
  return [
    reads ? `read ${plural(reads, 'file')}` : '',
    searches ? `searched ${plural(searches, 'pattern')}` : '',
    others ? `${plural(others, 'other call')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const drawAbovePrompt = async ($: any, e: any, next: any) => {
  const list = await read($, tasks)
  if (e.props.hasSurvey || !list.some(t => t.status !== 'completed')) return next(e)
  const { Box } = $.ui.resolve(e) as any
  return <Box key="band">{paint($, e, boardLines(list, e.props.maxRows))}</Box>
}

const isQuestion = (paragraph: string) => {
  const text = paragraph.trim()
  return text.endsWith('?') && !text.includes('\n') && text.length <= 200
}

type Bordered = { body: Line[]; border: Style; title: Line }

const bordered = (body: Line[], inner: number, border: Style = 'border', title: Line = []): Bordered => ({
  body: body.flatMap(line => wrap(line, inner)),
  border,
  title,
})

function drawBordered($: EngineInterface, e: any, b: Bordered, outer: number, props: Record<string, unknown> = {}) {
  const { Box } = $.ui.resolve(e) as any
  const box = (boxProps: Record<string, unknown>) => (
    <Box {...boxProps} borderStyle="single" borderColor={TEXT_PROPS[b.border].color} width={outer} paddingX={1}>
      {paint($, e, b.body)}
    </Box>
  )
  if (!b.title.length) return box(props)
  return (
    <Box {...props} flexDirection="column">
      {box({})}
      <Box position="absolute" top={0} left={1}>
        {paint($, e, [b.title])}
      </Box>
    </Box>
  )
}

const drawAssistantMessage = async ($: any, e: any, next: any) => {
  if (e.props.isSummary || !e.props.text.trim()) return next(e)
  const { Box, Text } = $.ui.resolve(e) as any
  const outer = outerOf(e)
  const inner = outer - 4
  const found = splitOptions(e.props.text)
  const blocks: (Bordered | { code: Line[] })[] = []
  let source: string = found ? found.before : e.props.text
  const paragraphs = source.trimEnd().split(/\n\s*\n/)
  const closing = !found && paragraphs.length > 1 && isQuestion(paragraphs[paragraphs.length - 1]!) ? paragraphs.pop()! : undefined
  if (closing) source = paragraphs.join('\n\n')
  for (const section of splitSections(source)) {
    if (section.title && !section.parts.length) {
      blocks.push(bordered([inline(section.title)], inner))
      continue
    }
    if (section.title) {
      const tone = TONE_STYLE[section.tone]
      const titleStyle: Style = section.tone === 'border' ? 'header' : tone
      let pending: Line[] = []
      let pendingText = ''
      let titled = false
      const flushPending = () => {
        if (!pending.length) return
        blocks.push(bordered(pending, inner, tone, titled ? [] : titleLabel(inline(section.title!), titleStyle)))
        blocks.push(...linkBlocks(pendingText, outer, tone))
        titled = true
        pending = []
        pendingText = ''
      }
      for (const part of section.parts) {
        if ('lang' in part) {
          flushPending()
          const heading = titled ? undefined : inline(section.title!).map(seg => ({ ...seg, style: seg.style ?? titleStyle }))
          titled = true
          blocks.push({ code: codeLines(part, outer, tone, heading) })
          continue
        }
        pending.push(...(pending.length ? [[]] : []), ...partLines(part, inner))
        pendingText += '\n' + part.text
      }
      flushPending()
      continue
    }
    for (const part of section.parts) {
      if ('lang' in part) {
        blocks.push({ code: codeLines(part, outer) })
        continue
      }
      for (const paragraph of part.text.split(/\n\s*\n/)) {
        if (!paragraph.trim()) continue
        const tone: Style = isQuestion(paragraph) ? 'decision' : 'border'
        blocks.push(bordered(markdown(paragraph, inner), inner, tone), ...linkBlocks(paragraph, outer, tone))
      }
    }
  }
  if (closing) blocks.push(bordered(markdown(closing.trim(), inner), inner, 'decision'), ...linkBlocks(closing, outer, 'decision'))
  if (found) {
    const fits = [...found.question].length <= outer - 6
    const heading = fits ? [] : [[{ text: found.question, style: 'heading' as Style }]]
    const choices = [...heading, ...options(found.options, inner)]
    blocks.push(bordered(choices, inner, 'decision', fits ? titleLabel(found.question) : []))
    if (found.after.length) blocks.push(bordered(found.after.map(line => inline(line)), inner))
  }
  return (
    <Box key="reply" flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
      </Box>
      <Box flexDirection="column">
        {blocks.map((b, i) =>
          'code' in b ? (
            <Box key={`block-${i}`} marginTop={i ? 1 : 0}>
              {paint($, e, b.code)}
            </Box>
          ) : (
            drawBordered($, e, b, outer, { key: `block-${i}`, marginTop: i ? 1 : 0 })
          ),
        )}
      </Box>
    </Box>
  )
}

const drawToolGroup = async ($: any, e: any, next: any) => {
  if (e.props.isExpanded || !e.props.isCallsOnly) return next(e)
  const { Text } = $.ui.resolve(e) as any
  return <Text dimColor>{`${e.props.isActive ? '●' : '✓'} ${groupLine(e.props.calls)}`}</Text>
}

const drawToolUse = async ($: any, e: any, next: any) => {
  if (e.props.isExpanded) return next(e)
  if (e.props.tool === 'Bash') {
    const { Box, Text } = $.ui.resolve(e) as any
    const input = (e.props.input ?? {}) as { command?: string; description?: string }
    const status = outcome(e.props)
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>Command:</Text>
          {input.description ? <Text dimColor>{`  ${input.description}`}</Text> : null}
        </Text>
        {String(input.command ?? '')
          .split('\n')
          .map(line => (
            <Text wrap="wrap">{`  ${line}`}</Text>
          ))}
        <Text {...TEXT_PROPS[status.style!]}>{status.text}</Text>
      </Box>
    )
  }
  const file = fileRow(e.props)
  if (file) return paint($, e, [file])
  if (e.props.isErrored) return next(e)
  if (e.props.tool === TOOL) {
    const input = (e.props.input ?? {}) as Input
    const outer = outerOf(e)
    const lines: Line[] = []
    if (input.title) lines.push([{ text: input.title, style: 'heading' }])
    for (const b of input.blocks ?? []) {
      if (lines.length) lines.push([])
      lines.push(...block(b, outer))
    }
    return paint($, e, lines, 2)
  }
  if (TASK_TOOLS.includes(e.props.tool)) {
    const row = compactTaskRow(e.props.tool, e.props.input ?? {}, e.props.output, await read($, tasks))
    if (row) return paint($, e, [row])
  }
  return next(e)
}

const drawToolResult = async ($: any, e: any, next: any) => {
  if (e.props.isExpanded) return next(e)
  const { Box } = $.ui.resolve(e)
  if (e.props.tool === 'Bash') {
    const text = bashText(e.props.output)
    if (!text) return <Box />
    const counts = testCounts(text)
    const outer = outerOf(e)
    const box = bordered(outputLines(text), outer - 4, e.props.isErrored ? 'bad' : 'border', titleLabel('Output'))
    return (
      <Box flexDirection="column" marginLeft={2}>
        {counts ? paint($, e, [verdictLine(counts)]) : null}
        {drawBordered($, e, box, outer)}
      </Box>
    )
  }
  if (QUIET_TOOLS.includes(e.props.tool)) return e.props.isErrored ? next(e) : <Box />
  if (e.props.isErrored && typeof e.props.output === 'string' && e.props.output.trim()) {
    const message = e.props.output.replace(/<\/?tool_use_error>/g, '').trim()
    const outer = outerOf(e)
    return drawBordered($, e, bordered(message.split('\n').map((text: string) => [{ text }]), outer - 4, 'bad', titleLabel('Error', 'bad')), outer, { marginLeft: 2 })
  }
  const lines = fileResult(e.props.tool, e.props.output, outerOf(e) - 4)
  if (!lines) return next(e)
  if (e.props.tool === 'Read') return paint($, e, lines)
  return drawBordered($, e, bordered(lines, outerOf(e) - 4), outerOf(e), { marginLeft: 2 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'show', description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as any
    const tool = e.tool as string
    if (tool === TOOL) return { result: 'Displayed to the user inline. Do not repeat its contents verbatim.' } as never
    const ran = (await next(e)) as any
    if (!input.agentId && !ran.isError && [...TASK_TOOLS, 'TaskList'].includes(tool)) {
      await update($, tasks, list => applyTask(list ?? [], tool, input, ran.result))
    }
    return ran as never
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, drawAbovePrompt)

  on('ui.render', { component: 'AssistantMessage' }, drawAssistantMessage)

  on('ui.render', { component: 'ToolGroup' }, drawToolGroup)

  on('ui.render', { component: 'ToolUse' }, drawToolUse)

  on('ui.render', { component: 'ToolResult' }, drawToolResult)
}
