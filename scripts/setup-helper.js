#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const args = process.argv.slice(2);
const action = args[0]; // setup | uninstall | status

function getArg(name) {
  const idx = args.indexOf('--' + name);
  return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : null;
}

const pluginRoot = getArg('plugin-root') || path.join(__dirname, '..');
const dataDir = getArg('data-dir')
  || process.env.CLAUDE_PLUGIN_DATA
  || path.join(os.homedir(), '.claude', 'plugins', 'data', 'statusbar');

const settingsPath = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');

// =============================================================================
// Utility: Atomic JSON File Write
// =============================================================================

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

// =============================================================================
// Output Helper
// =============================================================================

function output(result) {
  process.stdout.write(JSON.stringify(result));
}

// =============================================================================
// Actions
// =============================================================================

function doSetup() {
  const result = { action: 'setup', success: true, steps: [] };

  // Step 1: Create data directory
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    result.steps.push({ step: 'create_data_dir', path: dataDir, ok: true });
  } catch (err) {
    result.steps.push({ step: 'create_data_dir', path: dataDir, ok: false, error: err.message });
    result.success = false;
    output(result);
    return;
  }

  // Step 2: Copy default config if not exists
  const configDest = path.join(dataDir, 'statusbar-config.json');
  if (!fs.existsSync(configDest)) {
    const defaultsPath = path.join(pluginRoot, 'defaults', 'statusbar-config.json');
    try {
      const defaults = fs.readFileSync(defaultsPath, 'utf-8');
      fs.writeFileSync(configDest, defaults, 'utf-8');
      result.steps.push({ step: 'copy_defaults', path: configDest, ok: true });
    } catch (err) {
      // Write a minimal default if the defaults file is missing
      try {
        const minimal = {
          layout: 'compact',
          widgets: {
            'compact-warn': true, model: true, context: true,
            cost: true, duration: true, git: true
          },
          contextBarWidth: 8,
          separator: ' \u2502 '
        };
        fs.writeFileSync(configDest, JSON.stringify(minimal, null, 2) + '\n', 'utf-8');
        result.steps.push({ step: 'copy_defaults', path: configDest, ok: true, note: 'wrote minimal defaults' });
      } catch (err2) {
        result.steps.push({ step: 'copy_defaults', ok: false, error: err2.message });
      }
    }
  } else {
    result.steps.push({ step: 'copy_defaults', path: configDest, ok: true, note: 'already exists' });
  }

  // Step 3: Write statusLine to settings.json
  const statusLineCommand = `node "${path.join(pluginRoot, 'scripts', 'statusline.js')}" --data-dir "${dataDir}"`;
  try {
    const settings = readJsonFile(settingsPath) || {};
    settings.statusLine = {
      type: 'command',
      command: statusLineCommand
    };
    writeJsonFileAtomic(settingsPath, settings);
    result.steps.push({
      step: 'write_statusline',
      path: settingsPath,
      command: statusLineCommand,
      ok: true
    });
  } catch (err) {
    result.steps.push({ step: 'write_statusline', ok: false, error: err.message });
    result.success = false;
  }

  result.dataDir = dataDir;
  result.pluginRoot = pluginRoot;
  result.settingsPath = settingsPath;
  output(result);
}

function doUninstall() {
  const result = { action: 'uninstall', success: true, steps: [] };

  // Remove statusLine from settings.json
  try {
    const settings = readJsonFile(settingsPath);
    if (settings && settings.statusLine) {
      delete settings.statusLine;
      writeJsonFileAtomic(settingsPath, settings);
      result.steps.push({ step: 'remove_statusline', path: settingsPath, ok: true });
    } else {
      result.steps.push({ step: 'remove_statusline', ok: true, note: 'statusLine not found (already clean)' });
    }
  } catch (err) {
    result.steps.push({ step: 'remove_statusline', ok: false, error: err.message });
    result.success = false;
  }

  output(result);
}

function doStatus() {
  const result = { action: 'status' };

  // Check settings.json for statusLine
  const settings = readJsonFile(settingsPath);
  result.settingsPath = settingsPath;
  result.settingsExists = !!settings;
  result.statusLineConfigured = !!(settings && settings.statusLine);
  if (result.statusLineConfigured) {
    result.statusLineCommand = settings.statusLine.command;
  }

  // Check data directory
  result.dataDir = dataDir;
  result.dataDirExists = fs.existsSync(dataDir);

  // Check config file
  const configPath = path.join(dataDir, 'statusbar-config.json');
  result.configExists = fs.existsSync(configPath);
  if (result.configExists) {
    try {
      const config = readJsonFile(configPath);
      result.currentLayout = config?.layout || 'compact';
      const enabled = Object.entries(config?.widgets || {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      result.enabledWidgets = enabled;
    } catch { /* ignore */ }
  }

  result.pluginRoot = pluginRoot;
  output(result);
}

// =============================================================================
// Main
// =============================================================================

switch (action) {
  case 'setup':
    doSetup();
    break;
  case 'uninstall':
    doUninstall();
    break;
  case 'status':
    doStatus();
    break;
  default:
    output({
      error: `Unknown action: "${action || '(none)'}"`,
      usage: 'node setup-helper.js <setup|uninstall|status> [--plugin-root PATH] [--data-dir PATH]'
    });
    process.exit(1);
}
