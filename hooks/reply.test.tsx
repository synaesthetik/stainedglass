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

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  plugin: 'stainedglass',
  surface: 'terminal',
  component: 'AssistantMessage',
  requestId: 'r1',
  viewport: { columns: 100, rows: 40 },
  props: { text, isFirstOfReply: true, ...extra },
})

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')
const seg = async (ui: any, re: RegExp) => (await ui.findAll({ type: 'Text', text: re })).map((t: any) => t.props ?? {})

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const titled = async (ui: any, title: string) => {
  const label = await ui.find({ type: 'Text', text: new RegExp(`^ ${esc(title)} $`) })
  return label?.props
}
const borders = async (ui: any) => (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle).map((b: any) => b.props.borderColor)

const mount = async ($: any, on: any, text: string, extra?: Record<string, unknown>) => {
  clock(on)
  engineDraws(on)
  return $.ui.mount(reply(text, extra) as never)
}

test('plain prose is drawn by the mod with a reply bullet and coloured inline code', async ($, on) => {
  const ui = await mount($, on, 'Run `git status` in `hooks/register.tsx` **now**.')
  const drawn = await texts(ui)
  expect(drawn).not.toContain('engine')
  expect(drawn).toMatch(/^●/m)
  expect(drawn).toContain('Run git status in hooks/register.tsx now.')
  expect(await seg(ui, /^git status$/)).toContainEqual(expect.objectContaining({ color: 'magentaBright' }))
  expect((await seg(ui, /^git status$/)).some((p: any) => p.backgroundColor)).toBe(false)
  expect(await seg(ui, /^hooks\/register\.tsx$/)).toContainEqual(expect.objectContaining({ color: 'blueBright' }))
  expect(await seg(ui, /^now$/)).toContainEqual(expect.objectContaining({ bold: true }))
  await ui.unmount()
})

test('a later block of the same reply has no bullet', async ($, on) => {
  const ui = await mount($, on, 'More.', { isFirstOfReply: false })
  expect(await texts(ui)).not.toContain('●')
  await ui.unmount()
})

test('a summary row stays the engine row', async ($, on) => {
  const ui = await mount($, on, 'Summed up.', { isSummary: true })
  expect(await texts(ui)).toBe('engine Summed up.')
  await ui.unmount()
})

const ENDS_ON_OPTIONS = `The refactor plans clean.

How should I ship it?

1. **Push the commit, then reply to both bot threads.**
2. Push only, and you handle the threads.
3. Hold locally so you can review the diff first.

I'd go with **1**.`

test('a closing question and numbered options draw as a decision box titled with the question', async ($, on) => {
  const ui = await mount($, on, ENDS_ON_OPTIONS)
  const drawn = await texts(ui)
  expect(drawn).toContain('The refactor plans clean.')
  expect(await titled(ui, 'How should I ship it?')).toBeTruthy()
  expect(drawn).toContain('[2] Push only, and you handle the threads.')
  expect(drawn).toContain("I'd go with 1.")
  expect(await seg(ui, /^Push the commit, then reply to both bot threads\.$/)).toContainEqual(expect.objectContaining({ color: 'green' }))
  expect(await borders(ui)).toContain('magenta')
  expect(await texts(ui)).not.toMatch(/[┌│└]/)
  await ui.unmount()
})

test('every box is the full width, long lines and options wrapping inside its padding', async ($, on) => {
  const long = 'Draft the release notes for the next version and check that every linked issue is closed and labelled before anything else'
  const ui = await mount($, on, `**Context**\n${long}\n\nNext?\n\n1. ${long}\n2. Leave it`)
  const boxes = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle)
  expect(boxes.map((b: any) => [b.props.width, b.props.paddingX])).toEqual([[96, 1], [96, 1]])
  const lines = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).filter((t: string) => t.includes('Draft') || t.includes('labelled'))
  expect(lines.length).toBeGreaterThan(2)
  for (const l of lines) expect([...l].length).toBeLessThanOrEqual(92)
  await ui.unmount()
})

