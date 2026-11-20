import { expect, test } from 'claude-code/testing'

import { TEXT_PROPS } from './draw'
import type { Line } from './draw'
import { inline, markdown } from './markdown'

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const plainOf = (lines: Line[]) => lines.map(l => l.map(s => s.text).join(''))
const styleOf = (lines: Line[], text: string) => lines.flat().find(s => s.text === text)?.style

test('every ANSI colour but plain blue and black has a job in the palette, plain blue being too dark to read and a black background too heavy behind code', async () => {
  const used = new Set(Object.values(TEXT_PROPS).flatMap(p => [p.color, p.backgroundColor]))
  for (const c of ANSI) {
    expect(used.has(c)).toBe(c !== 'blue' && c !== 'black')
    expect(used.has(`${c}Bright`)).toBe(true)
  }
})

test('inline markdown: code, paths, bold, italic and links take their own styles, markers dropped', async () => {
  const line = inline('Run `git status` on `hooks/register.tsx`, **then stop**, *maybe*, see [docs](https://x.y).')
  expect(line.map(s => s.text).join('')).toBe('Run git status on hooks/register.tsx, then stop, maybe, see docs.')
  expect(styleOf([line], 'git status')).toBe('code')
  expect(styleOf([line], 'hooks/register.tsx')).toBe('path')
  expect(styleOf([line], 'then stop')).toBe('strong')
  expect(styleOf([line], 'maybe')).toBe('em')
  expect(styleOf([line], 'docs')).toBe('link')
})

test('code inside bold keeps the code style', async () => {
  const line = inline('**ship `0.9.0`**')
  expect(styleOf([line], 'ship ')).toBe('strong')
  expect(styleOf([line], '0.9.0')).toBe('code')
})

test('paragraph lines keep their breaks and wrap to the width', async () => {
  const lines = markdown('one two three four five six\nshort', 12)
  expect(plainOf(lines)).toEqual(['one two', 'three four', 'five six', 'short'])
})

test('bullets become coloured markers with a hanging indent; numbers keep their digits', async () => {
  const lines = markdown('- alpha beta gamma delta\n  - nested\n1. first', 14)
  expect(plainOf(lines)).toEqual(['• alpha beta', '  gamma delta', '  • nested', '1. first'])
  expect(styleOf(lines, '•')).toBe('bullet')
  expect(TEXT_PROPS.bullet.color).toBe('cyan')
  expect(styleOf(lines, '1.')).toBe('bullet')
})

test('blank lines separate blocks once; headers are styled', async () => {
  const lines = markdown('### Title\n\n\ntext', 40)
  expect(plainOf(lines)).toEqual(['Title', '', 'text'])
  expect(styleOf(lines, 'Title')).toBe('header')
})

test('a markdown table draws as a ruled grid', async () => {
  const lines = markdown('| a | b |\n|---|---|\n| `1` | 2 |', 40)
  expect(plainOf(lines)).toEqual(['┌───┬───┐', '│ a │ b │', '├───┼───┤', '│ 1 │ 2 │', '└───┴───┘'])
})

test('numbers in prose are purple, including units, but not inside code', async () => {
  const line = inline('41 tests in 4m 29s, `v2` and 0.9.0')
  expect(styleOf([line], '41')).toBe('count')
  expect(styleOf([line], '4m')).toBe('count')
  expect(styleOf([line], '29s')).toBe('count')
  expect(styleOf([line], '0.9.0')).toBe('count')
  expect(styleOf([line], 'v2')).toBe('code')
  expect(TEXT_PROPS.count.color).toBe('magenta')
})

test('a bold lead-in at the start of a line or list item takes the lead style', async () => {
  const lines = markdown('- **Widths:** wrap\n**Note.** text\nmid **bold** stays', 80)
  expect(styleOf(lines, 'Widths:')).toBe('lead')
  expect(styleOf(lines, 'Note.')).toBe('lead')
  expect(styleOf(lines, 'bold')).toBe('strong')
  expect(TEXT_PROPS.lead).toEqual({ color: 'magentaBright', bold: true })
})
