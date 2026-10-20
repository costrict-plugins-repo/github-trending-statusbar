---
name: config
description: >
  Configure the status bar layout and widgets interactively, or apply a preset.
  Use when: customizing which widgets appear, changing the layout mode, applying presets,
  toggling individual widgets. Triggers: "customize statusbar", "statusbar config",
  "change layout", "enable widgets", "statusbar developer", "statusbar minimal",
  "statusbar full", "statusbar preset".
---

# Statusbar — Interactive Configuration

You are helping the user configure their statusbar plugin. You will present a visual, interactive configuration experience using Claude Code's native selection UI, then save their choices.

## Check for preset argument

If the user provided a preset name as an argument (e.g., `/statusbar:config developer`), skip the interactive UI and jump directly to **Apply Preset** below.

Available presets and their widget mappings:

| Preset | Layout | Enabled widgets |
|--------|--------|-----------------|
| `minimal` | compact | compact-warn, model, effort, context |
| `default` | compact | compact-warn, model, effort, context, cost, duration, git |
| `developer` | standard | compact-warn, model, effort, context, cost, duration, git, lines, rate-5h, rate-7d, tokens, cache, latency, context-size |
| `full` | mascot | ALL widgets enabled |
| `tracker` | standard | compact-warn, model, effort, context, cost, duration, messages, total-tokens, tools-used |

## Step 1: Read current configuration

Read the current config file to know the user's existing setup:
- Try `${CLAUDE_PLUGIN_DATA}/statusbar-config.json`
- Then try `${CLAUDE_PLUGIN_ROOT}/defaults/statusbar-config.json`
- Fall back to: layout=compact, widgets=compact-warn+model+context+cost+duration+git

Note the current layout and which widgets are enabled/disabled. You MUST use this to mark current state in the UI (see Step 2).

## Step 2: Present the interactive configuration UI

Use a SINGLE **AskUserQuestion** call with exactly **4 questions** (shown as navigable tabs). The user browses tabs with arrow keys, selects options with enter/space.

### IMPORTANT: Show current state in options

The AskUserQuestion tool does not support pre-selecting options. To show the user what's currently enabled, you MUST dynamically modify the options based on the config you read in Step 1:

**For multi-select questions (Q2, Q3, Q4):**
- Append ` [ON]` to the **label** of each option whose widgets are currently enabled in the config
- Append ` [OFF]` to the **label** of each option whose widgets are currently disabled
- Add a note in the **question** text: "Options marked [ON] are currently enabled."

Example: if model, context, cost, and duration are enabled but git is disabled:
- `"Model & Context [ON]"`
- `"Cost & Duration [ON]"`
- `"Git Branch [OFF]"`
- `"Compact Alert [ON]"`

For a group like "Lines & Tokens" that maps to multiple widgets (`lines` + `tokens`), mark it [ON] if ANY of its widgets are enabled, [OFF] if ALL are disabled.

**For the Preset question (Q1):**
- Check if the current config matches any preset exactly. If so, add ` (current)` to that preset's label.
- If no preset matches, the user has a custom config — add to the question text: "Your current config is custom (doesn't match a preset)."

### Question 1 — "Preset" (single-select WITH previews)

This question lets the user pick a preset theme. Each option has a **preview** showing exactly what the status bar will look like. The user arrows through options and sees the preview update on the right side.