test('a question too long for the top border goes inside the box as a bold heading', async ($, on) => {
  const question = 'Which of the remaining follow-ups should I take on now that both pull requests have been opened and reviewed by the team?'
  const ui = await mount($, on, `${question}\n\n1. Apply\n2. Wait`)
  expect((await ui.findAll({ type: 'Box' })).map((b: any) => b.props.borderColor)).toContain('magenta')
  expect(await seg(ui, /^Which of the remaining follow-ups/)).toContainEqual(expect.objectContaining({ bold: true }))
  await ui.unmount()
})

test('a tradeoff after a dash goes dim on its own line under the option', async ($, on) => {
  const ui = await mount($, on, 'Next?\n\n1. **Build it** — costs a day, unblocks the release\n2. Skip it - nothing changes')
  const drawn = await texts(ui)
  expect(drawn).toMatch(/^\[1\] Build it$/m)
  expect(drawn).toMatch(/^    costs a day, unblocks the release$/m)
  expect(await seg(ui, /^costs a day, unblocks the release$/)).toContainEqual(expect.objectContaining({ dimColor: true }))
  await ui.unmount()
})

const CAUSES = `Some possible causes:

1. **The plugin menu.** You disabled something.
2. **A short session.** Little context so far.
   Turns slow as it grows.
3. Server load.

Open the plugin menu to check.`

test('each numbered item outside a section draws in its own box titled by its number and bold lead', async ($, on) => {
  const ui = await mount($, on, CAUSES)
  const drawn = await texts(ui)
  expect(drawn).toMatch(/^Some possible causes:$/m)
  expect(await titled(ui, '1. The plugin menu')).toBeTruthy()
  expect(drawn).toMatch(/^You disabled something\.$/m)
  expect(await titled(ui, '2. A short session')).toBeTruthy()
  expect(drawn).toMatch(/^Turns slow as it grows\.$/m)
  expect(await titled(ui, '3')).toBeTruthy()
  expect(drawn).toMatch(/^Server load\.$/m)
  expect(drawn).toMatch(/^Open the plugin menu to check\.$/m)
  await ui.unmount()
})

const ASKS_AFTER = `What do you want made fast? The \`show\` call felt quick, so I need a pointer.

1. **\`stainedglass\` render latency**: the show call itself [my guess]
2. **\`stainedglass\` load time**: plugin startup
3. **\`mytool\`**: something in the TUI

Which is it, and roughly how slow is it now?`

test('numbered options followed by a closing question draw as one decision box titled with that question', async ($, on) => {
  const ui = await mount($, on, ASKS_AFTER)
  const drawn = await texts(ui)
  expect(await titled(ui, 'Which is it, and roughly how slow is it now?')).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^ [123]\./ })).toBeFalsy()
  expect(drawn).toContain('[3] mytool: something in the TUI')
  expect(drawn).toMatch(/^What do you want made fast\? .*pointer\.$/m)
  expect(await borders(ui)).toContain('magenta')
  await ui.unmount()
})

test('inline code in a box title renders as code, not literal backticks', async ($, on) => {
  const ui = await mount($, on, 'Causes:\n\n1. **`stainedglass` render latency** the call\n2. **Load** startup')
  const drawn = await texts(ui)
  expect(await titled(ui, '1. stainedglass render latency')).toBeTruthy()
  expect(drawn).not.toContain('`')
  expect(await seg(ui, /^stainedglass$/)).toContainEqual(expect.objectContaining({ color: 'magentaBright' }))
  await ui.unmount()
})

test('each bare paragraph draws in its own native single-border box at the full box width, no drawn edges', async ($, on) => {
  const ui = await mount($, on, 'First paragraph.\n\nSecond paragraph.')
  const drawn = await texts(ui)
  const boxes = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle)
  expect(boxes.map((b: any) => [b.props.borderStyle, b.props.borderColor, b.props.width, b.props.paddingX])).toEqual([
    ['single', 'gray', 96, 1],
    ['single', 'gray', 96, 1],
  ])
  expect(drawn).toMatch(/^First paragraph\.$/m)
  expect(drawn).toMatch(/^Second paragraph\.$/m)
  expect(drawn).not.toMatch(/[┌│└]/)
  await ui.unmount()
})

