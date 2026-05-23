const WebSocket = require('ws')
const http = require('http')
const fs = require('fs')
const path = require('path')

// ── Static file server ────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
}

const staticServer = http.createServer((req, res) => {
    // Default to index.html for "/"
    const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0]
    const filePath = path.join(__dirname, urlPath)
    const ext = path.extname(filePath).toLowerCase()

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('404 Not Found')
            return
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(data)
    })
})

staticServer.listen(3000, () => {
    console.log('Static server running  http://localhost:3000')
})
// ─────────────────────────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: 8080 })

const DEFAULT_ROOM = 'main'
const MAX_BOARD_BYTES = 5 * 1024 * 1024
const MAX_OBJECTS = 1500

const rooms = new Map()

function sanitizeRoom(value) {
    return String(value || DEFAULT_ROOM)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .slice(0, 40) || DEFAULT_ROOM
}

function boardPath(roomId) {
    if (roomId === DEFAULT_ROOM) return path.join(__dirname, 'board.json')

    return path.join(__dirname, `board-${roomId}.json`)
}

function emptyBoard() {
    return { version: '5.3.0', objects: [] }
}

function loadBoard(roomId) {
    try {
        const file = boardPath(roomId)

        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'))
        }
    } catch (e) {
        console.log('load error:', e)
    }

    return emptyBoard()
}

function saveBoard(roomId) {
    const room = rooms.get(roomId)
    if (!room) return

    fs.writeFileSync(boardPath(roomId), JSON.stringify(room.board, null, 2))
}

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            board: loadBoard(roomId),
            clients: new Set()
        })
    }

    return rooms.get(roomId)
}

function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
    }
}

function broadcast(room, msg, except) {
    for (const client of room.clients) {
        if (client !== except) {
            send(client, msg)
        }
    }
}

function userList(room) {
    return [...room.clients].map(client => ({
        id: client.meta.id,
        name: client.meta.name,
        color: client.meta.color,
        dev: client.meta.dev || false
    }))
}

function validateBoard(message, ws) {
    if (!message.data || !Array.isArray(message.data.objects)) {
        return { message: 'Bad board data.' }
    }

    if (message.data.objects.length > MAX_OBJECTS) {
        return { message: `Board limit reached: max ${MAX_OBJECTS} objects.` }
    }

    const bytes = Buffer.byteLength(JSON.stringify(message.data), 'utf8')
    if (bytes > MAX_BOARD_BYTES) {
        return { message: 'Board is too large. Try deleting large images or old drawings.' }
    }

    return null
}

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'ws://localhost')
    const roomId = sanitizeRoom(url.searchParams.get('room'))
    const room = getRoom(roomId)

    ws.meta = {
        id: url.searchParams.get('id') || Math.random().toString(36).slice(2, 10),
        name: (url.searchParams.get('name') || 'Guest').slice(0, 24),
        color: url.searchParams.get('color') || '#66d9ff',
        dev: url.searchParams.get('dev') === '1',
        roomId
    }

    room.clients.add(ws)

    console.log(`Client connected: ${ws.meta.name} in ${roomId} (${room.clients.size})`)

    send(ws, {
        type: 'hello',
        id: ws.meta.id,
        room: roomId
    })

    send(ws, {
        type: 'board',
        data: room.board
    })

    broadcast(room, {
        type: 'users',
        count: room.clients.size,
        users: userList(room)
    })

    send(ws, {
        type: 'users',
        count: room.clients.size,
        users: userList(room)
    })

    ws.on('message', (message) => {
        let msg

        try {
            msg = JSON.parse(message)
        } catch {
            return
        }

        if (msg.type === 'get_board') {
            send(ws, {
                type: 'board',
                data: room.board
            })
            return
        }

        if (msg.type === 'profile') {
            ws.meta.name = String(msg.name || 'Guest').slice(0, 24)
            ws.meta.color = String(msg.color || ws.meta.color).slice(0, 16)
            ws.meta.dev = msg.dev === true

            broadcast(room, {
                type: 'users',
                count: room.clients.size,
                users: userList(room)
            })

            send(ws, {
                type: 'users',
                count: room.clients.size,
                users: userList(room)
            })
            return
        }

        if (msg.type === 'cursor') {
            broadcast(room, {
                type: 'cursor',
                id: ws.meta.id,
                name: ws.meta.name,
                color: ws.meta.color,
                dev: ws.meta.dev || false,
                x: msg.x,
                y: msg.y
            }, ws)
            return
        }

        if (msg.type === 'chat') {
            const text = String(msg.text || '').trim().slice(0, 200)
            if (!text) return

            // Broadcast to all OTHER clients (sender already displayed it locally)
            broadcast(room, {
                type: 'chat',
                id: ws.meta.id,
                name: ws.meta.name,
                color: ws.meta.color,
                dev: ws.meta.dev || false,
                text: text
            }, ws)
            return
        }

        if (msg.type === 'update') {
            const problem = validateBoard(msg, ws)

            if (problem) {
                send(ws, {
                    type: 'limit',
                    message: problem.message,
                    drawRemaining: problem.remaining
                })
                return
            }

            room.board = msg.data
            saveBoard(roomId)

            broadcast(room, {
                type: 'board',
                data: room.board
            })
        }

        // ── Dev-only admin commands ───────────────────────────────────────────
        if (msg.type === 'dev_clear_chat') {
            if (!ws.meta.dev) return

            // Broadcast to ALL clients in the room (including sender)
            for (const client of room.clients) {
                send(client, { type: 'clear_chat' })
            }
            console.log(`[dev] clear_chat by ${ws.meta.name} in ${roomId}`)
            return
        }

        if (msg.type === 'dev_reset_limit') {
            if (!ws.meta.dev) return

            for (const client of room.clients) {
                send(client, { type: 'reset_limit' })
            }
            console.log(`[dev] reset_limit by ${ws.meta.name} in ${roomId}`)
            return
        }
        // ─────────────────────────────────────────────────────────────────────
    })

    ws.on('close', () => {
        room.clients.delete(ws)

        broadcast(room, {
            type: 'leave',
            id: ws.meta.id
        })

        broadcast(room, {
            type: 'users',
            count: room.clients.size,
            users: userList(room)
        })
    })
})

console.log('Server running ws://localhost:8080')
