const plain = (t: string) => t.replace(/[*`]/g, '').trim()

export type Tone = 'border' | 'ok' | 'warn' | 'bad' | 'ask' | 'plan' | 'find' | 'change'
export type Part = { text: string } | { lang: string; code: string }
export type Section = { title?: string; tone: Tone; parts: Part[] }

const LABEL = /^\*\*([^*]{1,60}?)[.:]?\*\*[.:]?(?:\s+(.+))?$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const FENCE_OPEN = /^(\s*)```\s*([\w+#.-]*)/
const FENCE_CLOSE = /^\s*```\s*$/
const QUOTE = /^\s*>\s?/
const HEADER = /^#{1,6}\s+(.+?)\s*#*$/
const ITEM = /^(\d+)[.)]\s+(.+)$/
const INTRO = /^\s*([^*`#>\s][^:]{0,58}):\s*$/
const BOLD_LEAD = /^\*\*([^*]{1,60}?)[.:]?\*\*[.:]?\s*(.*)$/

export function toneOf(title: string): Tone {
  if (/danger|data.?loss|irreversible|destructive|fail|error|broken|blocker/i.test(title)) return 'bad'
  if (/warning|caution|careful|risk|not verified|unverified|caveat|still open|blocked|deferred|not done|todo|heads.?up/i.test(title)) return 'warn'
  if (/question|decision|decide|choose|which|\?\s*$/i.test(title)) return 'ask'
  if (/plan|steps|next|approach|proposal|roadmap/i.test(title)) return 'plan'
  if (/done|verified|shipped|passed|fixed|built|complete/i.test(title)) return 'ok'
  if (/cause|finding|found|evidence|diagnos|\bwhy\b|\bcheck|\baudit/i.test(title)) return 'find'
  if (/\bchange[sd]?\b|\bdiff\b|what.?s new/i.test(title)) return 'change'
  return 'border'
}

export function splitSections(text: string): Section[] {
  type Draft = { title?: string; tone: Tone; parts: Part[]; lines: string[]; isQuote?: boolean; isItem?: boolean; isList?: boolean }
  const drafts: Draft[] = [{ tone: 'border', parts: [], lines: [] }]
  const current = () => drafts[drafts.length - 1]!
  const flush = (d: Draft) => {
    const prose = d.lines.join('\n').trim()
    if (prose) d.parts.push({ text: prose })
    d.lines = []
  }
  let code: { lang: string; indent: number; lines: string[] } | null = null
  const closeCode = () => {
    current().parts.push({ lang: code!.lang, code: code!.lines.join('\n') })
    code = null
  }
  let prevBlank = true
  for (const line of text.split('\n')) {
    const blank = !line.trim()
    if (code) {
      if (FENCE_CLOSE.test(line)) {
        closeCode()
        prevBlank = false
      } else {
        const indent = Math.min(code.indent, line.length - line.trimStart().length)
        code.lines.push(line.slice(indent))
      }
      continue
    }
    if (current().isList) {
      if (blank || ITEM.test(line) || (/^\s/.test(line) && !FENCE_OPEN.test(line))) {
        current().lines.push(line)
        prevBlank = blank
        continue
      }
      if (!FENCE_OPEN.test(line)) {
        flush(current())
        drafts.push({ tone: 'border', parts: [], lines: [] })
      }
    }
    if (current().isItem) {
      if (blank || (/^\s/.test(line) && !FENCE_OPEN.test(line))) {
        current().lines.push(line.replace(/^\s{1,4}/, ''))
        prevBlank = blank
        continue
      }
      if (!ITEM.test(line)) {
        flush(current())
        drafts.push({ tone: 'border', parts: [], lines: [] })
      }
    }
    const item = line.match(ITEM)
    if (item && (!current().title || current().isItem)) {
      const lead = item[2]!.match(BOLD_LEAD)
      if (!lead && !current().isItem) {
        const lines = current().lines
        while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop()
        const intro = lines.length ? lines[lines.length - 1]!.match(INTRO) : null
        if (intro) lines.pop()
        flush(current())
        const title = intro ? plain(intro[1]!) : undefined
        drafts.push({ title, tone: title ? toneOf(title) : 'border', parts: [], lines: [line], isList: true })
        prevBlank = false
        continue
      }
      flush(current())
      const title = lead ? `${item[1]}. ${lead[1]!.trim()}` : item[1]!
      const rest = lead ? lead[2]! : item[2]!
      drafts.push({ title, tone: lead ? toneOf(lead[1]!) : 'border', parts: [], lines: rest ? [rest] : [], isItem: true })
      prevBlank = false
      continue
    }
    const open = line.match(FENCE_OPEN)
    if (open) {
      if (current().isQuote) drafts.push({ tone: 'border', parts: [], lines: [] })
      flush(current())
      code = { lang: open[2]!.toLowerCase(), indent: open[1]!.length, lines: [] }
      continue
    }
    if (RULE.test(line)) {
      prevBlank = true
      continue
    }
    const header = line.match(HEADER)
    if (header) {
      flush(current())
      drafts.push({ title: plain(header[1]!), tone: toneOf(header[1]!), parts: [], lines: [] })
      prevBlank = true
      continue
    }
    const label = prevBlank ? line.match(LABEL) : null
    if (label) {
      flush(current())
      drafts.push({ title: label[1]!.trim(), tone: toneOf(label[1]!), parts: [], lines: label[2] ? [label[2]] : [] })
      prevBlank = false
      continue
    }
    if (QUOTE.test(line)) {
      if (!current().isQuote) {
        flush(current())
        drafts.push({ title: 'Important', tone: 'bad', parts: [], lines: [], isQuote: true })
      }
      current().lines.push(line.replace(QUOTE, ''))
      prevBlank = false
      continue
    }
    if (current().isQuote && !blank) {
      flush(current())
      drafts.push({ tone: 'border', parts: [], lines: [] })
    }
    current().lines.push(line)
    prevBlank = blank
  }
  if (code) closeCode()
  flush(current())
  return drafts.map(d => ({ title: d.title, tone: d.tone, parts: d.parts })).filter(s => s.parts.length || s.title)
}
