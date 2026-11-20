import { expect, test } from 'claude-code/testing'

const clock = (on: any) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1000) }))
}

const engineDraws = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine ${e.component}`}</Text>
  })

const row = (component: string, props: Record<string, unknown>) => ({
  plugin: 'stainedglass',
  surface: 'terminal',
  component,
  requestId: 'r1',
  viewport: { columns: 100, rows: 40 },
  props: { tool_use_id: 't1', isRunning: false, isErrored: false, isInterrupted: false, ...props },
})

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')
const seg = async (ui: any, re: RegExp) => (await ui.findAll({ type: 'Text', text: re })).map((t: any) => t.props ?? {})

const mount = async ($: any, on: any, component: string, props: Record<string, unknown>) => {
  clock(on)
  engineDraws(on)
  return $.ui.mount(row(component, props) as never)
}

const EDIT_INPUT = { file_path: '/home/dev/code/app/src/a.ts', old_string: 'const a = 1', new_string: 'const a = 2\nconst b = 3' }
const EDIT_OUTPUT = {
  filePath: '/home/dev/code/app/src/a.ts',
  structuredPatch: [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [' import x', '-const a = 1', '+const a = 2', '+const b = 3'] }],
}

test('an Edit row names the file in bright blue with +N −M counts', async ($, on) => {
  const ui = await mount($, on, 'ToolUse', { tool: 'Edit', input: EDIT_INPUT, output: EDIT_OUTPUT })
  expect(await texts(ui)).toMatch(/^✓ Edit ~\/code\/app\/src\/a\.ts  \+2 −1$/m)
  expect(await seg(ui, /^Edit$/)).toContainEqual(expect.objectContaining({ color: 'whiteBright', bold: true }))
  expect(await seg(ui, /^~\/code\/app\/src\/a\.ts$/)).toContainEqual(expect.objectContaining({ color: 'blueBright' }))
  expect(await seg(ui, /^\+2$/)).toContainEqual(expect.objectContaining({ color: 'green' }))
  expect(await seg(ui, /^−1$/)).toContainEqual(expect.objectContaining({ color: 'red' }))
  await ui.unmount()
})

test('a pending Edit counts from its input', async ($, on) => {
  const ui = await mount($, on, 'ToolUse', { tool: 'Edit', input: EDIT_INPUT, isRunning: true })
  expect(await texts(ui)).toMatch(/^● Edit ~\/code\/app\/src\/a\.ts  \+2 −1$/m)
  await ui.unmount()
})

test('an Edit result draws its hunks with line numbers, diff bands and highlighted context', async ($, on) => {
  const ui = await mount($, on, 'ToolResult', { tool: 'Edit', output: EDIT_OUTPUT })
  const drawn = await texts(ui)
  expect(drawn).toMatch(/^ +10 {2}import x$/m)
  expect((await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle === 'single')).toHaveLength(1)
  expect(drawn).not.toMatch(/[┌│└]/)
  expect(drawn).toMatch(/^ +11 -const a = 1 +$/m)
  expect(drawn).toMatch(/^ +12 \+const b = 3 +$/m)
  expect(await seg(ui, /^\+const a = 2 +$/)).toContainEqual(expect.objectContaining({ backgroundColor: '#1f6b35', color: 'whiteBright' }))
  expect(await seg(ui, /^-const a = 1 +$/)).toContainEqual(expect.objectContaining({ backgroundColor: '#8b1e2a', color: 'whiteBright' }))
  expect(await seg(ui, /^import$/)).toContainEqual(expect.objectContaining({ color: 'magenta' }))
  await ui.unmount()
})

test('a new file from Write shows its head highlighted and how much is folded', async ($, on) => {
  const content = Array.from({ length: 30 }, (_, i) => `x${i}: ${i}`).join('\n')
  const ui = await mount($, on, 'ToolResult', { tool: 'Write', output: { type: 'create', filePath: '/tmp/c.yaml', content, structuredPatch: [] } })
  const drawn = await texts(ui)
  expect(drawn).toMatch(/^ +1 {2}x0: 0$/m)
  expect(drawn).toContain('18 more lines · ctrl+o')
  expect(await seg(ui, /^x0$/)).toContainEqual(expect.objectContaining({ color: 'cyan' }))
  await ui.unmount()
})

test('a Read row shows the path and range; its result is one line with the counts', async ($, on) => {
  const use = await mount($, on, 'ToolUse', { tool: 'Read', input: { file_path: '/home/dev/a.rb', offset: 10, limit: 60 } })
  expect(await texts(use)).toMatch(/^✓ Read ~\/a\.rb · lines 10–69$/m)
  await use.unmount()
  const result = await $.ui.mount(
    row('ToolResult', { tool: 'Read', output: { type: 'text', file: { filePath: '/home/dev/a.rb', content: 'x', numLines: 60, startLine: 10, totalLines: 400 } } }) as never,
  )
  expect(await texts(result)).toMatch(/^ {2}60 of 400 lines$/m)
  expect(await seg(result, /^60$/)).toContainEqual(expect.objectContaining({ color: 'magenta' }))
  await result.unmount()
})

test('a failed tool result is a red Error box with the message', async ($, on) => {
  const ui = await mount($, on, 'ToolResult', { tool: 'Edit', isErrored: true, output: 'String to replace not found in file.' })
  const drawn = await texts(ui)
  expect((await ui.find({ type: 'Text', text: /^ Error $/ }))?.props).toEqual(expect.objectContaining({ color: 'red' }))
  expect((await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle).map((b: any) => b.props.borderColor)).toEqual(['red'])
  expect(drawn).toMatch(/^String to replace not found in file\.$/m)
  expect(drawn).not.toMatch(/[┌│└]/)
  await ui.unmount()
})

test('an unknown tool result with an unexpected shape stays the engine row', async ($, on) => {
  const ui = await mount($, on, 'ToolResult', { tool: 'Edit', output: { surprise: true } })
  expect(await texts(ui)).toBe('engine ToolResult')
  await ui.unmount()
})
