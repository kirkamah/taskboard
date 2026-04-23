#!/usr/bin/env node
// Taskboard MCP server.
// Thin wrapper over the Taskboard REST API: each MCP tool maps to one HTTP call.
// REST is the source of truth; this process only translates between MCP and HTTP.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env.TASKBOARD_API_URL || 'https://taskboard-vert-eight.vercel.app/api/v1';
const API_KEY = process.env.TASKBOARD_API_KEY;

if (!API_KEY) {
  console.error('TASKBOARD_API_KEY environment variable is required.');
  console.error('Generate a key at https://taskboard-vert-eight.vercel.app/profile/api-keys');
  process.exit(1);
}

async function apiFetch(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// MCP-tool definitions. Keep input schemas minimal — LLMs do better with small,
// focused tool surfaces than with big generic ones.
const tools = [
  {
    name: 'get_me',
    description: 'Get the profile of the current Taskboard user (id, email, display name).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_tasks',
    description: 'List the personal tasks of the current user. Supports boolean filters and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        important: { type: 'boolean' },
        urgent: { type: 'boolean' },
        done: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_task',
    description: 'Create a new personal task. Defaults: important=true, urgent=true, done=false.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        important: { type: 'boolean' },
        urgent: { type: 'boolean' },
        due_at: { type: 'string', description: 'ISO 8601 timestamp' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'update_task',
    description: 'Update one or more fields of a task by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        important: { type: 'boolean' },
        urgent: { type: 'boolean' },
        done: { type: 'boolean' },
        due_at: { type: ['string', 'null'] }
      },
      additionalProperties: false
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'list_rooms',
    description: 'List the rooms the current user is a member of.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_room',
    description: 'Get details about one room by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'create_room',
    description: 'Create a new room. The current user becomes its owner.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'delete_room',
    description: 'Delete a room by id (owner only).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'list_room_tasks',
    description: 'List tasks inside a specific room.',
    inputSchema: {
      type: 'object',
      required: ['room_id'],
      properties: {
        room_id: { type: 'string' },
        important: { type: 'boolean' },
        urgent: { type: 'boolean' },
        done: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'create_room_task',
    description: 'Create a new task inside a room (requires owner or editor role).',
    inputSchema: {
      type: 'object',
      required: ['room_id', 'title'],
      properties: {
        room_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        important: { type: 'boolean' },
        urgent: { type: 'boolean' },
        due_at: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'list_room_members',
    description: 'List members of a room.',
    inputSchema: {
      type: 'object',
      required: ['room_id'],
      properties: { room_id: { type: 'string' } },
      additionalProperties: false
    }
  }
];

function qs(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function handleTool(name, args = {}) {
  switch (name) {
    case 'get_me': return apiFetch('GET', '/me');
    case 'list_tasks': return apiFetch('GET', `/tasks${qs(args)}`);
    case 'create_task': return apiFetch('POST', '/tasks', args);
    case 'update_task': {
      const { id, ...patch } = args;
      return apiFetch('PATCH', `/tasks/${id}`, patch);
    }
    case 'delete_task': return apiFetch('DELETE', `/tasks/${args.id}`);
    case 'complete_task': return apiFetch('POST', `/tasks/${args.id}/complete`);
    case 'list_rooms': return apiFetch('GET', '/rooms');
    case 'get_room': return apiFetch('GET', `/rooms/${args.id}`);
    case 'create_room': return apiFetch('POST', '/rooms', { name: args.name });
    case 'delete_room': return apiFetch('DELETE', `/rooms/${args.id}`);
    case 'list_room_tasks': {
      const { room_id, ...rest } = args;
      return apiFetch('GET', `/rooms/${room_id}/tasks${qs(rest)}`);
    }
    case 'create_room_task': {
      const { room_id, ...body } = args;
      return apiFetch('POST', `/rooms/${room_id}/tasks`, body);
    }
    case 'list_room_members': return apiFetch('GET', `/rooms/${args.room_id}/members`);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: 'taskboard', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await handleTool(name, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
