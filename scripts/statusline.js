#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// =============================================================================
// CLI Argument Parsing & Path Resolution
// =============================================================================

function resolveDataDir() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--data-dir');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
  return path.join(__dirname, '..');
}

const DATA_DIR = resolveDataDir();

// =============================================================================
// ANSI Color System — RGB True Color
// =============================================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }

function heatColor(pct) {
  if (pct < 55) return rgb(100, 200, 100);
  if (pct < 70) return rgb(240, 200, 80);
  if (pct < 85) return rgb(255, 170, 50);
  return rgb(255, 68, 68);
}

function costColor(usd) {
  if (usd < 1) return rgb(100, 200, 100);
  if (usd < 5) return rgb(240, 200, 80);
  if (usd < 10) return rgb(255, 170, 50);
  return rgb(255, 68, 68);
}

const C = {
  model:        rgb(255, 255, 255) + BOLD,
  duration:     rgb(140, 180, 220) + DIM,
  gitBranch:    rgb(100, 210, 210),
  gitDirty:     rgb(255, 100, 100),
  linesAdded:   rgb(100, 200, 100),
  linesRemoved: rgb(255, 100, 100),
  mascotBody:   rgb(215, 119, 87),
  warning:      rgb(255, 68, 68) + BOLD,
};

// =============================================================================
// ANSI Utility
// =============================================================================

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) { return s.replace(ANSI_RE, ''); }
function visLen(s) { return stripAnsi(s).length; }

// =============================================================================
// File-Based Cache (persists across short-lived invocations)
// =============================================================================

let _diskCache = null;

function loadDiskCache() {
  if (_diskCache !== null) return _diskCache;
  try {
    _diskCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '.cache.json'), 'utf-8'));
  } catch {
    _diskCache = {};
  }
  return _diskCache;
}

function saveDiskCache() {
  if (!_diskCache) return;
  try {
    fs.writeFileSync(path.join(DATA_DIR, '.cache.json'), JSON.stringify(_diskCache));
  } catch { /* non-critical */ }
}

function cached(key, ttlMs, fn) {
  const cache = loadDiskCache();
  const now = Date.now();
  if (cache[key] && (now - cache[key].t) < ttlMs) return cache[key].v;
  const value = fn();
  cache[key] = { v: value, t: now };
  return value;
}

// =============================================================================
// Terminal Width Detection
// =============================================================================

