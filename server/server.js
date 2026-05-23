const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')

// ── JSON File Storage ─────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || __dirname
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json')

// Загружаем все доски из JSON файла
function loadAllBoards() {
    try {
        if (fs.existsSync(BOARDS_FILE)) {
            const data = fs.readFileSync(BOARDS_FILE, 'utf8')
            return JSON.parse(data)
        }
    } catch (e) {
        console.error('Error loading boards:', e)
    }
    return {}
}

// Сохраняем все доски в JSON файл
function saveAllBoards(boards) {
    try {
        fs.writeFileSync(BOARDS_FILE, JSON.stringify(boards, null, 2), 'utf8')
    } catch (e) {
        console.error('Error saving boards:', e)
    }
}

// Кэш досок в памяти
let boardsCache = loadAllBoards()

// Периодическое сохранение (каждые 30 секунд)
setInterval(() => {
    saveAllBoards(boardsCache)
}, 30000)

// Сохранение при завершении процесса
process.on('SIGTERM', () => {
    console.log('Saving boards before shutdown...')
    saveAllBoards(boardsCache)
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log('Saving boards before shutdown...')
    saveAllBoards(boardsCache)
    process.exit(0)
})
// ─────────────────────────────────────────────────────────────────────────────

const WS_PORT = process.env.PORT || process.env.WS_PORT || 8080

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

function emptyBoard() {
    return { version: '5.3.0', objects: [] }
}

function loadBoard(roomId) {
    try {
        if (boardsCache[roomId]) {
            return boardsCache[roomId]
        }
    } catch (e) {
        console.error('load error:', e)
    }
    return emptyBoard()
}

function saveBoard(roomId) {
    const room = rooms.get(roomId)
    if (!room) return
    boardsCache[roomId] = room.board
    // Сохраняем сразу при изменении (дополнительно к периодическому)
    saveAllBoards(boardsCache)
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
        if (client !== except) send(client, msg)
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

function validateBoard(message) {
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

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: WS_PORT })

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
    console.log(`[+] ${ws.meta.name} joined "${roomId}" (${room.clients.size} online)`)

    send(ws, { type: 'hello', id: ws.meta.id, room: roomId })
    send(ws, { type: 'board', data: room.board })

    const usersMsg = { type: 'users', count: room.clients.size, users: userList(room) }
    broadcast(room, usersMsg)
    send(ws, usersMsg)

    ws.on('message', (raw) => {
        let msg
        try { msg = JSON.parse(raw) } catch { return }

        if (msg.type === 'get_board') {
            send(ws, { type: 'board', data: room.board })
            return
        }

        if (msg.type === 'profile') {
            ws.meta.name = String(msg.name || 'Guest').slice(0, 24)
            ws.meta.color = String(msg.color || ws.meta.color).slice(0, 16)
            ws.meta.dev = msg.dev === true
            const u = { type: 'users', count: room.clients.size, users: userList(room) }
            broadcast(room, u)
            send(ws, u)
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
            broadcast(room, {
                type: 'chat',
                id: ws.meta.id,
                name: ws.meta.name,
                color: ws.meta.color,
                dev: ws.meta.dev || false,
                text
            }, ws)
            return
        }

        if (msg.type === 'update') {
            const problem = validateBoard(msg)
            if (problem) {
                send(ws, { type: 'limit', message: problem.message })
                return
            }
            room.board = msg.data
            saveBoard(roomId)
            broadcast(room, { type: 'board', data: room.board })
            return
        }

        // ── Dev-only admin commands ───────────────────────────────────────────
        if (msg.type === 'dev_clear_chat') {
            if (!ws.meta.dev) return
            for (const client of room.clients) send(client, { type: 'clear_chat' })
            console.log(`[dev] clear_chat by ${ws.meta.name} in "${roomId}"`)
            return
        }

        if (msg.type === 'dev_reset_limit') {
            if (!ws.meta.dev) return
            for (const client of room.clients) send(client, { type: 'reset_limit' })
            console.log(`[dev] reset_limit by ${ws.meta.name} in "${roomId}"`)
            return
        }
        // ─────────────────────────────────────────────────────────────────────
    })

    ws.on('close', () => {
        room.clients.delete(ws)
        console.log(`[-] ${ws.meta.name} left "${roomId}" (${room.clients.size} online)`)
        broadcast(room, { type: 'leave', id: ws.meta.id })
        broadcast(room, { type: 'users', count: room.clients.size, users: userList(room) })
    })
})

console.log(`WebSocket server running on port ${WS_PORT}`)
