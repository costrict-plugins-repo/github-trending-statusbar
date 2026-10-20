#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Check if the statusLine is configured in settings.json
const settingsPath = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');

let isConfigured = false;
try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  isConfigured = !!(settings.statusLine && settings.statusLine.command &&
    settings.statusLine.command.includes('statusline.js'));
} catch { /* settings not readable */ }

if (!isConfigured) {
  // Output a reminder as a hook message (shown to Claude, not directly to user)
  const msg = {
    message: 'statusbar plugin is installed but not configured. ' +
      'Run /statusbar:setup to enable the status bar.'
  };
  process.stdout.write(JSON.stringify(msg));
}
