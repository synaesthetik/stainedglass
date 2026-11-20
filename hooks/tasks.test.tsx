import { expect, test } from 'claude-code/testing'

const clock = (on: any) => {
  let now = 1_000_000
  on('clock.now', () => ({ value: (now += 1000) }))
}

const BAND = {
  plugin: 'stainedglass',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

const engineDraws = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

test('TodoWrite fills the band with a strip and one row per todo', async ($, on) => {
  clock(on)
  on('tool.call', (_, e: any) => ({ result: { oldTodos: [], newTodos: e.todos } }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Write manifest', status: 'completed', activeForm: 'Writing manifest' },
      { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
      { content: 'Wire band', status: 'pending', activeForm: 'Wiring band' },
    ],
  } as never)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /✓●○/ }))?.text).toMatch(/✓●○  ████░{8}  2\/3 Writing tests/)
    expect((await ui.find({ type: 'Text', text: /Wire band/ }))?.text).toContain('○')
    expect((await ui.find({ type: 'Text', text: /Write manifest/ }))?.text).toContain('✓')
    await ui.unmount()
  }
})

test('TaskCreate and TaskUpdate track status and blockers', async ($, on) => {
  clock(on)
  let next = 0
  on('tool.call', (_, e: any) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: String(++next), subject: e.subject } } }
    return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Census', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Publish', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress', activeForm: 'Running census' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', addBlockedBy: ['1'] } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /●○/ }))?.text).toContain('1/2 Running census')
  expect((await ui.find({ type: 'Text', text: /Publish/ }))?.text).toContain('blocked by #1')
  await ui.unmount()
})

test('the band steps aside once every task is done', async ($, on) => {
  clock(on)
  engineDraws(on)
  on('tool.call', (_, e: any) => ({ result: { oldTodos: [], newTodos: e.todos } }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Only', status: 'completed', activeForm: 'Doing only' }],
  } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a subagent todo list does not replace the main one', async ($, on) => {
  clock(on)
  on('tool.call', (_, e: any) => ({ result: { oldTodos: [], newTodos: e.todos } }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Main work', status: 'in_progress', activeForm: 'Doing main work' }],
  } as never)
  await $.tool.call({
    tool: 'TodoWrite',
    agentId: 'a1',
    todos: [{ content: 'Sub work', status: 'in_progress', activeForm: 'Doing sub work' }],
  } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Doing main work/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Doing sub work/ })).toBeFalsy()
  await ui.unmount()
})

test('a TaskUpdate row draws as one compact line', async ($, on) => {
  clock(on)
  on('tool.call', (_, e: any) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: '7', subject: e.subject } } }
    return { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Census', description: 'd' } as never)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'stainedglass',
      surface,
      component: 'ToolUse',
      requestId: 'u1',
      props: {
        tool_use_id: 'u1',
        tool: 'TaskUpdate',
        input: { taskId: '7', status: 'completed' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    })
    expect((await ui.find({ type: 'Text', text: /#7/ }))?.text).toBe('✓ #7 Census → completed')
    await ui.unmount()
  }
})

test('the band is the phase strip and task rows, unframed', async ($, on) => {
  clock(on)
  on('tool.call', (_, e: any) => ({ result: { oldTodos: [], newTodos: e.todos } }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Only', status: 'in_progress', activeForm: 'Doing only' }],
  } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /●  ░{12}  1\/1 Doing only/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /[┌╭│]/ })).toBeFalsy()
  expect((await ui.find({ key: 'band' }))?.props?.borderStyle).toBeUndefined()
  await ui.unmount()
})