```
question: "Start from a preset? Pick one to see a preview, or select Other to build your own."
header: "Preset"
multiSelect: false
options:
  - label: "Minimal"
    description: "Just the essentials — model name and context bar (1 line)"
    preview: |
      ╭─ Minimal (compact, 1 line) ────────────────╮
      │                                             │
      │  Opus 4.6 │ high │ ████░░░░ 42%            │
      │                                             │
      ╰─────────────────────────────────────────────╯
      Widgets: model, effort, context bar
      Layout: compact (single line)

  - label: "Default (Recommended)"
    description: "Model, context, cost, duration, and git branch (1 line)"
    preview: |
      ╭─ Default (compact, 1 line) ────────────────────╮
      │                                                │
      │  Opus 4.6 │ high │ ████░░░░ 42% │ main* │ $1  │
      │                                                │
      ╰────────────────────────────────────────────────╯
      Widgets: model, effort, context, cost, duration, git
      Layout: compact (single line)

  - label: "Developer"
    description: "All metrics a power user needs — rate limits, tokens, cache (2 lines)"
    preview: |
      ╭─ Developer (standard, 2 lines) ─────────────────╮
      │                                                  │
      │  Opus 4.6 │ high │ ████░░░░ 42% │ $1.23 │ main* │
      │  +156 -23 │ 5h:34% │ 7d:12% │ 84k/21k          │
      │                                                  │
      ╰──────────────────────────────────────────────────╯
      Widgets: model, effort, context, cost, duration, git,
      lines, rate limits, tokens, cache, latency
      Layout: standard (2 lines)

  - label: "Full + Mascot"
    description: "Everything enabled with pixel art alien (3 lines)"
    preview: |
      ╭─ Full + Mascot (3 lines) ─────────────────────╮
      │                                                │
      │   ▐▛███▜▌  Opus 4.6 │ high │ ████░░░░ 42%    │
      │  ▝▜█████▛▘ main* │ $1.23 │ 14m 22s           │
      │    ▘▘ ▝▝  +42 -7 │ 5h:34% │ cache:67%        │
      │                                                │
      ╰────────────────────────────────────────────────╯
      Widgets: ALL widgets enabled
      Layout: mascot (3 lines with pixel art)
```

### Question 2 — "Core" (multi-select)

Core widgets that most users want. The user checks/unchecks each.

```
question: "Which core widgets do you want? (select all that apply)"
header: "Core"
multiSelect: true
options:
  - label: "Model & Context"
    description: "Model name, effort level, and visual context bar (e.g., Opus 4.6 │ high │ ████░░░░ 42%)"
  - label: "Cost & Duration"
    description: "Session cost + elapsed time (e.g., $1.23 │ 12m 34s) — color-coded by spend"
  - label: "Git Branch"
    description: "Current branch + dirty indicator (e.g., main*) — cyan with red * for uncommitted changes"
  - label: "Compact Alert"
    description: "Shows ⚠ COMPACT in red when context exceeds 200k tokens and auto-compaction is imminent"
```

### Question 3 — "Dev" (multi-select)

Developer-focused metrics.

```
question: "Which developer widgets do you want? (select all that apply)"
header: "Dev"
multiSelect: true
options:
  - label: "Lines & Tokens"
    description: "Code lines changed + token counts (e.g., +156 -23 │ 84k/21k) — green/red for add/remove"
  - label: "Rate Limits"
    description: "5-hour and 7-day rate limit usage (e.g., 5h:34% │ 7d:12%) — color-coded green→red"
  - label: "Cache & Latency"
    description: "Cache hit rate + API response time (e.g., cache:67% │ api:18.5s)"
  - label: "Size & Session"
    description: "Context window size + session ID (e.g., 1M │ a1b2c3)"
```

### Question 4 — "Extras" (multi-select)

Tracking, niche widgets, and the mascot.

```
question: "Any extras? (select all that apply)"
header: "Extras"
multiSelect: true
options:
  - label: "Tracking"
    description: "Message counts, tool calls, total tokens (e.g., ✉ 12/11 │ ⚒ 47 │ Σ 84kin 21kout)"
  - label: "Vim & Agent"
    description: "Vim mode, agent name, output style (e.g., NORMAL │ planner │ concise)"
  - label: "Worktree & MCP"
    description: "Active worktree name + MCP server count (e.g., wt:feature-x │ MCP:3)"
  - label: "Mascot"
    description: "Pixel art alien — forces 3-line mascot layout with Claude's orange Clawd character"
```

## Step 3: Process the user's selections

### Mapping options to widget IDs

**Question 2 (Core) mappings:**
| Option | Widget IDs |
|--------|-----------|
| "Model & Context" | `model`, `effort`, `context` |
| "Cost & Duration" | `cost`, `duration` |
| "Git Branch" | `git` |
| "Compact Alert" | `compact-warn` |

**Question 3 (Dev) mappings:**
| Option | Widget IDs |
|--------|-----------|
| "Lines & Tokens" | `lines`, `tokens` |
| "Rate Limits" | `rate-5h`, `rate-7d` |
| "Cache & Latency" | `cache`, `latency` |
| "Size & Session" | `context-size`, `session` |

