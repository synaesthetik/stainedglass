# stainedglass

Coloured panes, clean dividers, one rich picture, right in the terminal.

stainedglass redraws Claude Code's replies so they read at a glance. Every chunk sits in its own pane. The border colour says what kind of message it is: a question, a plan, a warning, danger or done. And Claude can draw tables, gauges, step strips and timelines inline, without leaving the terminal for an HTML page. It uses the terminal's own 16 colours, plus two fixed diff bands.

## Install

**Requirements.** Tested on Claude Code 2.1.329. Plugins that run their own code are a recent feature, so update Claude Code first if the install fails. It's built and tested in the terminal; other surfaces such as the desktop app may draw it differently.

At a Claude Code prompt:

```
/plugin install stainedglass --marketplace synaesthetik/stainedglass
```

Or from a shell:

```bash
claude plugin install stainedglass --marketplace synaesthetik/stainedglass
```

What to expect:
1. `Add marketplace?` naming `github:synaesthetik/stainedglass`: answer `y`.
2. The plugin's details and a scope: press Enter for the user scope, which loads it in every session.
3. `Installed stainedglass. Plugin is now active.` It takes effect in the current session straight away, with no restart.

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `synaesthetik/stainedglass`, then **Add plugin**.

### Update or remove

```bash
claude plugin update stainedglass
claude plugin uninstall stainedglass
```

`claude plugin disable stainedglass` turns it off without removing it, and `claude plugin enable stainedglass` turns it back on.

## What it changes

**Replies.** stainedglass draws every reply itself, so text wraps to the box width and every box is the same width. Markdown comes out coloured: inline code, paths, bold, italics, links, list markers, headers and tables. A summary row is left to Claude Code.

**Section boxes.** A bold label at the start of a paragraph (`**What changed**`), a `#` header or a blockquote opens a framed box whose title sits in its top border. The frame colour comes from the title:
- red for danger: data loss, irreversible or destructive steps, failures, errors, and blockquotes (titled `Important`)
- yellow for warnings: risk, caveats, unverified, blocked or deferred items
- magenta for questions and decisions, including a title ending in `?` and a lone short question paragraph
- cyan for plans: plan, steps, next, approach, proposal
- green for done or verified results
- grey otherwise, with a bright white title

The first match in that order wins. A numbered item takes its colour from its bold lead, so `1. **Risk:** …` is yellow.

**List items.** Outside a labelled section, each numbered item draws in its own box titled with its number, plus its bold lead if it starts with one (`┌ 1. The plugin menu ┐`). Indented lines and fenced blocks under an item stay in its box. A list inside a labelled section stays in that section's box, and a closing question with options still becomes the decision box, whether the question sits just above the options or within the two lines after them. Inline code and bold in a box title render styled, not as raw backticks.

**Paragraphs.** Every paragraph outside a labelled section draws in its own untitled grey box, so nothing in a reply renders bare.

`---` rules are dropped because the boxes already separate the chunks.

**Palette.** Every ANSI colour but plain blue and black has a job, so your terminal theme decides how each looks in light or dark mode:
- `black` unused: a black background behind inline code was too heavy
- `blackBright`: borders, comments, operators
- `red` failures · `redBright` shell variables
- `green` success · `greenBright` strings
- `yellow` caveats · `yellowBright` numbers
- `blue` unused, too dark on most themes · `blueBright` paths, links, ranges, constants and types
- `magenta` keywords and literals · `magentaBright` inline code
- `cyan` keys, list markers, hunks · `cyanBright` flags
- `white` bold text · `whiteBright` headers, commands and tool names

Purple carries the reply accents: numbers in prose are `magenta`, a bold lead-in such as `**Widths:**` is bold `magentaBright`, and question boxes have a `magenta` border.