test('a fenced block indented under a plain item stays code inside that list box', async ($, on) => {
  const ui = await mount($, on, 'Then:\n\n1. Add the file:\n   ```json\n   { "name": "x" }\n   ```\n2. Restart')
  const drawn = await texts(ui)
  expect(await titled(ui, '1')).toBeFalsy()
  expect(drawn).not.toContain('```')
  expect(drawn).toContain('{ "name": "x" }')
  expect(await borders(ui)).toEqual(['gray'])
  await ui.unmount()
})

test('a numbered list inside a labelled section stays in that one box', async ($, on) => {
  const ui = await mount($, on, '**Steps**\n1. Add the file\n2. Restart')
  const drawn = await texts(ui)
  expect(await titled(ui, 'Steps')).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^ 1/ })).toBeFalsy()
  await ui.unmount()
})

const SECTIONED = `0.6.0 is built.

**What changed**
\`\`\`diff
+ a gauge on the strip
\`\`\`

---

**Not verified live**
The verdict line needs a real test run.

> Running it twice duplicates the records.

## Cleanup
The old pane closes itself.`

test('labelled chunks, headers and quotes draw as boxes titled in their top border, coloured by tone', async ($, on) => {
  const ui = await mount($, on, SECTIONED)
  const drawn = await texts(ui)
  expect(await titled(ui, 'What changed')).toEqual(expect.objectContaining({ color: 'whiteBright', bold: true }))
  expect(await titled(ui, 'Not verified live')).toEqual(expect.objectContaining({ color: 'yellow' }))
  expect(await titled(ui, 'Important')).toEqual(expect.objectContaining({ color: 'red' }))
  expect(await titled(ui, 'Cleanup')).toBeTruthy()
  const overlays = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.position === 'absolute')
  expect(overlays.map((b: any) => [b.props.top, b.props.left])).toEqual([[0, 1], [0, 1], [0, 1], [0, 1]])
  expect(await borders(ui)).toEqual(['gray', 'gray', 'yellow', 'red', 'gray'])
  expect(drawn).toMatch(/^The verdict line needs a real test run\.$/m)
  expect(drawn).not.toMatch(/[┌│└]/)
  expect(drawn).not.toContain('---')
  expect(drawn).not.toContain('**')
  const added = (await ui.findAll({ type: 'Text', text: /^\+ a gauge on the strip +$/ })).find((t: any) => t.props?.backgroundColor)
  expect(added?.props).toEqual(expect.objectContaining({ backgroundColor: '#1f6b35', color: 'whiteBright' }))
  expect([...added.text].length).toBe(92)
  await ui.unmount()
})

test('a fenced block on its own draws in a frame titled with its language, highlighted', async ($, on) => {
  const ui = await mount($, on, 'Run this:\n\n```bash\ngit status --short\n```\n\nThen check.')
  const drawn = await texts(ui)
  expect(drawn).toContain('Run this:')
  expect(await titled(ui, 'bash')).toEqual(expect.objectContaining({ color: 'blackBright' }))
  expect(drawn).toContain('Then check.')
  expect(await seg(ui, /^--short$/)).toContainEqual(expect.objectContaining({ color: 'cyanBright' }))
  expect(await seg(ui, /^git$/)).toContainEqual(expect.objectContaining({ color: 'whiteBright', bold: true }))
  await ui.unmount()
})

