import type { Line, Seg, Style } from './draw'

type Rule = [RegExp, (text: string, line: string, at: number) => Style | undefined | false]

const SHELL = new Set(['bash', 'sh', 'zsh', 'shell', 'console', 'shellsession'])
const HASH_COMMENT = new Set(['ruby', 'rb', 'python', 'py', 'hcl', 'tf', 'terraform', 'toml', 'dockerfile', 'make', 'makefile'])
const SLASH_COMMENT = new Set(['ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript', 'go', 'rust', 'rs', 'java', 'kotlin', 'swift', 'c', 'cpp', 'hcl', 'tf', 'terraform'])
const KEYWORDS = new Set(
  (
    'def end class module do if elsif else unless while until for in return yield begin rescue ensure raise require require_relative ' +
    'then case when nil true false self super and or not import from export default const let var function async await new typeof ' +
    'interface type extends implements as of try catch finally throw null undefined this func package struct range defer chan fn pub ' +
    'impl use mut match lambda pass None True False with elif resource variable data output locals provider terraform private public'
  ).split(' '),
)

const STRING = /"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?/y
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.])/y
const atBoundary = (line: string, at: number) => at === 0 || /\s/.test(line[at - 1]!)

function scan(line: string, rules: Rule[]): Line {
  const segs: Seg[] = []
  const push = (text: string, style?: Style) => {
    const last = segs[segs.length - 1]
    if (!style && last && !last.style) last.text += text
    else segs.push(style ? { text, style } : { text })
  }
  let at = 0
  outer: while (at < line.length) {
    for (const [re, styleOf] of rules) {
      re.lastIndex = at
      const m = re.exec(line)
      if (!m || !m[0]) continue
      const style = styleOf(m[0], line, at)
      if (style === false) continue
      push(m[0], style)
      at += m[0].length
      continue outer
    }
    push(line[at]!)
    at += 1
  }
  return segs
}

function code(lang: string): (line: string) => Line {
  const comment = HASH_COMMENT.has(lang) && SLASH_COMMENT.has(lang) ? /(?:#|\/\/).*/y : HASH_COMMENT.has(lang) ? /#.*/y : /\/\/.*/y
  const rules: Rule[] = [
    [comment, () => 'comment'],
    [STRING, () => 'string'],
    [NUMBER, (_, line, at) => (/[\w]/.test(line[at - 1] ?? '') ? false : 'number')],
    [/[A-Za-z_]\w*[?!]?/y, w => (KEYWORDS.has(w) ? 'keyword' : /^[A-Z]/.test(w) ? 'constant' : undefined)],
  ]
  return line => scan(line, rules)
}

function shell(): (line: string) => Line {
  let expectCommand = true
  let continued = false
  const rules: Rule[] = [
    [/#.*/y, (_, line, at) => (atBoundary(line, at) ? 'comment' : false)],
    [/"(?:[^"\\]|\\.)*"?|'[^']*'?/y, () => 'string'],
    [/\$\{[^}]*\}|\$[\w@?#*]+/y, () => 'variable'],
    [/\|\||&&|[|;]/y, () => ((expectCommand = true), 'operator')],
    [/>>?|</y, () => 'operator'],
    [
      /[^\s|;&<>"'$]+/y,
      (w, line, at) => {
        if (w.startsWith('-') && atBoundary(line, at)) return 'flag'
        if (!expectCommand || w === '\\' || w.includes('=')) return undefined
        expectCommand = false
        return 'command'
      },
    ],
  ]
  return line => {
    expectCommand = !continued
    continued = /\\\s*$/.test(line)
    return scan(line, rules)
  }
}

function json(): (line: string) => Line {
  const rules: Rule[] = [
    [/"(?:[^"\\]|\\.)*"?/y, (s, line, at) => (/^\s*:/.test(line.slice(at + s.length)) ? 'field' : 'string')],
    [NUMBER, () => 'number'],
    [/true|false|null/y, () => 'literal'],
  ]
  return line => scan(line, rules)
}

function yaml(): (line: string) => Line {
  const rules: Rule[] = [
    [/#.*/y, (_, line, at) => (atBoundary(line, at) ? 'comment' : false)],
    [STRING, () => 'string'],
    [/(?:true|false|null|yes|no)(?![\w.-])/y, (_, line, at) => (atBoundary(line, at) ? 'literal' : false)],
    [NUMBER, (_, line, at) => (atBoundary(line, at) ? 'number' : false)],
    [/[A-Za-z_][\w.\/-]*/y, () => undefined],
  ]
  return line => {
    const key = line.match(/^(\s*(?:-\s+)?)([\w.\/-]+)(?=\s*:(?:\s|$))/)
    if (!key) return scan(line, rules)
    const head: Line = key[1] ? [{ text: key[1] }, { text: key[2]!, style: 'field' }] : [{ text: key[2]!, style: 'field' }]
    return [...head, ...scan(line.slice(key[0].length), rules)]
  }
}

function log(line: string): Line {
  const stamp = line.match(/^(?:\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d:\d\d(?:\.\d+)?Z?)?|\d\d:\d\d:\d\d(?:\.\d+)?)/)
  const rest = stamp ? line.slice(stamp[0].length) : line
  const style: Style | undefined = /\b(error|fatal|fail(ed|ure)?|panic|exception)\b/i.test(rest)
    ? 'bad'
    : /\bwarn(ing)?\b/i.test(rest)
      ? 'warn'
      : undefined
  const tail: Line = rest ? [style ? { text: rest, style } : { text: rest }] : []
  return stamp ? [{ text: stamp[0], style: 'comment' }, ...tail] : tail
}

function diff(line: string): Line {
  if (line.startsWith('@@')) return [{ text: line, style: 'hunk' }]
  if (line.startsWith('+')) return [{ text: line, style: 'added' }]
  if (line.startsWith('-')) return [{ text: line, style: 'removed' }]
  return [{ text: line }]
}

function painter(lang: string): (line: string) => Line {
  if (lang === 'diff' || lang === 'patch') return diff
  if (lang === 'log' || lang === 'logs') return log
  if (SHELL.has(lang)) return shell()
  if (lang === 'json' || lang === 'jsonc') return json()
  if (lang === 'yaml' || lang === 'yml') return yaml()
  if (HASH_COMMENT.has(lang) || SLASH_COMMENT.has(lang)) return code(lang)
  return line => [{ text: line }]
}

export function highlight(lang: string, text: string): Line[] {
  const paint = painter(lang.toLowerCase())
  return text.split('\n').map(line => (line ? paint(line) : []))
}
