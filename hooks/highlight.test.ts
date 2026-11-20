import { expect, test } from 'claude-code/testing'

import { highlight } from './highlight'
import type { Line } from './draw'

const styleOf = (lines: Line[], text: string) => lines.flat().find(s => s.text === text)?.style

test('diff lines take the added and removed bands, hunks cyan', async () => {
  const lines = highlight('diff', '@@ -1 +1 @@\n- old\n+ new\n  same')
  expect(lines[0]).toEqual([{ text: '@@ -1 +1 @@', style: 'hunk' }])
  expect(lines[1]).toEqual([{ text: '- old', style: 'removed' }])
  expect(lines[2]).toEqual([{ text: '+ new', style: 'added' }])
  expect(lines[3]![0]!.style).toBeUndefined()
})

test('bash: the command bold, flags yellow, strings green, variables magenta, comments dim', async () => {
  const lines = highlight('bash', 'git status --short "a b" $HOME # why\ndocker ps -n 5 | grep Up')
  expect(styleOf(lines, 'git')).toBe('command')
  expect(styleOf(lines, '--short')).toBe('flag')
  expect(styleOf(lines, '"a b"')).toBe('string')
  expect(styleOf(lines, '$HOME')).toBe('variable')
  expect(styleOf(lines, '# why')).toBe('comment')
  expect(styleOf(lines, 'docker')).toBe('command')
  expect(styleOf(lines, '-n')).toBe('flag')
  expect(styleOf(lines, '|')).toBe('operator')
  expect(styleOf(lines, 'grep')).toBe('command')
})

test('json: keys cyan, strings green, numbers blue, literals magenta', async () => {
  const lines = highlight('json', '{"name": "web", "replicas": 4, "ok": true}')
  expect(styleOf(lines, '"name"')).toBe('field')
  expect(styleOf(lines, '"web"')).toBe('string')
  expect(styleOf(lines, '4')).toBe('number')
  expect(styleOf(lines, 'true')).toBe('literal')
})

test('yaml: keys cyan, comments dim, scalars coloured', async () => {
  const lines = highlight('yaml', 'replicas: 3 # min\nimage: "nginx:1.27"\n- name: web')
  expect(styleOf(lines, 'replicas')).toBe('field')
  expect(styleOf(lines, '3')).toBe('number')
  expect(styleOf(lines, '# min')).toBe('comment')
  expect(styleOf(lines, '"nginx:1.27"')).toBe('string')
  expect(styleOf(lines, 'name')).toBe('field')
})

test('code: keywords magenta, strings green, comments dim, numbers blue, constants cyan', async () => {
  const ruby = highlight('ruby', "def fetch(id) # go\n  return App::Record.new('x', 2) if id\nend")
  expect(styleOf(ruby, 'def')).toBe('keyword')
  expect(styleOf(ruby, '# go')).toBe('comment')
  expect(styleOf(ruby, 'return')).toBe('keyword')
  expect(styleOf(ruby, 'App')).toBe('constant')
  expect(styleOf(ruby, "'x'")).toBe('string')
  expect(styleOf(ruby, '2')).toBe('number')
  expect(styleOf(ruby, 'end')).toBe('keyword')
  const ts = highlight('ts', 'const n = await next(e) // why')
  expect(styleOf(ts, 'const')).toBe('keyword')
  expect(styleOf(ts, 'await')).toBe('keyword')
  expect(styleOf(ts, '// why')).toBe('comment')
})

test('log: error lines red, warnings yellow, timestamps dim', async () => {
  const lines = highlight('log', '2026-11-12T10:00:00Z ERROR boom\n10:00:01 WARN slow\nplain')
  expect(styleOf(lines, '2026-11-12T10:00:00Z')).toBe('comment')
  expect(styleOf(lines, ' ERROR boom')).toBe('bad')
  expect(styleOf(lines, ' WARN slow')).toBe('warn')
  expect(lines[2]).toEqual([{ text: 'plain' }])
})

test('an unknown language passes through uncoloured, keeping every line', async () => {
  expect(highlight('', 'a\n\nb')).toEqual([[{ text: 'a' }], [], [{ text: 'b' }]])
})
