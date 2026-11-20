import { expect, test } from 'claude-code/testing'

const clock = (on: any) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1000) }))
}

const TOOL = 'mcp__stainedglass__show'

const row = (input: unknown, surface: 'terminal' | 'desktop') => ({
  plugin: 'stainedglass',
  surface,
  component: 'ToolUse',
  requestId: 't1',
  props: {
    tool_use_id: 't1',
    tool: TOOL,
    input,
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  },
} as const)

const SURFACES = ['terminal', 'desktop'] as const

test('the tool answers with a short acknowledgement', async ($, on) => {
  clock(on)
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: TOOL, title: 'x', blocks: [] } as never)

  const result = (ran as { result?: unknown }).result
  expect(typeof result).toBe('string')
  expect(result).toContain('Displayed')
})

test('a census table draws a gauge and a verdict-coloured size', async ($) => {
  const input = {
    title: 'Disk usage',
    blocks: [
      {
        type: 'table',
        title: 'Volumes',
        header: ['VOLUME', 'SIZE', 'FILL'],
        rows: [
          ['{id:vol-a}', '{bad:78.2 GiB}', { gauge: 78.2, max: 75, target: 70 }],
          ['{id:vol-b}', '{ok:12.0 GiB}', { gauge: 12, max: 75, target: 70 }],
        ],
      },
    ],
  }

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(row(input, surface))
    expect((await ui.find({ type: 'Text', text: /vol-a/ }))?.text).toContain('vol-a')
    expect((await ui.find({ type: 'Text', text: /████/ }))?.text).toContain('█')
    expect((await ui.find({ type: 'Text', text: /░/ }))?.text).toContain('░')
    await ui.unmount()
  }
})

test('a timeline draws its axis, marks and end labels', async ($) => {
  const input = {
    blocks: [
      {
        type: 'timeline',
        title: 'Latency spread',
        low: 0,
        high: 100,
        lowLabel: '80000000',
        highLabel: 'ffffffff',
        density: [1, 4, 9, 2],
        marks: [
          { at: 50, kind: 'highlight', label: 'c0000000' },
          { at: 20, kind: 'error' },
        ],
      },
    ],
  }

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(row(input, surface))
    expect((await ui.find({ type: 'Text', text: /├/ }))?.text).toMatch(/├[─★✗]+┤/)
    expect((await ui.find({ type: 'Text', text: /80000000/ }))?.text).toContain('ffffffff')
    expect((await ui.find({ type: 'Text', text: /c0000000/ }))?.text).toContain('c0000000')
    await ui.unmount()
  }
})

test('options and phases draw their glyphs', async ($) => {
  const input = {
    blocks: [
      { type: 'phases', steps: [{ name: 'Preflight', status: 'complete' }, { name: 'Plan', status: 'current' }, { name: 'Ship', status: 'locked' }] },
      { type: 'options', options: [{ key: 'r', label: 'refresh' }, { key: 'q', label: 'quit' }, { key: 's', label: 'ship', disabled: 'no plan yet' }] },
    ],
  }

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(row(input, surface))
    expect((await ui.find({ type: 'Text', text: /✓/ }))?.text).toContain('2/3 Plan')
    expect((await ui.find({ type: 'Text', text: /\[r\]/ }))?.text).toContain('refresh')
    expect((await ui.find({ type: 'Text', text: /no plan yet/ }))?.text).toContain('[s] ship')
    await ui.unmount()
  }
})

test('ctrl+o shows the engine row', async ($, on) => {
  clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const base = row({ blocks: [] }, 'terminal')
  const ui = await $.ui.mount({ ...base, props: { ...base.props, isExpanded: true } })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