**Code blocks.** stainedglass draws fenced blocks itself and highlights them in the same palette, always outside any box and at the full reply width, so a command copies without border characters. A rule sits on its own row above the code, titled with the language, and a plain rule closes it, so the code stands apart without anything on its lines. Code inside a section splits the box around it: the text before stays in the titled box, the code follows unboxed between rules in the section's colour (the opening rule carries the section title when the code comes first), and any text after continues in a box of the same colour.
- `diff`: `+` and `-` lines in bright white on deep green (`#1f6b35`) and deep red (`#8b1e2a`) bands, filled to the box edge; `@@` cyan
- `bash`/`sh`/`zsh`/`console`: the command bright white, flags bright cyan, strings bright green, `$VARS` bright red, pipes and comments grey
- `json`/`yaml`: keys cyan, strings bright green, numbers bright yellow, literals magenta
- `ruby`, `python`, `ts`/`js`, `go`, `hcl`, `rust` and similar: keywords magenta, strings bright green, numbers bright yellow, constants bright blue, comments grey italic
- `log`: error lines red, warnings yellow, timestamps grey

**File rows.** Read, Edit and Write rows are one line: a ✓/●/✗ glyph, the tool name in bright white, the path in bright blue with your home folder as `~`, then `+N −M` for edits or the line range for reads. An Edit or Write result shows its hunks with grey line numbers, added and removed lines on the green and red diff bands, and unchanged lines highlighted by the file's extension. A new file shows its first 12 lines. A Read result is one line: `60 of 400 lines`. Any other failed tool shows a red `Error` box.

**Decision box.** When a reply ends on a question and a numbered list, both move into a grey box under the text:
- the question is the box's title (`┌ What should I build next? ┐`), or a bold first line when it is too long for the border
- options get `[1] [2] [3]` keys
- the recommended option is green
- a tradeoff written after a dash (`label — tradeoff`) goes on its own dim line under the label

Short options share a row, and long ones wrap inside the border.

**Links.** A URL stays in its sentence, drawn as a link, and is repeated after that box on its own row between rules titled `link`, in the box's colour, so it copies without border characters. A markdown link keeps its text in the sentence, and its URL gets the row. Trailing punctuation is left out, and a URL that appears twice gets one row.

**Bash rows.** Each command is drawn in the `CommandPreview` idiom: `Command:` and its description, then the command, verbatim and uncoloured so it stays copy-pasteable, then one outcome line:
- `● running` (cyan)
- `✓ done` (green)
- `✗ failed` (red)
- `▲ interrupted` (yellow)
- `◆ in background` (dim)

**Output box.** Bash output sits in a grey `┌ Output ┐` box showing its last 10 lines and `n earlier lines · ctrl+o`. The border turns red when the command failed. A test run (bun, `claude plugin test`, rspec, jest) gets a verdict line above it, such as `✓ 20 pass · 0 fail`, with a 12-cell bar whose green and red split shows the pass and fail share.

**Folded reads and searches.** These collapse to one dim line, such as `✓ read 2 files · searched 1 pattern`.

**Phase strip.** While any task is open, a `✓✓●○○  ██████░░░░░░  3/5 Writing tests` strip (the gauge fills as tasks complete) sits above the prompt. One row per task follows:
- done tasks are green and dimmed
- the task in progress is cyan, in its active wording
- pending tasks are plain
- a task waiting on another shows `blocked by #n`

The strip follows `TodoWrite`, `TaskCreate`, `TaskUpdate` and `TaskList`. Those task calls collapse to one line in the transcript.

**`show` tool.** Claude can draw displays inline with `mcp__stainedglass__show`: banners, titled boxes, key/value panels, unicode tables whose cells can be gauges, step strips, option boxes and range timelines. Strings take inline styles such as `{ok:pass}`, `{bad:3 errors}`, `{id:name}` and `{info:dim note}`.

ctrl+o always shows Claude Code's own rows. stainedglass leaves the permission dialog, the prompt and the status bar alone.

## Development

Clone it and point Claude Code at the checkout from your shell profile, then start a new session:

```bash
git clone https://github.com/synaesthetik/stainedglass ~/code/stainedglass
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/code/stainedglass"
```

For one session only, run `claude --plugin-dir ~/code/stainedglass` instead. Edits reload when the turn that made them ends.

Run the tests and checks from the checkout:

```bash
claude plugin test .
claude plugin validate .
```
