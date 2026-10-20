# Claude Code statusbar

A customizable status bar plugin for [Claude Code](https://claude.ai/code) that displays real-time session metrics at the bottom of your terminal.

**20+ widgets** | **3 layouts** | **pixel art mascot** | **zero dependencies**

```
Opus 4.6 │ effort:high │ ████░░░░ 42% │ main* │ $1.23 │ 12m 34s
```

```
 ▐▛███▜▌  Opus 4.6 │ effort:high │ ████░░░░ 72%
▝▜█████▛▘ main* │ $1.23 │ 14m 22s
  ▘▘ ▝▝  5h:34% │ +42 -7 │ cache:67%
```

### Screenshot
<img width="730" height="172" alt="image" src="https://github.com/user-attachments/assets/2558da3e-3d41-4bcd-a00a-f424cfdcb636" />


## Installation

```
/plugin marketplace add SYM1000/claude-statusbar
/plugin install statusbar
/statusbar:setup
```

Restart Claude Code after setup. The status bar will appear at the bottom of every session.

## Configuration

Customize interactively:
```
/statusbar:config
```

Or apply a preset directly:
```
/statusbar:config developer
```

### Presets

| Preset | Layout | Description |
|--------|--------|-------------|
| `minimal` | compact | Model + context bar |
| `default` | compact | Model, context, cost, duration, git |
| `developer` | standard | All developer metrics (2 lines) |
| `full` | mascot | Everything + pixel art mascot |
| `tracker` | standard | Message & token tracking focus |

## Layouts

### Compact (1 line)
```
Opus 4.6 │ effort:high │ ████░░░░ 42% │ main* │ $1.23 │ 12m 34s
```

### Standard (2 lines)
```
Opus 4.6 │ effort:high │ ████████░░ 72% │ main* │ +42 -7
$1.23 │ 14m 22s │ 5h:34% │ 7d:12% │ cache:67%
```

### Mascot (3 lines)
```
 ▐▛███▜▌  Opus 4.6 │ effort:high │ ████░░░░ 72%
▝▜█████▛▘ main* │ $1.23 │ 14m 22s
  ▘▘ ▝▝  5h:34% │ +42 -7 │ cache:67%
```

The mascot is the Claude Code alien ("Clawd") rendered in Claude's signature orange.

## Widget Catalog

### Core (enabled by default)
| Widget | Shows | Example |
|--------|-------|---------|
| `model` | Active model | `Opus 4.6` |
| `effort` | Thinking effort | `effort:high` |
| `context` | Usage bar + % | `████░░░░ 42%` |
| `cost` | Session cost | `$1.23` |
| `duration` | Session time | `12m 34s` |
| `git` | Branch + dirty | `main*` |

### Developer
| Widget | Shows | Example |
|--------|-------|---------|
| `lines` | Code changes | `+156 -23` |
| `rate-5h` | 5h rate limit | `5h:34%` |
| `rate-7d` | 7d rate limit | `7d:12%` |
| `tokens` | Token counts | `84k/21k` |
| `cache` | Cache hit rate | `cache:67%` |
| `context-size` | Window size | `1M` |
| `latency` | API time | `api:18.5s` |

### Tracking
| Widget | Shows | Example |
|--------|-------|---------|
| `messages` | Message count | `✉ 12/11` |
| `total-tokens` | Cumulative | `Σ 84kin 21kout` |
| `tools-used` | Tool calls | `⚒ 47` |

### Extras
| Widget | Shows | Example |
|--------|-------|---------|
| `session` | Session ID | `a1b2c3` |
| `vim` | Vim mode | `NORMAL` |
| `mcp` | MCP servers | `MCP:3` |
| `worktree` | Worktree | `wt:feature-x` |
| `agent` | Agent name | `planner` |
| `style` | Output style | `concise` |
| `mascot` | Pixel art | Clawd alien |

### Alert
| Widget | Shows | Example |
|--------|-------|---------|
| `compact-warn` | Auto-compact warning | `⚠ COMPACT` |

## Color System

All colors use RGB true color for maximum fidelity:

- **Context/rate limits**: Green (<55%) → Yellow (<70%) → Orange (<85%) → Red (85%+)
- **Cost**: Claude orange
- **Effort**: Lavender
- **Git**: Cyan branch, red dirty indicator
- **Mascot**: Claude's signature orange (`rgb(215, 119, 87)`)

## Dev Mode

Test locally without installing as a plugin:

```bash
claude --plugin-dir /path/to/statusbar
```

Or test the renderer directly:

```bash
echo '{"model":{"display_name":"Opus 4.6"},"context_window":{"used_percentage":42}}' | node scripts/statusline.js
```

## Uninstall

```
/statusbar:setup uninstall
```

Then restart Claude Code.

## Architecture

- Pure Node.js — zero external dependencies
- File-based caching for git and terminal width (3-5s TTL)
- All data from stdin JSON, local git, or filesystem — no network calls
- Target execution time: <80ms with cache hits

## License

MIT
