import { expect, test } from 'claude-code/testing'

import { splitSections, toneOf } from './sections'

test('a title picks its border by the kind of message, the strongest signal first', async () => {
  const cases: [string, string][] = [
    ['Data loss if rerun', 'bad'],
    ['Irreversible step', 'bad'],
    ['What failed', 'bad'],
    ['Warning', 'warn'],
    ['Heads up', 'warn'],
    ['Not verified live', 'warn'],
    ['Risk', 'warn'],
    ['Open question', 'ask'],
    ['Which branch?', 'ask'],
    ['Decision', 'ask'],
    ['Plan', 'plan'],
    ['Next steps', 'plan'],
    ['Approach', 'plan'],
    ['Done', 'ok'],
    ['Verified', 'ok'],
    ['Root cause', 'find'],
    ['Findings', 'find'],
    ['Evidence', 'find'],
    ['Why it hangs', 'find'],
    ['Diagnosis', 'find'],
    ['Visualizations check', 'find'],
    ['Audit', 'find'],
    ['Security audit results', 'find'],
    ['Checks passed', 'ok'],
    ['What changed', 'change'],
    ['Changes', 'change'],
    ['Diff', 'change'],
    ['Cause of failure', 'bad'],
    ['Fixed: what changed', 'ok'],
    ['Cleanup', 'border'],
  ]
  expect(cases.map(([title]) => [title, toneOf(title)])).toEqual(cases)
})

test('a numbered item takes its tone from its bold lead', async () => {
  const sections = splitSections('Notes:\n\n1. **Risk:** it may clip\n2. **Plan:** move it\n3. Plain item')
  expect(sections.filter(s => s.title).map(s => [s.title, s.tone])).toEqual([
    ['1. Risk', 'warn'],
    ['2. Plan', 'plan'],
    ['3', 'border'],
  ])
})

test('a blockquote is a red Important callout', async () => {
  const sections = splitSections('> Running it twice duplicates the records.')
  expect(sections.map(s => [s.title, s.tone])).toEqual([['Important', 'bad']])
})
