# MetaSpace — Client

Browser-based collaborative whiteboard built with [Fabric.js](http://fabricjs.com/).

## Stack

- **Fabric.js** (CDN) — canvas drawing, objects, selection
- **Vanilla JS** — no build step, no bundler
- **WebSocket** — real-time sync with the server

## Files

| File | Description |
|------|-------------|
| `index.html` | Main app shell, all UI markup |
| `app.js` | All client logic (canvas, WS, UI, SFX) |
| `style.css` | Styles |
| `test_drawing.html` | Isolated canvas drawing test page |

## Development

The client is plain HTML/CSS/JS — no build step needed.

The server (`../server`) serves these files automatically on `http://localhost:3000`.
Just run the server and open the browser:

```bash
# from server/
npm install
npm start
# → open http://localhost:3000
```

Alternatively, serve the client standalone (no WebSocket features):

```bash
npm install
npm run serve
```

## WebSocket connection

The client connects to `ws://localhost:8080` by default.
To point at a different server, update the `socketUrl` in `app.js`:

```js
const socketUrl = `ws://localhost:8080?room=...`
```

## URL parameters

| Param | Description |
|-------|-------------|
| `room` | Room name (default: `main`) |

## Features

- Multi-user real-time drawing, sticky notes, images
- Cursor presence with names
- Chat panel
- Private zones (per-user locked areas)
- Draw limit area (expands over time)
- Undo / redo
- Dev mode (PIN-protected admin tools)
- Ambient procedural audio