function getTerminalWidth() {
  return cached('termWidth', 5000, () => {
    try {
      const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
        encoding: 'utf-8', timeout: 500, stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      if (!tty || tty === '??') return 120;
      const size = execSync(`stty size < /dev/${tty}`, {
        encoding: 'utf-8', timeout: 500, shell: true, stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      const cols = parseInt(size.split(' ')[1], 10);
      return cols > 0 ? cols : 120;
    } catch {
      return 120;
    }
  });
}

// =============================================================================
// Git Operations (cached 3s)
// =============================================================================

function getGitInfo(workDir) {
  return cached('git:' + workDir, 3000, () => {
    try {
      let branch;
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          encoding: 'utf-8', timeout: 1000, cwd: workDir, stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
      } catch {
        // Fallback for repos with no commits yet
        branch = execSync('git symbolic-ref --short HEAD', {
          encoding: 'utf-8', timeout: 1000, cwd: workDir, stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
      }
      let dirty = false;
      try {
        const status = execSync('git status --porcelain -uno', {
          encoding: 'utf-8', timeout: 1000, cwd: workDir, stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        const untracked = execSync('git ls-files --others --exclude-standard', {
          encoding: 'utf-8', timeout: 1000, cwd: workDir, stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        dirty = status.length > 0 || untracked.length > 0;
      } catch { /* assume clean on error */ }
      return { branch, dirty };
    } catch {
      return null;
    }
  });
}

// =============================================================================
// Transcript Parsing (cached 3s)
// =============================================================================

function parseTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  return cached('transcript:' + transcriptPath, 3000, () => {
    try {
      const stats = fs.statSync(transcriptPath);
      if (stats.size > 50 * 1024 * 1024) return null; // skip >50MB
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const lines = content.split('\n');
      let userMessages = 0, assistantMessages = 0, toolCalls = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          const role = entry.role || entry.type;
          if (role === 'human' || role === 'user') userMessages++;
          else if (role === 'assistant') assistantMessages++;
          // Count tool_use blocks within content arrays
          if (Array.isArray(entry.content)) {
            for (const block of entry.content) {
              if (block.type === 'tool_use') toolCalls++;
            }
          }
        } catch { /* skip malformed lines */ }
      }
      return { userMessages, assistantMessages, toolCalls };
    } catch {
      return null;
    }
  });
}

// =============================================================================
// MCP Server Count (cached 5s)
// =============================================================================

function getMcpCount(workDir) {
  if (!workDir) return null;
  return cached('mcp:' + workDir, 5000, () => {
    try {
      const mcpPath = path.join(workDir, '.mcp.json');
      const data = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      const servers = data.mcpServers || data.servers || {};
      const count = Object.keys(servers).length;
      return count > 0 ? count : null;
    } catch {
      return null;
    }
  });
}

// =============================================================================
// Effort Level (read from ~/.claude/settings.json, cached 5s)
// =============================================================================

function getEffortLevel() {
  return cached('effort', 5000, () => {
    try {
      const settingsPath = process.env.CLAUDE_CONFIG_DIR
        ? path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')
        : path.join(os.homedir(), '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return settings.effortLevel || null;
    } catch {
      return null;
    }
  });
}

// =============================================================================
// Formatting Helpers
// =============================================================================

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTokens(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function formatCost(usd) {
  if (usd >= 100) return `$${Math.round(usd)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

function formatContextSize(size) {
  if (size >= 1000000) return `${Math.round(size / 1000000)}M`;
  return `${Math.round(size / 1000)}k`;
}

/** Helper: create a widget result with text + computed visible width */
function w(text) {
  return { text, width: visLen(text) };
}

// =============================================================================
// Widget Definitions
// =============================================================================
// Each widget: { id, priority, defaultEnabled, compute(data, config) → {text, width} | null }

const WIDGET_DEFS = [
  // ─── Tier 0: Alerts ───
  {
    id: 'compact-warn',
    priority: 0,
    defaultEnabled: true,
    compute(data) {
      if (!data.exceeds_200k_tokens) return null;
      return w(`${C.warning}\u26A0 COMPACT${RESET}`);
    }
  },

  // ─── Tier 1: Core ───
  {
    id: 'model',
    priority: 1,
    defaultEnabled: true,
    compute(data) {
      const name = data.model?.display_name || data.model?.id;
      if (!name) return null;
      return w(`${C.model}${name}${RESET}`);
    }
  },
  {
    id: 'effort',
    priority: 2,
    defaultEnabled: true,
    compute() {
      const level = getEffortLevel();
      if (!level) return null;
      return w(`${rgb(180, 160, 220)}effort:${level}${RESET}`);
    }
  },
  {
    id: 'context',
    priority: 3,
    defaultEnabled: true,
    compute(data, config) {
      const pct = data.context_window?.used_percentage;
      if (pct == null) return null;
      const barW = config.contextBarWidth || 8;
      const filled = Math.round((pct / 100) * barW);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
      const color = heatColor(pct);
      return w(`${color}${bar} ${Math.round(pct)}%${RESET}`);
    }
  },
  {
    id: 'cost',
    priority: 4,
    defaultEnabled: true,
    compute(data) {
      const cost = data.cost?.total_cost_usd;
      if (cost == null) return null;
      return w(`${rgb(215, 119, 87)}${formatCost(cost)}${RESET}`);
    }
  },
  {
    id: 'duration',
    priority: 5,
    defaultEnabled: true,
    compute(data) {
      const ms = data.cost?.total_duration_ms;
      const fmt = formatDuration(ms);
      if (!fmt) return null;
      return w(`${C.duration}${fmt}${RESET}`);
    }
  },
  {
    id: 'git',
    priority: 6,
    defaultEnabled: true,
    compute(data) {
      const dir = data.workspace?.current_dir || data.workspace?.project_dir;
      if (!dir) return null;
      const info = getGitInfo(dir);
      if (!info) return null;
      const dirty = info.dirty ? `${C.gitDirty}*${RESET}` : '';
      return w(`${C.gitBranch}${info.branch}${RESET}${dirty}`);
    }
  },
  // ─── Tier 2: Developer ───
  {
    id: 'session',
    priority: 10,
    defaultEnabled: false,
    compute(data) {
      if (!data.session_id) return null;
      return w(`${DIM}${data.session_id.substring(0, 6)}${RESET}`);
    }
  },
  {
    id: 'lines',
    priority: 11,
    defaultEnabled: false,
    compute(data) {
      const added = data.cost?.total_lines_added;
      const removed = data.cost?.total_lines_removed;
      if (added == null && removed == null) return null;
      const a = added || 0;
      const r = removed || 0;
      return w(`${C.linesAdded}+${a}${RESET} ${C.linesRemoved}-${r}${RESET}`);
    }
  },
  {
    id: 'rate-5h',
    priority: 12,
    defaultEnabled: false,
    compute(data) {
      const pct = data.rate_limits?.five_hour?.used_percentage;
      if (pct == null) return null;
      return w(`${heatColor(pct)}5h:${Math.round(pct)}%${RESET}`);
    }
  },
  {
    id: 'rate-7d',
    priority: 13,
    defaultEnabled: false,
    compute(data) {
      const pct = data.rate_limits?.seven_day?.used_percentage;
      if (pct == null) return null;
      return w(`${heatColor(pct)}7d:${Math.round(pct)}%${RESET}`);
    }
  },
  {
    id: 'tokens',
    priority: 14,
    defaultEnabled: false,
    compute(data) {
      const inp = data.context_window?.total_input_tokens;
      const out = data.context_window?.total_output_tokens;
      if (inp == null && out == null) return null;
      return w(`${DIM}${formatTokens(inp)}/${formatTokens(out)}${RESET}`);
    }
  },
  {
    id: 'cache',
    priority: 15,
    defaultEnabled: false,
    compute(data) {
      const u = data.context_window?.current_usage;
      if (!u) return null;
      const cacheRead = u.cache_read_input_tokens || 0;
      const total = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + cacheRead;
      if (total === 0) return null;
      const pct = Math.round((cacheRead / total) * 100);
      return w(`${rgb(100, 200, 100)}cache:${pct}%${RESET}`);
    }
  },
  {
    id: 'context-size',
    priority: 21,
    defaultEnabled: false,
    compute(data) {
      const size = data.context_window?.context_window_size;
      if (!size) return null;
      return w(`${DIM}${formatContextSize(size)}${RESET}`);
    }
  },
  {
    id: 'latency',
    priority: 26,
    defaultEnabled: false,
    compute(data) {
      const ms = data.cost?.total_api_duration_ms;
      if (!ms) return null;
      return w(`${DIM}api:${(ms / 1000).toFixed(1)}s${RESET}`);
    }
  },

  // ─── Tier 3: Tracking ───
  {
    id: 'messages',
    priority: 30,
    defaultEnabled: false,
    compute(data) {
      const info = parseTranscript(data.transcript_path);
      if (!info) return null;
      return w(`${DIM}\u2709 ${info.userMessages}/${info.assistantMessages}${RESET}`);
    }
  },
  {
    id: 'total-tokens',
    priority: 31,
    defaultEnabled: false,
    compute(data) {
      const inp = data.context_window?.total_input_tokens;
      const out = data.context_window?.total_output_tokens;
      if (inp == null && out == null) return null;
      return w(`${DIM}\u03A3 ${formatTokens(inp)}in ${formatTokens(out)}out${RESET}`);
    }
  },
  {
    id: 'tools-used',
    priority: 32,
    defaultEnabled: false,
    compute(data) {
      const info = parseTranscript(data.transcript_path);
      if (!info) return null;
      return w(`${DIM}\u2692 ${info.toolCalls}${RESET}`);
    }
  },

  // ─── Tier 4: Niche ───
  {
    id: 'vim',
    priority: 22,
    defaultEnabled: false,
    compute(data) {
      if (!data.vim?.mode) return null;
      return w(`${BOLD}${data.vim.mode}${RESET}`);
    }
  },
  {
    id: 'mcp',
    priority: 23,
    defaultEnabled: false,
    compute(data) {
      const dir = data.workspace?.current_dir || data.workspace?.project_dir;
      const count = getMcpCount(dir);
      if (!count) return null;
      return w(`${DIM}MCP:${count}${RESET}`);
    }
  },
  {
    id: 'worktree',
    priority: 24,
    defaultEnabled: false,
    compute(data) {
      if (!data.worktree?.name) return null;
      return w(`${DIM}wt:${data.worktree.name}${RESET}`);
    }
  },
  {
    id: 'agent',
    priority: 25,
    defaultEnabled: false,
    compute(data) {
      if (!data.agent?.name) return null;
      return w(`${DIM}${data.agent.name}${RESET}`);
    }
  },
  {
    id: 'style',
    priority: 27,
    defaultEnabled: false,
    compute(data) {
      if (!data.output_style?.name) return null;
      return w(`${DIM}${data.output_style.name}${RESET}`);
    }
  },
  {
    id: 'mascot',
    priority: 99,
    defaultEnabled: false,
    compute() {
      // Sentinel: the layout engine handles mascot rendering specially
      return { text: '__MASCOT__', width: 0 };
    }
  }
];

// Build a lookup map for fast access
const WIDGET_MAP = {};
for (const wd of WIDGET_DEFS) WIDGET_MAP[wd.id] = wd;

// =============================================================================
// Mascot System — Pixel Art with Animation
// =============================================================================

// Static default pose — the forward-facing Clawd.
// All lines are padded to MASCOT_CHAR_WIDTH (10) by the renderer.
const MASCOT_CHAR_WIDTH = 10;

const MASCOT_LINES = [
  ' \u2590\u259B\u2588\u2588\u2588\u259C\u258C ',           //  ▐▛███▜▌
  '\u259D\u259C\u2588\u2588\u2588\u2588\u2588\u259B\u2598', // ▝▜█████▛▘
  '  \u2598\u2598 \u259D\u259D  '                             //   ▘▘ ▝▝
];

function renderMascotLines() {
  const lines = MASCOT_LINES;
  const color = C.mascotBody;
  return lines.map(line => {
    const padded = line.length < MASCOT_CHAR_WIDTH
      ? line + ' '.repeat(MASCOT_CHAR_WIDTH - line.length)
      : line.substring(0, MASCOT_CHAR_WIDTH);
    return `${color}${padded}${RESET}`;
  });
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG = {
  layout: 'compact',
  widgets: {},
  contextBarWidth: 8,
  separator: ' \u2502 '
};

function loadConfig() {
  // Try data dir config first
  const configPath = path.join(DATA_DIR, 'statusbar-config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch { /* fall through */ }

  // Try defaults in the plugin package
  const defaultsPath = path.join(__dirname, '..', 'defaults', 'statusbar-config.json');
  try {
    const raw = fs.readFileSync(defaultsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch { /* fall through */ }

  return DEFAULT_CONFIG;
}

function isWidgetEnabled(widgetDef, config) {
  const explicit = config.widgets?.[widgetDef.id];
  if (explicit !== undefined) return !!explicit;
  return widgetDef.defaultEnabled;
}

// =============================================================================
// Layout Engine
// =============================================================================

/**
 * Compute the maximum usable line width.
 * On wide terminals (>80), the status line gets roughly half the screen.
 */
function maxLineWidth(termCols) {
  return termCols > 80 ? Math.floor(termCols / 2) - 4 : termCols - 4;
}

/**
 * Join an array of widget results into a line, respecting max width.
 * Returns { line: string, overflow: WidgetResult[] } where overflow
 * contains widgets that didn't fit.
 */
function fillLine(widgets, separator, maxW) {
  const sepW = visLen(separator);
  const sepAnsi = `${DIM}${separator}${RESET}`;
  let line = '';
  let usedW = 0;
  const overflow = [];
  let first = true;

  let i = 0;
  for (; i < widgets.length; i++) {
    const wr = widgets[i];
    const needed = first ? wr.width : sepW + wr.width;
    if (usedW + needed > maxW) break; // Stop: remaining widgets go to overflow
    line += first ? wr.text : sepAnsi + wr.text;
    usedW += needed;
    first = false;
  }
  // All widgets from the break point onward are overflow
  for (; i < widgets.length; i++) overflow.push(widgets[i]);
  return { line, overflow };
}

/**
 * Compact layout: single line, drop lowest-priority widgets on overflow.
 */
function layoutCompact(widgetResults, separator, maxW) {
  const { line } = fillLine(widgetResults, separator, maxW);
  return line ? [line] : [];
}

/**
 * Standard layout: two lines, overflow from line 1 to line 2.
 */
function layoutStandard(widgetResults, separator, maxW) {
  const { line: line1, overflow } = fillLine(widgetResults, separator, maxW);
  const lines = [];
  if (line1) lines.push(line1);
  if (overflow.length > 0) {
    const { line: line2 } = fillLine(overflow, separator, maxW);
    if (line2) lines.push(line2);
  }
  return lines;
}

/**
 * Mascot layout: 3 lines, mascot on the left, data widgets on the right.
 */
function layoutMascot(widgetResults, separator, maxW) {
  const mascotLines = renderMascotLines();
  const gap = ' ';
  const mascotW = MASCOT_CHAR_WIDTH + gap.length;
  const dataW = maxW - mascotW;

  if (dataW < 10) {
    // Terminal too narrow for mascot + data; show mascot only
    return mascotLines;
  }

  // Distribute widgets across 3 data lines
  const { line: d1, overflow: ov1 } = fillLine(widgetResults, separator, dataW);
  const { line: d2, overflow: ov2 } = fillLine(ov1, separator, dataW);
  const { line: d3 } = fillLine(ov2, separator, dataW);

  const dataLines = [d1 || '', d2 || '', d3 || ''];

  return mascotLines.map((ml, i) => {
    const dataStr = dataLines[i] || '';
    return dataStr ? `${ml}${gap}${dataStr}` : ml;
  });
}

// =============================================================================
// Line Truncation Safety
// =============================================================================

/**
 * Truncate a styled line to maxW visible characters.
 * Preserves ANSI codes but cuts visible characters at the limit.
 */
function truncateLine(line, maxW) {
  if (visLen(line) <= maxW) return line;
  let result = '';
  let vis = 0;
  let i = 0;
  while (i < line.length && vis < maxW) {
    if (line[i] === '\x1b') {
      // Consume the entire ANSI escape sequence
      const end = line.indexOf('m', i);
      if (end !== -1) {
        result += line.substring(i, end + 1);
        i = end + 1;
      } else {
        break;
      }
    } else {
      result += line[i];
      vis++;
      i++;
    }
  }
  return result + RESET;
}

// =============================================================================
// Main Execution
// =============================================================================

function main() {
  // Read stdin (JSON piped by Claude Code)
  let input = '';
  try {
    input = fs.readFileSync('/dev/stdin', 'utf-8');
  } catch { /* empty input */ }

  let data = {};
  try {
    data = JSON.parse(input || '{}');
  } catch {
    data = {};
  }

  // Load config
  const config = loadConfig();

  // Determine if mascot is enabled — if so, force mascot layout
  const mascotEnabled = isWidgetEnabled(WIDGET_MAP['mascot'], config);
  const layout = mascotEnabled ? 'mascot' : (config.layout || 'compact');

  // Compute terminal width
  const termCols = getTerminalWidth();
  const maxW = maxLineWidth(termCols);

  // Compute all enabled widgets (excluding the mascot sentinel)
  const widgetResults = [];
  const sorted = [...WIDGET_DEFS].sort((a, b) => a.priority - b.priority);
  for (const wd of sorted) {
    if (wd.id === 'mascot') continue; // handled by layout
    if (!isWidgetEnabled(wd, config)) continue;
    const result = wd.compute(data, config);
    if (result) widgetResults.push(result);
  }

  // Apply layout
  const separator = config.separator || ' \u2502 ';
  let outputLines;

  switch (layout) {
    case 'standard':
      outputLines = layoutStandard(widgetResults, separator, maxW);
      break;
    case 'mascot':
      outputLines = layoutMascot(widgetResults, separator, maxW);
      break;
    case 'compact':
    default:
      outputLines = layoutCompact(widgetResults, separator, maxW);
      break;
  }

  // Safety: truncate each line to prevent Claude Code's cli-truncate
  // from dropping subsequent lines
  outputLines = outputLines.map(l => truncateLine(l, maxW));

  // Remove trailing empty lines
  while (outputLines.length > 0 && stripAnsi(outputLines[outputLines.length - 1]).trim() === '') {
    outputLines.pop();
  }

  // Persist cache for next invocation
  saveDiskCache();

  // Output (no trailing newline via process.stdout.write)
  if (outputLines.length > 0) {
    process.stdout.write(outputLines.join('\n'));
  }
}

main();
