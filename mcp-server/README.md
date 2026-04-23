# Taskboard MCP server

An MCP (Model Context Protocol) server that exposes the Taskboard REST API as tools for Claude Desktop and other MCP-aware clients.

## Install

```bash
cd mcp-server
npm install
```

## Configure Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add a `taskboard` server entry:

```json
{
  "mcpServers": {
    "taskboard": {
      "command": "node",
      "args": ["/absolute/path/to/taskboard/mcp-server/index.js"],
      "env": {
        "TASKBOARD_API_KEY": "tb_live_...",
        "TASKBOARD_API_URL": "https://taskboard-vert-eight.vercel.app/api/v1"
      }
    }
  }
}
```

Generate an API key at `/profile/api-keys` on the Taskboard site. Then restart Claude Desktop.

## Available tools

- `get_me`
- `list_tasks`, `create_task`, `update_task`, `delete_task`, `complete_task`
- `list_rooms`, `get_room`, `create_room`, `delete_room`
- `list_room_tasks`, `create_room_task`, `list_room_members`

Each tool is a thin wrapper around one REST call. See `/api-docs` on the site for the full endpoint reference.