**Question 4 (Extras) mappings:**
| Option | Widget IDs |
|--------|-----------|
| "Tracking" | `messages`, `total-tokens`, `tools-used` |
| "Vim & Agent" | `vim`, `agent`, `style` |
| "Worktree & MCP" | `worktree`, `mcp` |
| "Mascot" | `mascot` |

### Merge logic

**Key principle: selections REPLACE the category, non-interaction PRESERVES current config.**

When processing multi-select answers (Q2, Q3, Q4), ignore the `[ON]`/`[OFF]` suffixes in labels — they were only visual indicators. Match by the base label text (e.g., "Model & Context" regardless of whether it said "[ON]" or "[OFF]").

1. **If a preset was selected in Q1** (not "Other"):
   - Start with that preset's layout and widgets as the baseline
   - If any options were selected in Q2, Q3, or Q4, those selections **override** the preset for that category
   - If a multi-select question has NO selections at all, use the preset's defaults for that category

2. **If "Other" was selected in Q1** (or user typed custom text):
   - **Start from the CURRENT config** (what you read in Step 1) as the baseline
   - For each multi-select question (Q2, Q3, Q4):
     - If the user selected any options → enable those widgets, disable the rest in that category
     - If the user made no selections → **keep the current config** for that category (do NOT disable everything)
   - If they typed a preset name in the "Other" field, apply that preset instead
   - If they typed a layout name ("compact", "standard", "mascot"), change the layout but preserve widgets

3. **`compact-warn` defaults to enabled** in all presets, but the user can disable it by not selecting "Compact Alert" in the Core tab (when they do select other Core options)

4. **If `mascot` is enabled**, force the layout to `mascot`

5. **Layout determination:**
   - Minimal/Default preset → compact
   - Developer/Tracker preset → standard
   - Full preset or mascot widget selected → mascot
   - If user only answered Q2-Q4 (no preset), keep the current layout unless widget count suggests otherwise:
     - mascot widget selected → mascot
     - Otherwise preserve current layout

## Step 4: Write the configuration

Build the complete JSON config with ALL widget IDs (enabled or disabled):

```json
{
  "layout": "<compact|standard|mascot>",
  "widgets": {
    "compact-warn": true,
    "model": <true|false>,
    "effort": <true|false>,
    "context": <true|false>,
    "cost": <true|false>,
    "duration": <true|false>,
    "git": <true|false>,
    "session": <true|false>,
    "lines": <true|false>,
    "rate-5h": <true|false>,
    "rate-7d": <true|false>,
    "tokens": <true|false>,
    "cache": <true|false>,
    "context-size": <true|false>,
    "latency": <true|false>,
    "messages": <true|false>,
    "total-tokens": <true|false>,
    "tools-used": <true|false>,
    "vim": <true|false>,
    "mcp": <true|false>,
    "worktree": <true|false>,
    "agent": <true|false>,
    "style": <true|false>,
    "mascot": <true|false>
  },
  "contextBarWidth": 8,
  "separator": " │ "
}
```

Preserve `contextBarWidth` and `separator` from the existing config if they were customized.

Write to `${CLAUDE_PLUGIN_DATA}/statusbar-config.json`. If that variable is not available, write to the project root `statusbar-config.json`.

## Step 5: Show preview and confirm

After saving, show the user a preview of their configured status bar. Build a text mockup showing only their enabled widgets with example data:

**Widget example values for preview:**
- model: `Opus 4.6`
- effort: `high`
- context: `████░░░░ 42%`
- cost: `$1.23`
- duration: `12m 34s`
- git: `main*`
- session: `a1b2c3`
- lines: `+156 -23`
- rate-5h: `5h:34%`
- rate-7d: `7d:12%`
- tokens: `84k/21k`
- cache: `cache:67%`
- context-size: `1M`
- latency: `api:18.5s`
- messages: `✉ 12/11`
- total-tokens: `Σ 84kin 21kout`
- tools-used: `⚒ 47`
- vim: `NORMAL`
- agent: `planner`
- style: `concise`
- worktree: `wt:feature-x`
- mcp: `MCP:3`

Join enabled widgets with ` │ ` separator. For standard layout, split across 2 lines. For mascot, show the mascot art on the left.

Tell the user:
- Configuration saved
- Changes take effect on the **next Claude response** (status bar auto-refreshes)
- Run `/statusbar:config` again anytime to reconfigure
- Apply presets directly: `/statusbar:config developer`
