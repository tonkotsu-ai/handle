# handle-design

Design feedback bridge between a Chrome extension and AI coding agents via [MCP](https://modelcontextprotocol.io/).

Users visually select and edit elements on a webpage, then send structured feedback to a coding agent through the `/handle` command.

## Quick Start

```bash
npx handle-design setup
```

This detects your installed coding agents and configures them automatically. Supported agents:

- **Claude Code** (`~/.claude.json`)
- **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`)
- **Cursor** (`~/.cursor/mcp.json`)
- **Windsurf** (`~/.codeium/windsurf/mcp_config.json`)

Restart your coding agent after setup to activate Handle.

## Manual Configuration

Add this to your agent's MCP config:

```json
{
  "mcpServers": {
    "handle": {
      "command": "npx",
      "args": ["-y", "handle-design"]
    }
  }
}
```

## How It Works

1. The MCP server runs on stdio (spawned by your coding agent)
2. A Socket.IO server starts on a random port for Chrome extension communication
3. A discovery HTTP server on port **58932** lets the extension find active sessions
4. When you call `/handle` in your agent, it broadcasts a feedback request to the extension
5. You select and annotate elements in the browser, then send feedback back to the agent

## CLI

```
npx handle-design           Run MCP server (stdio mode)
npx handle-design setup     Configure coding agents to use Handle
npx handle-design help      Show help
```

## Chrome Extension

The companion Chrome extension is required. See the [main repo](https://github.com/anthropics/handle) for installation.
