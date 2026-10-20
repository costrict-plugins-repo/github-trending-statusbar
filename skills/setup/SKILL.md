---
name: setup
description: >
  Set up, check status, or uninstall the statusbar plugin.
  Use when: first-time setup after installing the plugin, checking if the status bar is configured,
  or uninstalling the plugin. Triggers: "setup statusbar", "install statusbar", "configure statusbar",
  "uninstall statusbar", "remove statusbar", "statusbar status".
---

# Statusbar — Setup

You are helping the user set up, check, or uninstall the statusbar plugin.

## Determine the action

Based on the user's message, determine which action to perform:

- **setup** (default): Configure the status bar for first-time use
- **uninstall**: Remove the status bar configuration
- **status**: Check current configuration state

If the user just typed `/statusbar:setup` with no additional context, assume **setup**.

## Step 1: Check current status

Run the setup helper to check the current state:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-helper.js" status --plugin-root "${CLAUDE_PLUGIN_ROOT}" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

Parse the JSON output. Report to the user:
- Whether the status bar is currently configured
- Which data directory is being used
- Current layout and enabled widgets (if configured)

## Step 2: Execute the action

### For `setup`:

If the status bar is already configured, tell the user it's already set up and ask if they want to re-run setup (which will overwrite their statusLine setting).

If proceeding with setup, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-helper.js" setup --plugin-root "${CLAUDE_PLUGIN_ROOT}" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

Parse the JSON output. If successful, tell the user:

1. **Status bar is now configured!**
2. They need to **restart Claude Code** for the status bar to appear
3. After restarting, they can customize the status bar with `/statusbar:config`
4. Show the default widgets that are enabled: model, context usage, cost, duration, git branch

If any step failed, show the error and suggest manual troubleshooting.

### For `uninstall`:

Confirm with the user before proceeding. Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-helper.js" uninstall --plugin-root "${CLAUDE_PLUGIN_ROOT}" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

Tell the user the status bar has been removed and they need to restart Claude Code.

### For `status`:

Just display the status information from Step 1 in a readable format. If not configured, suggest running `/statusbar:setup`.

## Important notes

- The setup helper writes to `~/.claude/settings.json` — it preserves all existing settings and only adds/modifies the `statusLine` key
- The user MUST restart Claude Code after setup or uninstall for changes to take effect
- If `${CLAUDE_PLUGIN_DATA}` is not available, the setup helper falls back to `~/.claude/plugins/data/statusbar/`