const LONG_REPLY = `The probe says stainedglass's own code isn't what makes streaming slow. Its times are cumulative, so per draw they are tiny:

- **Assistant message (\`AM\`):** 29ms over 12 draws, about 2.4ms each, for the markdown parse and the boxes.
- **Strip above the prompt (\`AP\`):** 37ms over 4 draws, about 9ms each, almost all of it the engine's \`next(e)\`.
- **Tool rows (\`TG\`, \`TU\`, \`TR\`):** small.

Two things the probe can't see:

1. **Tree size.** Each reply is about 323 nodes: \`paint\` makes a \`Text\` for every piece and a \`Box\` for every block.
2. **Fewer redraws.** Only 12 draws suggests the engine calls the async hook less often than it redraws plain text.

Start one session with \`CLAUDE_CODE_PLUGIN_DIRS=\` and compare how the same long reply streams in.`

test('a long styled reply stays a small tree: unstyled text is bare, one-style lines carry the style on the line, every box uses the native border', async ($, on) => {
  const ui = await mount($, on, LONG_REPLY)
  const nodes = (await ui.findAll({ type: 'Text' })).length + (await ui.findAll({ type: 'Box' })).length
  expect(nodes).toBeLessThan(70)
  expect(await texts(ui)).toMatch(/^Each reply is about 323 nodes: paint makes a Text for every piece and a Box for every block\.$/m)
  await ui.unmount()
})

test('drawing replies never writes to the status line', async ($, on) => {
  const statuses: unknown[] = []
  on('ui.status', ($: any, e: any) => {
    statuses.push(e)
    return { value: undefined }
  })
  clock(on)
  engineDraws(on)
  for (let i = 0; i < 3; i++) {
    const ui = await $.ui.mount(reply(LONG_REPLY) as never)
    await ui.unmount()
  }
  expect(statuses).toEqual([])
})

test('a numbered item that is only its bold lead draws the lead as its body, not an empty titled box', async ($, on) => {
  const ui = await mount($, on, 'Done:\n\n1. **Version is `0.11.0`.**\n2. **Icon:** a tile')
  const drawn = await texts(ui)
  expect(drawn).toMatch(/^1\. Version is 0\.11\.0$/m)
  expect(await titled(ui, '1. Version is 0.11.0')).toBeFalsy()
  expect(await titled(ui, '2. Icon')).toBeTruthy()
  await ui.unmount()
})

test('a lone short question paragraph gets the magenta question border', async ($, on) => {
  const ui = await mount($, on, 'The move is a separate step.\n\nWhich ticket should the branch use?')
  expect(await borders(ui)).toEqual(['gray', 'magenta'])
  await ui.unmount()
})

test('a list under its own label stays in that section; a question after it is its own box, not that list as options', async ($, on) => {
  const ui = await mount($, on, 'Done.\n\n**Next steps**\n\n1. Check the colours.\n2. Pick a branch.\n\nWhich repo should it go to?')
  const drawn = await texts(ui)
  expect(await titled(ui, 'Next steps')).toEqual(expect.objectContaining({ color: 'cyan' }))
  expect(drawn).not.toContain('[1]')
  expect(drawn).toMatch(/^Which repo should it go to\?$/m)
  expect(await borders(ui)).toEqual(['gray', 'cyan', 'magenta'])
  await ui.unmount()
})

test('a plain numbered list stays in one box, titled and coloured by its intro line', async ($, on) => {
  const ui = await mount($, on, 'Plan:\n1. Make a fresh folder.\n2. Remove the references.\n3. Add a license.')
  const drawn = await texts(ui)
  expect(await titled(ui, 'Plan')).toEqual(expect.objectContaining({ color: 'cyan' }))
  expect(await borders(ui)).toEqual(['cyan'])
  expect(drawn).toMatch(/1\. Make a fresh folder\./)
  expect(drawn).toMatch(/3\. Add a license\./)
  expect(await titled(ui, '1')).toBeFalsy()
  await ui.unmount()
})

test('a plain numbered list with no intro is one untitled box', async ($, on) => {
  const ui = await mount($, on, 'Some context first.\n\n1. One thing\n2. Another thing')
  expect(await borders(ui)).toEqual(['gray', 'gray'])
  expect(await titled(ui, '1')).toBeFalsy()
  expect(await texts(ui)).toMatch(/2\. Another thing/)
  await ui.unmount()
})
