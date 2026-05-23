# MetaSpace — Server

Node.js WebSocket server with SQLite persistence.

## Stack

- **ws** — WebSocket server (port 8080)
- **better-sqlite3** — synchronous SQLite for board state

## Getting started

```bash
npm install
npm start
```

The server starts one listener:

| Service | Default port | Env var |
|---------|-------------|---------|
| WebSocket | 8080 | `WS_PORT` |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | `8080` | WebSocket port |

## Database

SQLite database is stored at `server/boards.db` (created automatically on first run).

Schema:

```sql
CREATE TABLE boards (
    room_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## Migrating from JSON files

If you have existing `board.json` / `board-<room>.json` files, copy them into the `server/` directory and run:

```bash
npm run migrate
```

## WebSocket protocol

All messages are JSON. Client → server:

| type | payload | description |
|------|---------|-------------|
| `get_board` | — | Request current board state |
| `update` | `{ data }` | Save new board state |
| `cursor` | `{ x, y }` | Broadcast cursor position |
| `chat` | `{ text }` | Send chat message |
| `profile` | `{ name, color, dev }` | Update user profile |
| `dev_clear_chat` | — | Dev: clear chat for all users |
| `dev_reset_limit` | — | Dev: reset draw limit for all users |

Server → client:

| type | payload | description |
|------|---------|-------------|
| `hello` | `{ id, room }` | Connection confirmed |
| `board` | `{ data }` | Full board state |
| `users` | `{ count, users[] }` | Current user list |
| `cursor` | `{ id, name, color, x, y }` | Remote cursor update |
| `chat` | `{ id, name, color, text }` | Incoming chat message |
| `leave` | `{ id }` | User disconnected |
| `limit` | `{ message }` | Board validation error |
| `clear_chat` | — | Clear chat UI |
| `reset_limit` | — | Reset draw limit UI |
