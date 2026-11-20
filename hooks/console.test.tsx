import { expect, test } from 'claude-code/testing'

const clock = (on: any) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1000) }))
}

const engineDraws = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine ${typeof e.props.text === 'string' ? e.props.text : ''}`}</Text>
  })


const row = (component: string, props: Record<string, unknown>) => ({
  plugin: 'stainedglass',
  surface: 'terminal',
  component,
  requestId: 'r1',
  viewport: { columns: 100, rows: 40 },
  props,
})

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')

const bash = (props: Record<string, unknown>) =>
  row('ToolUse', {
    tool_use_id: 'b1',
    tool: 'Bash',
    input: { command: 'git status --short', description: 'Show working tree status' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    ...props,
  })

test('a Bash row shows the command verbatim and uncoloured, then its outcome', async ($, on) => {
  clock(on)
  const cases: [Record<string, unknown>, string, string][] = [
    [{ isRunning: true }, '● running', 'cyan'],
    [{ output: { stdout: 'M a.rb', stderr: '', interrupted: false } }, '✓ done', 'green'],
    [{ isErrored: true, output: 'Exit code 1' }, '✗ failed', 'red'],
    [{ isInterrupted: true }, '▲ interrupted', 'yellow'],
  ]
  for (const [props, outcome, color] of cases) {
    const ui = await $.ui.mount(bash(props) as never)
    expect(await texts(ui)).toMatch(/Command:[\s\S]*Show working tree status/)
    const command = await ui.find({ type: 'Text', text: /^  git status --short$/ })
    expect(command).toBeTruthy()
    expect(command?.props?.color).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${outcome}$`) }))?.props?.color).toBe(color)
    await ui.unmount()
  }
})

test('an expanded Bash row is the engine row', async ($, on) => {
  clock(on)
  engineDraws(on)
  const ui = await $.ui.mount(bash({ isExpanded: true }) as never)
  expect(await texts(ui)).toContain('engine')
  await ui.unmount()
})

test('Bash output is a grey Output box with the tail and a count of what it hides', async ($, on) => {
  clock(on)
  const stdout = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const ui = await $.ui.mount(row('ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: { stdout, stderr: '', interrupted: false }, isErrored: false }) as never)
  const drawn = await texts(ui)
  expect(await ui.find({ type: 'Text', text: /^ Output $/ })).toBeTruthy()
  expect(drawn).not.toMatch(/[┌│└]/)
  expect(drawn).toContain('line 30')
  expect(drawn).not.toMatch(/line 1 /)
  expect(drawn).toContain('20 earlier lines · ctrl+o')
  await ui.unmount()
})

test('a Bash command with no output draws no box', async ($, on) => {
  clock(on)
  const ui = await $.ui.mount(row('ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: { stdout: '', stderr: '', interrupted: false }, isErrored: false }) as never)
  expect(await texts(ui)).not.toContain('Output')
  await ui.unmount()
})

test('a folded run of reads and searches is one dim line', async ($, on) => {
  clock(on)
  const call = (tool: string, input: unknown) => ({ tool, input, isRunning: false, isErrored: false, isInterrupted: false })
  const ui = await $.ui.mount(
    row('ToolGroup', {
      calls: [call('Read', { file_path: '/a.rb' }), call('Read', { file_path: '/b.rb' }), call('Grep', { pattern: 'x' })],
      isActive: false,
      isExpanded: false,
      isCallsOnly: true,
    }) as never,
  )
  const line = await ui.find({ type: 'Text', text: /read 2 files · searched 1 pattern/ })
  expect(line?.props?.dimColor).toBe(true)
  await ui.unmount()
})

test('a test run prints a verdict and a pass/fail bar above its output', async ($, on) => {
  clock(on)
  const result = (stdout: string) => row('ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: { stdout, stderr: '', interrupted: false }, isErrored: false })
  const cases: [string, RegExp, string, string, string][] = [
    ['(pass) a\n\n 20 pass\n 0 fail\nRan 20 tests across 3 files.', /^✓ 20 pass · 0 fail$/, 'green', '████████████', ''],
    ['(fail) b\n 17 pass\n 3 fail', /^✗ 17 pass · 3 fail$/, 'red', '██████████', '██'],
    ['Finished in 1.2s\n20 examples, 3 failures', /^✗ 17 pass · 3 fail$/, 'red', '██████████', '██'],
  ]
  for (const [stdout, verdict, color, passed, failed] of cases) {
    const ui = await $.ui.mount(result(stdout) as never)
    expect((await ui.find({ type: 'Text', text: verdict }))?.props?.color).toBe(color)
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${passed}$`) }))?.props?.color).toBe('green')
    if (failed) expect((await ui.find({ type: 'Text', text: new RegExp(`^${failed}$`) }))?.props?.color).toBe('red')
    expect(await ui.find({ type: 'Text', text: /^ Output $/ })).toBeTruthy()
    await ui.unmount()
  }
})
