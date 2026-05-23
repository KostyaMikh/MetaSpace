const params = new URLSearchParams(location.search)
const customProps = ['id', 'ownerId', 'ownerName', 'ownerColor', 'locked', 'privateOwner', 'kind']
const originalToObject = fabric.Object.prototype.toObject
const OWN_PRIVATE_COLOR = '#1e90ff'
const OTHER_PRIVATE_FALLBACK = '#ff9f66'
const USER_COLORS = ['#ff6b8b', '#ffb347', '#ffe066', '#63e6be', '#66d9ff', '#7aa2ff', '#c792ea', '#f78c6c']
const LIMIT_BASE_SIZE = 8000
const LIMIT_GROWTH_PER_HOUR = 2000
const LIMIT_MAX_SIZE = 30000
const MIN_ZOOM = 0.08
const MAX_ZOOM = 4

fabric.Object.prototype.toObject = function (props) {
    return originalToObject.call(this, (props || []).concat(customProps))
}

const clientId = Math.random().toString(36).slice(2, 10)

let userName = sessionStorage.getItem('metaspace-name') || localStorage.getItem('metaspace-name') || ''

// ─── DEV MODE ─────────────────────────────────────────────────────────────────
// PIN is stored as a simple hash so it's not plaintext in source.
// Default PIN: 15421  →  hash: 46883023
const DEV_PIN_HASH = 46883023

function hashPin(str) {
    let h = 0
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i) | 0
    }
    return h
}

let isDevMode = sessionStorage.getItem('metaspace-dev-mode') === '1'
// ─────────────────────────────────────────────────────────────────────────────

const userColor = colorForId(clientId)

const room = (params.get('room') || 'main').trim() || 'main'
const socketUrl = `ws://localhost:8080?room=${encodeURIComponent(room)}&id=${encodeURIComponent(clientId)}&name=${encodeURIComponent(userName || 'Guest')}&color=${encodeURIComponent(userColor)}&dev=${isDevMode ? '1' : '0'}`
const socket = new WebSocket(socketUrl)

const canvas = new fabric.Canvas('board', {
    selection: true,
    preserveObjectStacking: true
})

canvas.freeDrawingBrush.width = 4

let mode = 'select'
let loading = false
let readyToSync = false
let isPanning = false
let lastPanX = 0
let lastPanY = 0
let history = []
let historyIndex = -1
let lastCursorSent = 0
let lastCursorWorldPos = { x: 0, y: 0 }
let limitStartedAt = Number(sessionStorage.getItem('metaspace-limit-started-at')) || startOfToday()
let limitBonusHours = Number(sessionStorage.getItem('metaspace-limit-bonus-hours')) || 0
let limitRect
let devConsoleWasEnabled = false
let devConsoleClosed = false
let devConsoleMinimized = false
let devConsoleMaximized = false

resetDailyLimitIfNeeded()
saveLimitState()

const colorPicker = document.getElementById('colorPicker')
const brushSize = document.getElementById('brushSize')
const coordsEl = document.getElementById('coords')
const usersEl = document.getElementById('users')
const quotaEl = document.getElementById('quota')
const statusEl = document.getElementById('status')
const cursorLayer = document.getElementById('cursorLayer')
const devHint = document.getElementById('devHint')
const nameInput = document.getElementById('nameInput')
const nameBtn = document.getElementById('nameBtn')
const devConsole = document.getElementById('devConsole')
const devConsoleHeader = document.getElementById('devConsoleHeader')
const devCloseBtn = document.getElementById('devCloseBtn')
const devMinBtn = document.getElementById('devMinBtn')
const devMaxBtn = document.getElementById('devMaxBtn')
const eraseAllBtn = document.getElementById('eraseAllBtn')
const skipLimitBtn = document.getElementById('skipLimitBtn')
const resetLimitBtn = document.getElementById('resetLimitBtn')
const maxLimitBtn = document.getElementById('maxLimitBtn')
const clearChatBtn = document.getElementById('clearChatBtn')
const resetLimitAllBtn = document.getElementById('resetLimitAllBtn')

const teleportInput = document.getElementById('teleportInput')
const goBtn = document.getElementById('goBtn')
const copyBtn = document.getElementById('copyBtn')
const imageInput = document.getElementById('imageInput')

const chatContainer = document.getElementById('chatContainer')
const chatHeader = document.getElementById('chatHeader')
const chatCloseBtn = document.getElementById('chatCloseBtn')
const chatMinBtn = document.getElementById('chatMinBtn')
const chatMaxBtn = document.getElementById('chatMaxBtn')
const chatMessages = document.getElementById('chatMessages')
const chatInput = document.getElementById('chatInput')
const chatSendBtn = document.getElementById('chatSendBtn')
const emojiToggleBtn = document.getElementById('emojiToggleBtn')
const emojiPicker = document.getElementById('emojiPicker')
const emojiButtons = document.querySelectorAll('.emoji-btn')

// Check if we have saved chat state
const hasSavedChatState = sessionStorage.getItem('metaspace-chat-closed') !== null

let chatClosed = sessionStorage.getItem('metaspace-chat-closed') === 'true'
let chatMinimized = sessionStorage.getItem('metaspace-chat-minimized') === 'true'
let chatMaximized = sessionStorage.getItem('metaspace-chat-maximized') === 'true'

// Restore chat state on load
if (!hasSavedChatState) {
    // First time - chat is visible by default
    chatContainer.hidden = false
    sessionStorage.setItem('metaspace-chat-closed', 'false')
} else if (chatClosed) {
    chatContainer.hidden = true
} else {
    chatContainer.hidden = false
    if (chatMinimized) {
        chatContainer.classList.add('minimized')
    }
    if (chatMaximized) {
        chatContainer.classList.add('maximized')
        chatContainer.style.left = '24px'
        chatContainer.style.top = '24px'
        chatContainer.style.right = '24px'
        chatContainer.style.bottom = '24px'
    }
}

const selectBtn = document.getElementById('selectBtn')
const drawBtn = document.getElementById('drawBtn')
const eraseBtn = document.getElementById('eraseBtn')
const noteBtn = document.getElementById('noteBtn')
const uploadBtn = document.getElementById('uploadBtn')
const privateBtn = document.getElementById('privateBtn')
const lockBtn = document.getElementById('lockBtn')
const undoBtn = document.getElementById('undoBtn')
const zoomInBtn = document.getElementById('zoomInBtn')
const zoomOutBtn = document.getElementById('zoomOutBtn')
const zoomResetBtn = document.getElementById('zoomResetBtn')
const muteBtn = document.getElementById('muteBtn')

nameInput.value = userName

// ─── NAME MODAL ───────────────────────────────────────────────────────────────
const nameModal = document.getElementById('nameModal')
const nameModalInput = document.getElementById('nameModalInput')
const nameModalBtn = document.getElementById('nameModalBtn')
const nameModalDevBtn = document.getElementById('nameModalDevBtn')
const nameModalNormal = document.getElementById('nameModalNormal')
const nameModalDev = document.getElementById('nameModalDev')
const nameModalPin = document.getElementById('nameModalPin')
const nameModalPinBtn = document.getElementById('nameModalPinBtn')
const nameModalPinError = document.getElementById('nameModalPinError')
const nameModalBackBtn = document.getElementById('nameModalBackBtn')

function submitNameModal() {
    const entered = nameModalInput.value.trim().slice(0, 24)
    const finalName = entered || 'Guest'
    userName = finalName
    localStorage.setItem('metaspace-name', finalName)
    sessionStorage.setItem('metaspace-name', finalName)
    nameInput.value = finalName
    updateDevTools()
    updateLocalCursorStyle()
    nameModal.hidden = true
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'profile', name: finalName, color: userColor, dev: false }))
    }
}

// ─── PIN SFX (Web Audio API — no files needed) ───────────────────────────────
function playPinBeep(digitCount) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        // Each digit steps up in pitch: 800, 900, 1000, 1100 ...
        const freq = 800 + (digitCount - 1) * 100
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(0.1, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
    } catch { }
}

function playPinSuccess() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        // Three rising tones
        const notes = [880, 1100, 1480]
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1)
            gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18)
            osc.start(ctx.currentTime + i * 0.1)
            osc.stop(ctx.currentTime + i * 0.1 + 0.18)
        })
    } catch { }
}

function playPinError() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(180, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25)
        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.25)
    } catch { }
}

// ─── SFX LIBRARY ─────────────────────────────────────────────────────────────
function sfx(fn) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        fn(ctx)
    } catch { }
}

// Board loaded — soft rising whoosh
function sfxBoardJoin() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.35)
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35)
    })
}

// Sticky note placed — soft pop
function sfxNote() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12)
        gain.gain.setValueAtTime(0.1, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12)
    })
}

// Lock — short hard click
function sfxLock() {
    sfx(ctx => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
        const src = ctx.createBufferSource()
        const gain = ctx.createGain()
        const filter = ctx.createBiquadFilter()
        src.buffer = buf
        filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 2
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.35, ctx.currentTime)
        src.start(ctx.currentTime)
    })
}

// Unlock — lighter click
function sfxUnlock() {
    sfx(ctx => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
        const src = ctx.createBufferSource()
        const gain = ctx.createGain()
        const filter = ctx.createBiquadFilter()
        src.buffer = buf
        filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 2
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        src.start(ctx.currentTime)
    })
}

// User joins — bright ding
function sfxUserJoin() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1046, ctx.currentTime)
        gain.gain.setValueAtTime(0.07, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    })
}

// User leaves — soft fade tone
function sfxUserLeave() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(700, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.06, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    })
}

// Chat message received — quiet ping
function sfxChat() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.05, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
    })
}

// Limit / private zone blocked — low thud
function sfxBlocked() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(120, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2)
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
    })
}

// Undo — short rewind blip
function sfxUndo() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15)
        gain.gain.setValueAtTime(0.07, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
    })
}

// Redo — forward blip
function sfxRedo() {
    sfx(ctx => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15)
        gain.gain.setValueAtTime(0.07, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
    })
}

// Image uploaded — camera shutter
function sfxUpload() {
    sfx(ctx => {
        // Two quick noise bursts
        [0, 0.06].forEach(offset => {
            const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate)
            const data = buf.getChannelData(0)
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
            const src = ctx.createBufferSource()
            const gain = ctx.createGain()
            const filter = ctx.createBiquadFilter()
            src.buffer = buf
            filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 1
            src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
            gain.gain.setValueAtTime(0.3, ctx.currentTime + offset)
            src.start(ctx.currentTime + offset)
        })
    })
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── AMBIENT MUSIC ────────────────────────────────────────────────────────────
// Procedurally generated — no audio files needed.
// A slow evolving pad drone + occasional soft melody notes.
let ambientCtx = null
let ambientMasterGain = null
let ambientRunning = false
let ambientMelodyTimer = null

const AMBIENT_SCALE = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94]

function startAmbient() {
    if (ambientRunning) return
    try {
        ambientCtx = new (window.AudioContext || window.webkitAudioContext)()
        ambientMasterGain = ambientCtx.createGain()
        ambientMasterGain.gain.setValueAtTime(0, ambientCtx.currentTime)
        ambientMasterGain.gain.linearRampToValueAtTime(0.18, ambientCtx.currentTime + 4)
        ambientMasterGain.connect(ambientCtx.destination)

        function makeDrone(freq, detune, type) {
            const osc = ambientCtx.createOscillator()
            const g = ambientCtx.createGain()
            const filter = ambientCtx.createBiquadFilter()
            osc.type = type
            osc.frequency.value = freq
            osc.detune.value = detune
            filter.type = 'lowpass'
            filter.frequency.value = 600
            filter.Q.value = 0.8
            osc.connect(filter); filter.connect(g); g.connect(ambientMasterGain)
            g.gain.value = 0.06
            osc.start()
        }

        makeDrone(65.41, 0, 'sine')
        makeDrone(65.41, 8, 'sine')
        makeDrone(98.00, -5, 'sine')
        makeDrone(130.81, 3, 'sine')

        const lfo = ambientCtx.createOscillator()
        const lfoGain = ambientCtx.createGain()
        lfo.frequency.value = 0.08
        lfoGain.gain.value = 0.04
        lfo.connect(lfoGain)
        lfoGain.connect(ambientMasterGain.gain)
        lfo.start()

        function scheduleMelodyNote() {
            if (!ambientRunning) return
            const freq = AMBIENT_SCALE[Math.floor(Math.random() * AMBIENT_SCALE.length)] * (Math.random() < 0.4 ? 2 : 1)
            const osc = ambientCtx.createOscillator()
            const g = ambientCtx.createGain()
            const filter = ambientCtx.createBiquadFilter()
            osc.type = 'sine'
            osc.frequency.value = freq
            filter.type = 'lowpass'
            filter.frequency.value = 1200
            osc.connect(filter); filter.connect(g); g.connect(ambientMasterGain)
            const now = ambientCtx.currentTime
            const dur = 1.5 + Math.random() * 2
            g.gain.setValueAtTime(0, now)
            g.gain.linearRampToValueAtTime(0.07, now + 0.3)
            g.gain.exponentialRampToValueAtTime(0.001, now + dur)
            osc.start(now); osc.stop(now + dur)
            ambientMelodyTimer = window.setTimeout(scheduleMelodyNote, 2000 + Math.random() * 5000)
        }

        ambientMelodyTimer = window.setTimeout(scheduleMelodyNote, 3000)
        ambientRunning = true
    } catch { }
}

function stopAmbient() {
    if (!ambientRunning) return
    ambientRunning = false
    window.clearTimeout(ambientMelodyTimer)
    if (ambientMasterGain) {
        ambientMasterGain.gain.linearRampToValueAtTime(0, ambientCtx.currentTime + 2)
        window.setTimeout(() => { try { ambientCtx.close() } catch { } }, 2500)
    }
}

function setAmbientVolume(v) {
    if (!ambientMasterGain) return
    ambientMasterGain.gain.cancelScheduledValues(ambientCtx.currentTime)
    ambientMasterGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), ambientCtx.currentTime + 0.5)
}
// ─────────────────────────────────────────────────────────────────────────────

function submitDevPin() {
    const pin = nameModalPin.value
    if (hashPin(pin) === DEV_PIN_HASH) {
        playPinSuccess()
        isDevMode = true
        sessionStorage.setItem('metaspace-dev-mode', '1')
        const enteredName = nameModalInput.value.trim().slice(0, 24) || 'Dev'
        userName = enteredName
        localStorage.setItem('metaspace-name', enteredName)
        sessionStorage.setItem('metaspace-name', enteredName)
        nameInput.value = enteredName
        updateDevTools()
        updateLocalCursorStyle()
        nameModal.hidden = true
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'profile', name: enteredName, color: userColor, dev: true }))
        }
    } else {
        playPinError()
        nameModalPinError.hidden = false
        nameModalPin.classList.add('pin-error')
        nameModalPin.value = ''
        window.setTimeout(() => {
            nameModalPin.classList.remove('pin-error')
        }, 400)
    }
}

nameModalBtn.addEventListener('click', submitNameModal)
nameModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNameModal()
})

nameModalDevBtn.addEventListener('click', () => {
    nameModalNormal.hidden = true
    nameModalDev.hidden = false
    nameModalPinError.hidden = true
    nameModalPin.value = ''
    window.setTimeout(() => nameModalPin.focus(), 40)
})

nameModalBackBtn.addEventListener('click', () => {
    nameModalDev.hidden = true
    nameModalNormal.hidden = false
    window.setTimeout(() => nameModalInput.focus(), 40)
})

nameModalPinBtn.addEventListener('click', submitDevPin)
nameModalPin.addEventListener('input', () => {
    const pin = nameModalPin.value
    nameModalPinError.hidden = true
    if (pin.length > 0) playPinBeep(pin.length)
    // Auto-submit once the correct PIN length is reached and hash matches
    if (hashPin(pin) === DEV_PIN_HASH) {
        submitDevPin()
    }
})
nameModalPin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitDevPin()
})

// Show modal on every new tab (sessionStorage is empty), skip on refresh
if (!sessionStorage.getItem('metaspace-name')) {
    nameModal.hidden = false
    window.setTimeout(() => nameModalInput.focus(), 80)
} else {
    nameModal.hidden = true
}
// ─────────────────────────────────────────────────────────────────────────────

// LOCAL CURSOR SETUP
const localCursor = document.getElementById('localCursor')
const localCursorArrow = localCursor.querySelector('.cursor-arrow')
const localCursorName = localCursor.querySelector('.cursor-name')

updateDevTools()
updateLocalCursorStyle()

window.addEventListener('mousemove', (e) => {
    localCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
})

window.addEventListener('mouseleave', () => {
    localCursor.style.display = 'none'
})

window.addEventListener('mouseenter', () => {
    localCursor.style.display = ''
})

function colorForId(id) {
    const value = String(id || '')
    let hash = 0

    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i)
        hash |= 0
    }

    return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

function normalizeUserColor(color, fallbackId) {
    const cleanColor = String(color || '').toLowerCase()

    if (/^#[0-9a-f]{6}$/i.test(cleanColor) && cleanColor !== '#ffffff') {
        return color
    }

    return fallbackId ? colorForId(fallbackId) : OTHER_PRIVATE_FALLBACK
}

function setStatus(text) {
    statusEl.textContent = text

    if (text) {
        window.clearTimeout(setStatus.timer)
        setStatus.timer = window.setTimeout(() => {
            statusEl.textContent = ''
        }, 4000)
    }
}

function todayKey() {
    const now = new Date()

    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function startOfToday() {
    const now = new Date()

    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function saveLimitState() {
    sessionStorage.setItem('metaspace-limit-day', todayKey())
    sessionStorage.setItem('metaspace-limit-started-at', String(limitStartedAt))
    sessionStorage.setItem('metaspace-limit-bonus-hours', String(limitBonusHours))
}

function resetLimitState() {
    limitStartedAt = Date.now()
    limitBonusHours = 0
    saveLimitState()
    refreshLimitArea()
}

function resetDailyLimitIfNeeded() {
    if (sessionStorage.getItem('metaspace-limit-day') === todayKey()) return false

    limitStartedAt = startOfToday()
    limitBonusHours = 0
    saveLimitState()
    return true
}

function updateQuota(remaining, limit) {
    if (typeof remaining !== 'number') {
        updateLimitHud()
        return
    }

    quotaEl.textContent = `Draws left: ${remaining}${limit ? ` / ${limit}` : ''}`
    quotaEl.classList.toggle('quota-low', remaining <= 50)
}

function elapsedLimitHours() {
    return Math.floor((Date.now() - limitStartedAt) / (60 * 60 * 1000)) + limitBonusHours
}

function currentLimitSize() {
    return Math.min(LIMIT_MAX_SIZE, LIMIT_BASE_SIZE + elapsedLimitHours() * LIMIT_GROWTH_PER_HOUR)
}

function currentLimitBounds() {
    const size = currentLimitSize()
    const half = size / 2

    return {
        left: -half,
        top: -half,
        right: half,
        bottom: half,
        width: size,
        height: size
    }
}

function msUntilNextLimitHour() {
    const elapsed = Date.now() - limitStartedAt
    const hour = 60 * 60 * 1000

    return hour - (elapsed % hour)
}

function formatWait(ms) {
    const totalMinutes = Math.ceil(ms / 60000)
    const minutes = totalMinutes % 60
    const hours = Math.floor(totalMinutes / 60)

    if (hours > 0) return `${hours}h ${minutes}m`

    return `${minutes}m`
}

function updateLimitHud() {
    const size = currentLimitSize()
    quotaEl.textContent = `Limit area: ${size} x ${size} | next +${LIMIT_GROWTH_PER_HOUR} in ${formatWait(msUntilNextLimitHour())}`
    quotaEl.classList.remove('quota-low')
}

function ensureLimitRect() {
    const bounds = currentLimitBounds()

    if (!limitRect) {
        limitRect = new fabric.Rect({
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            fill: 'rgba(0, 255, 127, 0.035)',
            stroke: '#00ff7f',
            strokeWidth: 6,
            strokeDashArray: [18, 12],
            selectable: false,
            evented: false,
            excludeFromExport: true,
            kind: 'limit-area'
        })
        canvas.add(limitRect)
    }

    limitRect.set({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
    })
    limitRect.setCoords()
    canvas.sendToBack(limitRect)
    canvas.requestRenderAll()
}

function refreshLimitArea() {
    resetDailyLimitIfNeeded()
    ensureLimitRect()
    updateLimitHud()
}

function isPointInsideLimit(point) {
    if (isDevName()) return true

    const bounds = currentLimitBounds()

    return point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
}

function isObjectInsideLimit(object) {
    if (isDevName()) return true
    if (!object) return true
    if (object === limitRect || object.kind === 'limit-area') return true

    const bounds = object.getBoundingRect(true, true)

    return isPointInsideLimit({ x: bounds.left, y: bounds.top }) &&
        isPointInsideLimit({ x: bounds.left + bounds.width, y: bounds.top + bounds.height })
}

function markLimitBlocked(object) {
    if (!object) return

    object.set({
        fill: object.type === 'path' ? undefined : 'rgba(180, 180, 180, 0.45)',
        stroke: '#8a8a8a',
        opacity: 0.45,
        selectable: false,
        evented: false
    })

    if (object.type === 'path') {
        object.set({
            stroke: '#8a8a8a',
            opacity: 0.45
        })
    }

    canvas.requestRenderAll()
    sfxBlocked()
    setStatus(`Outside your green area. Wait ${formatWait(msUntilNextLimitHour())} for more space, or use dev skip.`)

    window.setTimeout(() => {
        if (canvas.getObjects().includes(object)) {
            canvas.remove(object)
            canvas.requestRenderAll()
        }
    }, 1800)
}

function privateZoneForObject(object) {
    if (!object || object.kind === 'private-zone' || object.kind === 'limit-area') return null

    // Check if the object's bounding box overlaps any foreign private zone (AABB intersection)
    const br = object.getBoundingRect(true, true)

    return canvas.getObjects().find(candidate => {
        if (candidate.kind !== 'private-zone') return false
        if (candidate.privateOwner === clientId) return false

        const zb = candidate.getBoundingRect(true, true)

        // AABB overlap: two rects overlap if neither is fully to the side/above/below the other
        return br.left < zb.left + zb.width &&
            br.left + br.width > zb.left &&
            br.top < zb.top + zb.height &&
            br.top + br.height > zb.top
    }) || null
}

function markPrivateBlocked(object, zone) {
    if (!object) return

    object.set({
        fill: object.type === 'path' ? undefined : 'rgba(180, 180, 180, 0.45)',
        stroke: '#8a8a8a',
        opacity: 0.45,
        selectable: false,
        evented: false
    })

    if (object.type === 'path') {
        object.set({
            stroke: '#8a8a8a',
            opacity: 0.45
        })
    }

    canvas.requestRenderAll()
    sfxBlocked()
    setStatus(`${zone.ownerName || 'Another user'} owns this private field. Put your elements outside it.`)

    window.setTimeout(() => {
        if (canvas.getObjects().includes(object)) {
            canvas.remove(object)
            canvas.requestRenderAll()
        }
    }, 1800)
}

function clampObjectToLimit(object) {
    if (isDevName()) return false
    if (!object) return false
    if (object === limitRect || object.kind === 'limit-area') return false

    const bounds = currentLimitBounds()

    // Paths: clip path points to limit bounds
    if (object.type === 'path') {
        return clipPathToLimit(object, bounds)
    }

    // For all other objects: clamp position so no part sticks outside
    const br = object.getBoundingRect(true, true)

    // If the object is larger than the limit area in either dimension, it can
    // never fit — reject it immediately
    if (br.width > bounds.width || br.height > bounds.height) {
        return true
    }

    let left = object.left
    let top = object.top

    const overRight = (br.left + br.width) - bounds.right
    const overBottom = (br.top + br.height) - bounds.bottom
    const overLeft = bounds.left - br.left
    const overTop = bounds.top - br.top

    if (overRight > 0) left -= overRight
    if (overBottom > 0) top -= overBottom
    if (overLeft > 0) left += overLeft
    if (overTop > 0) top += overTop

    object.set({ left, top })
    object.setCoords()

    // Verify the object is now fully inside
    return !isObjectInsideLimit(object)
}

function clipPathToLimit(pathObject, bounds) {
    // Get the path commands
    const pathData = pathObject.path
    if (!pathData || !pathData.length) return true

    // Transform path points to absolute canvas coords
    const matrix = pathObject.calcTransformMatrix()

    function transformPoint(x, y) {
        return fabric.util.transformPoint({ x, y }, matrix)
    }

    // Collect line segments from the path, clip each to bounds
    const clippedCommands = []
    let currentX = 0
    let currentY = 0
    let hasVisibleSegment = false

    for (let i = 0; i < pathData.length; i++) {
        const cmd = pathData[i]
        const type = cmd[0].toUpperCase()

        if (type === 'M') {
            const pt = transformPoint(cmd[1], cmd[2])
            currentX = pt.x
            currentY = pt.y
            clippedCommands.push(['M', cmd[1], cmd[2]])
        } else if (type === 'L' || type === 'Q' || type === 'C') {
            // For curves just check if endpoint is inside; keep the command if so
            const lastIdx = cmd.length - 2
            const pt = transformPoint(cmd[lastIdx], cmd[lastIdx + 1])
            const prevInside = isPointInsideLimit({ x: currentX, y: currentY })
            const nextInside = isPointInsideLimit({ x: pt.x, y: pt.y })

            if (prevInside || nextInside) {
                clippedCommands.push(cmd)
                hasVisibleSegment = true
            } else {
                // Both outside — start a new subpath if we continue
                clippedCommands.push(['M', cmd[lastIdx], cmd[lastIdx + 1]])
            }

            currentX = pt.x
            currentY = pt.y
        } else {
            clippedCommands.push(cmd)
        }
    }

    if (!hasVisibleSegment) return true // fully outside, remove

    // Rebuild path with clipped commands — no position change needed
    pathObject.set({ path: clippedCommands })
    pathObject.setCoords()
    return false
}

function rejectIfBlocked(object) {
    if (isDevName()) return false
    if (!object) return false
    if (object === limitRect || object.kind === 'limit-area') return false

    if (!isObjectInsideLimit(object)) {
        // Try to clamp/clip back inside
        const stillBlocked = clampObjectToLimit(object)
        if (stillBlocked) {
            markLimitBlocked(object)
            return true
        }
        // Clamped successfully — object is now fully inside
    }

    const zone = privateZoneForObject(object)
    if (zone && zone.privateOwner !== clientId) {
        markPrivateBlocked(object, zone)
        return true
    }

    return false
}

function isDevName() {
    return isDevMode
}

function updateDevTools() {
    const enabled = isDevName()

    devHint.hidden = !enabled
    devConsole.hidden = !enabled || devConsoleClosed
    eraseAllBtn.hidden = !enabled
    skipLimitBtn.hidden = !enabled
    resetLimitBtn.hidden = !enabled
    maxLimitBtn.hidden = !enabled
    clearChatBtn.hidden = !enabled
    resetLimitAllBtn.hidden = !enabled

    if (enabled && !devConsoleWasEnabled) {
        devConsoleClosed = false
        devConsole.hidden = false
        devConsoleMinimized = false
        devConsoleMaximized = false
        devConsole.classList.remove('minimized', 'maximized')
        centerDevConsole()
    }

    devConsoleWasEnabled = enabled
}

function updateLocalCursorStyle() {
    if (!localCursor) return
    const isDev = isDevName()
    localCursor.classList.toggle('dev-cursor', isDev)
    localCursorName.textContent = userName
    if (!isDev) {
        localCursorArrow.style.borderTopColor = userColor
        localCursorName.style.background = userColor
    } else {
        localCursorArrow.style.borderTopColor = ''
        localCursorName.style.background = ''
    }
}

function centerDevConsole() {
    devConsole.hidden = false
    const left = (window.innerWidth - devConsole.offsetWidth) / 2
    const top = (window.innerHeight - devConsole.offsetHeight) / 2

    moveDevConsole(left, top)
}

function restoreDevConsolePosition() {
    const saved = sessionStorage.getItem('metaspace-dev-console-position')
    if (!saved) return

    try {
        const pos = JSON.parse(saved)
        devConsole.style.left = `${pos.left}px`
        devConsole.style.top = `${pos.top}px`
        devConsole.style.right = 'auto'
        devConsole.style.bottom = 'auto'
    } catch {
        sessionStorage.removeItem('metaspace-dev-console-position')
    }
}

function moveDevConsole(left, top) {
    if (devConsoleMaximized) return

    const maxLeft = window.innerWidth - devConsole.offsetWidth
    const maxTop = window.innerHeight - devConsole.offsetHeight
    const nextLeft = Math.max(0, Math.min(maxLeft, left))
    const nextTop = Math.max(0, Math.min(maxTop, top))

    devConsole.style.left = `${nextLeft}px`
    devConsole.style.top = `${nextTop}px`
    devConsole.style.right = 'auto'
    devConsole.style.bottom = 'auto'
    sessionStorage.setItem('metaspace-dev-console-position', JSON.stringify({
        left: nextLeft,
        top: nextTop
    }))
}

devConsoleHeader.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button')) return

    const rect = devConsole.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    function onMove(moveEvent) {
        moveDevConsole(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY)
    }

    function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
})

restoreDevConsolePosition()

function toggleDevConsole() {
    if (!isDevName()) return

    devConsoleClosed = !devConsole.hidden
    devConsole.hidden = devConsoleClosed

    if (!devConsoleClosed && !sessionStorage.getItem('metaspace-dev-console-position')) {
        centerDevConsole()
    }
}

devCloseBtn.onclick = () => {
    devConsoleClosed = true
    devConsole.hidden = true
}

devMinBtn.onclick = () => {
    devConsoleMinimized = !devConsoleMinimized
    devConsole.classList.toggle('minimized', devConsoleMinimized)
}

devMaxBtn.onclick = () => {
    devConsoleMaximized = !devConsoleMaximized
    devConsole.classList.toggle('maximized', devConsoleMaximized)

    if (devConsoleMaximized) {
        devConsole.style.left = '24px'
        devConsole.style.top = '24px'
        devConsole.style.right = '24px'
        devConsole.style.bottom = '24px'
    } else {
        restoreDevConsolePosition()
    }
}

function setUserName(nextName) {
    const cleanName = nextName.trim().slice(0, 24) || 'Guest'

    userName = cleanName
    nameInput.value = cleanName
    localStorage.setItem('metaspace-name', cleanName)
    sessionStorage.setItem('metaspace-name', cleanName)
    updateDevTools()
    updateLocalCursorStyle()

    canvas.getObjects().forEach(object => {
        if (object.ownerId === clientId) {
            object.ownerName = cleanName
        }
    })

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'profile',
            name: cleanName,
            color: userColor,
            dev: isDevMode
        }))
    }

    sync('edit')
}

function resize() {
    canvas.setWidth(window.innerWidth)
    canvas.setHeight(window.innerHeight)
    updateCoords()
    updateCursorScreens()
}

resize()
window.addEventListener('resize', resize)

function setMode(newMode) {
    mode = newMode
    canvas.selection = true
    canvas.isDrawingMode = mode === 'draw' || mode === 'erase'

    if (mode === 'draw') {
        canvas.freeDrawingBrush.color = colorPicker.value
        canvas.freeDrawingBrush.width = Number(brushSize.value)
    }

    if (mode === 'erase') {
        canvas.freeDrawingBrush.color = '#0b0b0f'
        canvas.freeDrawingBrush.width = Number(brushSize.value)
    }

    const isDrawMode = mode === 'draw'
    colorPicker.style.display = isDrawMode ? 'inline-block' : 'none'
    brushSize.style.display = (mode === 'draw' || mode === 'erase') ? 'inline-block' : 'none'

    // Highlight active tool button
    selectBtn.classList.toggle('active-tool', mode === 'select')
    drawBtn.classList.toggle('active-tool', mode === 'draw')
    eraseBtn.classList.toggle('active-tool', mode === 'erase')
}

selectBtn.onclick = () => setMode('select')
drawBtn.onclick = () => setMode('draw')
eraseBtn.onclick = () => setMode('erase')

colorPicker.addEventListener('input', (e) => {
    if (mode === 'draw') {
        canvas.freeDrawingBrush.color = e.target.value
    }
})

brushSize.addEventListener('input', () => {
    canvas.freeDrawingBrush.width = Number(brushSize.value)
})

function getWorldCoords() {
    const v = canvas.viewportTransform

    return {
        x: Math.round(-v[4] / v[0]),
        y: Math.round(-v[5] / v[3])
    }
}

function updateCoords() {
    const pos = getWorldCoords()
    coordsEl.textContent = `room: ${room} | x: ${pos.x}, y: ${pos.y}`
}

function saveCameraPosition() {
    const vpt = canvas.viewportTransform
    sessionStorage.setItem('metaspace-camera', JSON.stringify({
        transform: vpt,
        zoom: canvas.getZoom()
    }))
}

function restoreCameraPosition() {
    const saved = sessionStorage.getItem('metaspace-camera')
    if (!saved) return

    try {
        const data = JSON.parse(saved)
        if (data.transform && Array.isArray(data.transform)) {
            canvas.setViewportTransform(data.transform)
            canvas.requestRenderAll()
            updateCoords()
            updateCursorScreens()
        }
    } catch (e) {
        console.log('Failed to restore camera position:', e)
        sessionStorage.removeItem('metaspace-camera')
    }
}

function teleport(x, y) {
    const z = canvas.getZoom()

    canvas.setViewportTransform([z, 0, 0, z, -x * z, -y * z])
    canvas.requestRenderAll()
    updateCoords()
    updateCursorScreens()
    saveCameraPosition()
}

function parseCoords(value) {
    const parts = value.trim().split(/[,\s]+/).map(Number)
    if (parts.length < 2 || parts.some(Number.isNaN)) return null

    return { x: parts[0], y: parts[1] }
}

goBtn.onclick = () => {
    const pos = parseCoords(teleportInput.value)
    if (!pos) return

    teleport(pos.x, pos.y)
}

teleportInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goBtn.click()
})

copyBtn.onclick = async () => {
    const pos = getWorldCoords()
    const text = `${pos.x},${pos.y}`

    teleportInput.value = text

    try {
        if (navigator.clipboard) await navigator.clipboard.writeText(text)
    } catch {
        setStatus('Copied into the coordinate box.')
    }
}

function zoomBy(factor) {
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * factor))

    canvas.zoomToPoint(center, nextZoom)
    updateCoords()
    updateCursorScreens()
    saveCameraPosition()
}

zoomInBtn.onclick = () => zoomBy(1.2)
zoomOutBtn.onclick = () => zoomBy(1 / 1.2)
zoomResetBtn.onclick = () => {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    updateCoords()
    updateCursorScreens()
    saveCameraPosition()
}

let ambientMuted = false
muteBtn.onclick = () => {
    ambientMuted = !ambientMuted
    muteBtn.textContent = ambientMuted ? '🔇' : '🔊'
    muteBtn.title = ambientMuted ? 'Unmute ambient music' : 'Mute ambient music'
    setAmbientVolume(ambientMuted ? 0 : 0.18)
}

nameBtn.onclick = () => setUserName(nameInput.value)

nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setUserName(nameInput.value)
})

skipLimitBtn.onclick = () => {
    if (!isDevName()) return

    limitBonusHours += 1
    saveLimitState()
    refreshLimitArea()
    setStatus(`Limit expanded to ${currentLimitSize()} x ${currentLimitSize()}.`)
}

resetLimitBtn.onclick = () => {
    if (!isDevName()) return

    resetLimitState()
    setStatus('Your limit area was reset for today.')
}

maxLimitBtn.onclick = () => {
    if (!isDevName()) return

    limitBonusHours = Math.ceil((LIMIT_MAX_SIZE - LIMIT_BASE_SIZE) / LIMIT_GROWTH_PER_HOUR)
    saveLimitState()
    refreshLimitArea()
    setStatus(`Limit expanded to max: ${LIMIT_MAX_SIZE} x ${LIMIT_MAX_SIZE}.`)
}

eraseAllBtn.onclick = () => {
    if (!isDevName()) return
    if (!confirm('Erase everything in this room?')) return

    canvas.clear()
    limitRect = null
    refreshLimitArea()
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    history = []
    historyIndex = -1
    updateEmptyHint()
    sync('edit')
    setStatus('Board erased.')
}

clearChatBtn.onclick = () => {
    if (!isDevName()) return
    if (!confirm('Clear chat for everyone in this room?')) return

    if (socket.readyState !== WebSocket.OPEN) {
        setStatus('Not connected.')
        return
    }

    socket.send(JSON.stringify({ type: 'dev_clear_chat' }))
}

resetLimitAllBtn.onclick = () => {
    if (!isDevName()) return
    if (!confirm('Reset the limit area for everyone in this room?')) return

    if (socket.readyState !== WebSocket.OPEN) {
        setStatus('Not connected.')
        return
    }

    socket.send(JSON.stringify({ type: 'dev_reset_limit' }))
}

function canEditObject(object) {
    if (!object) return true
    if (object.locked && object.ownerId !== clientId) return false
    if (object.privateOwner && object.privateOwner !== clientId) return false

    return true
}

function applyObjectRules(object) {
    if (!object) return
    if (object === limitRect || object.kind === 'limit-area') return

    const editable = canEditObject(object)

    object.selectable = editable
    object.evented = editable
    object.lockMovementX = !editable
    object.lockMovementY = !editable
    object.lockScalingX = !editable
    object.lockScalingY = !editable
    object.lockRotation = !editable

    if (object.kind === 'private-zone') {
        object.selectable = object.privateOwner === clientId
        object.evented = object.privateOwner === clientId
    }
}

function applyBoardRules() {
    stylePrivateZones()
    canvas.getObjects().forEach(applyObjectRules)
}

function getOtherPrivateColor(zone) {
    const color = normalizeUserColor(zone.ownerColor || zone.stroke, zone.privateOwner || zone.ownerId)

    if (String(color).toLowerCase() === OWN_PRIVATE_COLOR) {
        return colorForId(zone.privateOwner || zone.ownerId || 'other')
    }

    return color
}

function transparentColor(color) {
    const match = String(color).match(/^#([0-9a-f]{6})$/i)
    if (!match) return 'rgba(255, 255, 255, 0.12)'

    const value = match[1]
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)

    return `rgba(${r}, ${g}, ${b}, 0.14)`
}

function stylePrivateZone(zone) {
    if (zone.kind !== 'private-zone') return

    zone.ownerColor = normalizeUserColor(zone.ownerColor || zone.stroke, zone.privateOwner || zone.ownerId)

    const color = zone.privateOwner === clientId ? OWN_PRIVATE_COLOR : getOtherPrivateColor(zone)

    zone.set({
        fill: transparentColor(color),
        stroke: color,
        strokeDashArray: zone.privateOwner === clientId ? [8, 6] : [3, 7],
        strokeWidth: zone.privateOwner === clientId ? 2 : 3,
        opacity: 1
    })
}

function stylePrivateZones() {
    canvas.getObjects().forEach(stylePrivateZone)
}

function ensureObjectIdentity(object) {
    if (object === limitRect || object.kind === 'limit-area') return

    if (!object.id) object.id = Math.random().toString(36).slice(2, 10)
    // Only stamp ownerId when creating locally — never overwrite during a server board load
    if (!object.ownerId && !loading) object.ownerId = clientId
    if (!object.ownerName && !loading) object.ownerName = userName
}

function getObjectCenter(object) {
    const point = object.getCenterPoint()
    return { x: point.x, y: point.y }
}

function isPointInRect(point, rect) {
    const bounds = rect.getBoundingRect(true, true)

    return point.x >= bounds.left &&
        point.x <= bounds.left + bounds.width &&
        point.y >= bounds.top &&
        point.y <= bounds.top + bounds.height
}

function markPrivateOwnership() {
    const zones = canvas.getObjects().filter(object => object.kind === 'private-zone')

    canvas.getObjects().forEach(object => {
        if (object.kind === 'private-zone' || object.kind === 'limit-area') return

        const zone = zones.find(privateZone => isPointInRect(getObjectCenter(object), privateZone))

        if (zone && zone.privateOwner === clientId) {
            object.privateOwner = zone.privateOwner
        } else if (!zone || object.privateOwner === clientId) {
            object.privateOwner = undefined
        }
    })
}

function getViewCenter() {
    const vpt = canvas.viewportTransform
    const zoom = canvas.getZoom()

    return {
        x: Math.round((canvas.getWidth() / 2 - vpt[4]) / zoom),
        y: Math.round((canvas.getHeight() / 2 - vpt[5]) / zoom)
    }
}

function createNote() {
    const pos = getViewCenter()
    const note = new fabric.Textbox('Note', {
        left: pos.x,
        top: pos.y,
        width: 200,
        fontSize: 16,
        fill: '#000',
        backgroundColor: '#ffeb3b',
        padding: 10,
        ownerId: clientId,
        ownerName: userName
    })

    ensureObjectIdentity(note)
    canvas.add(note)
    if (rejectIfBlocked(note)) return

    canvas.setActiveObject(note)
    note.enterEditing()
    note.selectAll()
    sync('edit')
}

function getWorldBounds(object) {
    // Returns the object's bounding box in world (canvas) coordinates,
    // independent of the current viewport transform / zoom.
    const zoom = canvas.getZoom()
    const vpt = canvas.viewportTransform
    const br = object.getBoundingRect(true, true) // screen-space pixels

    return {
        left: (br.left - vpt[4]) / zoom,
        top: (br.top - vpt[5]) / zoom,
        width: br.width / zoom,
        height: br.height / zoom
    }
}

function worldBoundsOverlap(a, b) {
    return !(
        a.left + a.width <= b.left ||
        a.left >= b.left + b.width ||
        a.top + a.height <= b.top ||
        a.top >= b.top + b.height
    )
}

function zoneOverlapsForeignObjects(zone) {
    zone.setCoords()
    const zoneBounds = getWorldBounds(zone)

    return canvas.getObjects().some(obj => {
        if (obj === zone) return false
        if (obj === limitRect || obj.kind === 'limit-area' || obj.kind === 'private-zone') return false
        // Only block if the object has an ownerId that is explicitly someone else's
        if (!obj.ownerId || obj.ownerId === clientId) return false

        obj.setCoords()
        return worldBoundsOverlap(zoneBounds, getWorldBounds(obj))
    })
}

function createPrivateZone() {
    const pos = getViewCenter()
    const zone = new fabric.Rect({
        left: pos.x,
        top: pos.y,
        width: 360,
        height: 240,
        fill: transparentColor(OWN_PRIVATE_COLOR),
        stroke: OWN_PRIVATE_COLOR,
        strokeDashArray: [8, 6],
        strokeWidth: 2,
        ownerId: clientId,
        ownerName: userName,
        ownerColor: userColor,
        privateOwner: clientId,
        kind: 'private-zone'
    })

    ensureObjectIdentity(zone)
    canvas.add(zone)
    if (rejectIfBlocked(zone)) return

    if (zoneOverlapsForeignObjects(zone)) {
        canvas.remove(zone)
        canvas.requestRenderAll()
        setStatus("Can't create a private zone over another user's objects.")
        return
    }

    canvas.sendToBack(zone)
    ensureLimitRect()
    canvas.setActiveObject(zone)
    sync('edit')
}

noteBtn.onclick = () => { createNote(); sfxNote() }
privateBtn.onclick = createPrivateZone

lockBtn.onclick = () => {
    const active = canvas.getActiveObject()
    if (!active) return
    if (active.ownerId !== clientId) {
        setStatus('Only the owner can lock this.')
        return
    }

    active.locked = !active.locked
    active.set('stroke', active.locked ? '#ffcc66' : active.stroke)
    canvas.requestRenderAll()
    sync('edit')
    if (active.locked) { sfxLock(); setStatus('Locked.') }
    else { sfxUnlock(); setStatus('Unlocked.') }
}

undoBtn.onclick = () => {
    if (historyIndex <= 0) return
    sfxUndo()
    historyIndex -= 1
    loadBoard(history[historyIndex], true)
}

const redoBtn = document.getElementById('redoBtn')
redoBtn.onclick = () => {
    if (historyIndex >= history.length - 1) return
    sfxRedo()
    historyIndex += 1
    loadBoard(history[historyIndex], true)
}

uploadBtn.onclick = () => imageInput.click()

imageInput.addEventListener('change', e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
        setStatus('Image is too large. Use an image under 1 MB.')
        imageInput.value = ''
        return
    }

    const reader = new FileReader()

    reader.onload = f => {
        fabric.Image.fromURL(f.target.result, img => {
            const pos = getViewCenter()

            img.set({
                left: pos.x,
                top: pos.y,
                scaleX: 0.5,
                scaleY: 0.5,
                ownerId: clientId,
                ownerName: userName
            })

            ensureObjectIdentity(img)
            canvas.add(img)
            if (rejectIfBlocked(img)) return

            sfxUpload()
            sync('edit')
        })
    }

    reader.readAsDataURL(file)
    imageInput.value = ''
})

// CHAT FUNCTIONALITY

function centerChatWindow() {
    chatContainer.hidden = false
    const left = (window.innerWidth - chatContainer.offsetWidth) / 2
    const top = (window.innerHeight - chatContainer.offsetHeight) / 2

    moveChatWindow(left, top)
}

function restoreChatPosition() {
    const saved = sessionStorage.getItem('metaspace-chat-position')

    // Always clear right/bottom so left/top take effect
    chatContainer.style.right = 'auto'
    chatContainer.style.bottom = 'auto'

    if (!saved) return

    try {
        const pos = JSON.parse(saved)
        chatContainer.style.left = `${pos.left}px`
        chatContainer.style.top = `${pos.top}px`
    } catch {
        sessionStorage.removeItem('metaspace-chat-position')
    }
}

function moveChatWindow(left, top) {
    if (chatMaximized) return

    const maxLeft = window.innerWidth - chatContainer.offsetWidth
    const maxTop = window.innerHeight - chatContainer.offsetHeight
    const nextLeft = Math.max(0, Math.min(maxLeft, left))
    const nextTop = Math.max(0, Math.min(maxTop, top))

    chatContainer.style.left = `${nextLeft}px`
    chatContainer.style.top = `${nextTop}px`
    chatContainer.style.right = 'auto'
    chatContainer.style.bottom = 'auto'
    sessionStorage.setItem('metaspace-chat-position', JSON.stringify({
        left: nextLeft,
        top: nextTop
    }))
}

chatHeader.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button')) return

    const rect = chatContainer.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    function onMove(moveEvent) {
        moveChatWindow(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY)
    }

    function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
})

restoreChatPosition()

function toggleChatWindow() {
    chatClosed = chatContainer.hidden
    chatContainer.hidden = !chatClosed
    sessionStorage.setItem('metaspace-chat-closed', String(!chatClosed))

    if (!chatContainer.hidden && !sessionStorage.getItem('metaspace-chat-position')) {
        centerChatWindow()
    }
}

chatCloseBtn.onclick = () => {
    chatClosed = true
    chatContainer.hidden = true
    sessionStorage.setItem('metaspace-chat-closed', 'true')
}

chatMinBtn.onclick = () => {
    chatMinimized = !chatMinimized
    chatContainer.classList.toggle('minimized', chatMinimized)
    sessionStorage.setItem('metaspace-chat-minimized', String(chatMinimized))
}

chatMaxBtn.onclick = () => {
    chatMaximized = !chatMaximized
    chatContainer.classList.toggle('maximized', chatMaximized)
    sessionStorage.setItem('metaspace-chat-maximized', String(chatMaximized))

    if (chatMaximized) {
        chatContainer.style.left = '24px'
        chatContainer.style.top = '24px'
        chatContainer.style.right = '24px'
        chatContainer.style.bottom = '24px'
    } else {
        restoreChatPosition()
    }
}

emojiToggleBtn.onclick = () => {
    emojiPicker.classList.toggle('show')
}

emojiButtons.forEach(btn => {
    btn.onclick = () => {
        const emoji = btn.dataset.emoji
        chatInput.value += emoji
        chatInput.focus()
    }
})

function sendChatMessage() {
    const text = chatInput.value.trim()
    if (!text) return
    if (socket.readyState !== WebSocket.OPEN) {
        setStatus('Not connected to server.')
        return
    }

    const message = {
        type: 'chat',
        text: text,
        name: userName,
        color: userColor,
        id: clientId,
        dev: isDevMode
    }

    socket.send(JSON.stringify(message))

    // Display own message immediately
    addChatMessage(message)

    chatInput.value = ''
    emojiPicker.classList.remove('show')
}

chatSendBtn.onclick = sendChatMessage

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage()
        e.preventDefault()
    }
})

function saveChatHistory() {
    const messages = []
    chatMessages.querySelectorAll('.chat-message').forEach(el => {
        const nameEl = el.querySelector('.chat-message-name')
        const textEl = el.querySelector('.chat-message-text')
        if (!nameEl || !textEl) return
        messages.push({
            name: nameEl.dataset.name,
            text: textEl.dataset.text,
            color: nameEl.dataset.color,
            id: nameEl.dataset.id
        })
    })
    sessionStorage.setItem('metaspace-chat-history', JSON.stringify(messages))
}

function loadChatHistory() {
    const saved = sessionStorage.getItem('metaspace-chat-history')
    if (!saved) return
    try {
        const messages = JSON.parse(saved)
        messages.forEach(msg => addChatMessage(msg, false))
    } catch {
        sessionStorage.removeItem('metaspace-chat-history')
    }
}

function addChatMessage(msg, save = true) {
    const messageEl = document.createElement('div')
    messageEl.className = 'chat-message'

    const color = normalizeUserColor(msg.color, msg.id)
    const name = msg.name || 'Guest'
    const isDev = msg.dev === true

    const nameSpan = document.createElement('span')
    nameSpan.className = 'chat-message-name'
    nameSpan.dataset.name = name
    nameSpan.dataset.color = msg.color || ''
    nameSpan.dataset.id = msg.id || ''
    if (isDev) nameSpan.classList.add('dev-name')
    nameSpan.style.color = isDev ? '#00ff7f' : color
    nameSpan.textContent = name + ':'

    const textSpan = document.createElement('span')
    textSpan.className = 'chat-message-text'
    textSpan.dataset.text = msg.text
    textSpan.textContent = ' ' + msg.text

    messageEl.appendChild(nameSpan)

    if (isDev) {
        const badge = document.createElement('span')
        badge.className = 'chat-dev-badge'
        badge.textContent = 'DEV'
        messageEl.appendChild(badge)
    }

    messageEl.appendChild(textSpan)

    chatMessages.appendChild(messageEl)
    chatMessages.scrollTop = chatMessages.scrollHeight

    // Keep only last 50 messages
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild)
    }

    if (save) saveChatHistory()
}

loadChatHistory()

canvas.on('mouse:down', (opt) => {
    if (mode !== 'select') return
    if (opt.target) return

    isPanning = true
    lastPanX = opt.e.clientX
    lastPanY = opt.e.clientY
    canvas.selection = false
})

canvas.on('mouse:move', (opt) => {
    sendCursor(opt)

    if (!isPanning) return

    const e = opt.e
    const v = canvas.viewportTransform

    v[4] += e.clientX - lastPanX
    v[5] += e.clientY - lastPanY

    canvas.setViewportTransform(v)
    updateCoords()
    updateCursorScreens()

    lastPanX = e.clientX
    lastPanY = e.clientY
})

canvas.on('mouse:up', () => {
    if (isPanning) {
        saveCameraPosition()
    }
    isPanning = false
    canvas.selection = true
})

canvas.on('mouse:wheel', (opt) => {
    const delta = opt.e.deltaY
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * (0.999 ** delta)))

    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom)
    updateCoords()
    updateCursorScreens()
    saveCameraPosition()
    opt.e.preventDefault()
    opt.e.stopPropagation()
})

window.addEventListener('keydown', (e) => {
    if (e.key === 'F10') {
        toggleDevConsole()
        e.preventDefault()
        return
    }

    if (e.key === 'F9') {
        toggleChatWindow()
        e.preventDefault()
        return
    }

    if (document.activeElement.tagName === 'INPUT') return

    const active = canvas.getActiveObject()
    if (active && active.isEditing) return

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        undoBtn.click()
        e.preventDefault()
        return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redoBtn.click()
        e.preventDefault()
        return
    }

    if (e.key !== 'Backspace' && e.key !== 'Delete') return

    const objs = canvas.getActiveObjects().filter(canEditObject)
    if (!objs.length) return

    objs.forEach(o => canvas.remove(o))
    canvas.discardActiveObject()
    canvas.requestRenderAll()

    sync('edit')
    e.preventDefault()
})

function pushHistory(data) {
    const snapshot = JSON.stringify(data)

    if (history[historyIndex] === snapshot) return

    history = history.slice(0, historyIndex + 1)
    history.push(snapshot)

    if (history.length > 30) history.shift()
    historyIndex = history.length - 1
}

const emptyHint = document.getElementById('emptyHint')

function updateEmptyHint() {
    const hasRealObjects = canvas.getObjects().some(
        o => o !== limitRect && o.kind !== 'limit-area' && o.kind !== 'private-zone'
    )
    emptyHint.classList.toggle('hidden', hasRealObjects)
}

function loadBoard(data, shouldSync) {
    loading = true

    canvas.loadFromJSON(data, () => {
        canvas.renderAll()
        refreshLimitArea()
        applyBoardRules()
        loading = false
        readyToSync = true
        pushHistory(canvas.toJSON(customProps))
        updateEmptyHint()

        // Restore camera position after initial board load
        if (!shouldSync) {
            // Use setTimeout to ensure it happens after all rendering is complete
            setTimeout(() => {
                restoreCameraPosition()
            }, 100)
        }

        if (shouldSync) sync('edit')
    })
}

function sync(action) {
    if (loading) return
    if (!readyToSync) return
    if (socket.readyState !== WebSocket.OPEN) return

    canvas.getObjects().forEach(ensureObjectIdentity)
    markPrivateOwnership()
    stylePrivateZones()
    applyBoardRules()
    pushHistory(canvas.toJSON(customProps))

    socket.send(JSON.stringify({
        type: 'update',
        action,
        data: canvas.toJSON(customProps)
    }))
}

canvas.on('path:created', (event) => {
    ensureObjectIdentity(event.path)
    if (rejectIfBlocked(event.path)) return

    sync('draw')
})
canvas.on('object:added', (event) => {
    if (event.target === limitRect || event.target.kind === 'limit-area') return

    ensureObjectIdentity(event.target)
    updateEmptyHint()
})

// ── Live limit enforcement during drag / scale / rotate ───────────────────────

function clampLive(object) {
    if (isDevName()) return
    if (!object) return
    if (object === limitRect || object.kind === 'limit-area') return

    const bounds = currentLimitBounds()
    const br = object.getBoundingRect(true, true)

    let left = object.left
    let top = object.top

    const overRight = (br.left + br.width) - bounds.right
    const overBottom = (br.top + br.height) - bounds.bottom
    const overLeft = bounds.left - br.left
    const overTop = bounds.top - br.top

    if (overRight > 0) left -= overRight
    if (overBottom > 0) top -= overBottom
    if (overLeft > 0) left += overLeft
    if (overTop > 0) top += overTop

    object.set({ left, top })
    object.setCoords()
}

function clampScaleLive(object) {
    if (isDevName()) return
    if (!object) return
    if (object === limitRect || object.kind === 'limit-area') return

    const bounds = currentLimitBounds()
    const br = object.getBoundingRect(true, true)

    // If after scaling the object overflows, shrink the scale to fit
    const maxW = bounds.right - bounds.left
    const maxH = bounds.bottom - bounds.top

    let scaleX = object.scaleX
    let scaleY = object.scaleY

    if (br.width > maxW) scaleX *= maxW / br.width
    if (br.height > maxH) scaleY *= maxH / br.height

    if (scaleX !== object.scaleX || scaleY !== object.scaleY) {
        object.set({ scaleX, scaleY })
        object.setCoords()
    }

    // Then clamp position
    clampLive(object)
}

// Push object out of any foreign private zone it overlaps.
// Finds the axis with the smallest overlap and nudges the object out that way.
function pushOutOfPrivateZones(object) {
    if (isDevName()) return
    if (!object) return
    if (object.kind === 'private-zone' || object.kind === 'limit-area') return

    const zones = canvas.getObjects().filter(
        c => c.kind === 'private-zone' && c.privateOwner !== clientId
    )

    for (const zone of zones) {
        const br = object.getBoundingRect(true, true)
        const zb = zone.getBoundingRect(true, true)

        // No overlap — skip
        if (br.left >= zb.left + zb.width ||
            br.left + br.width <= zb.left ||
            br.top >= zb.top + zb.height ||
            br.top + br.height <= zb.top) continue

        // Compute overlap on each axis
        const overlapLeft = (br.left + br.width) - zb.left          // push left
        const overlapRight = (zb.left + zb.width) - br.left          // push right
        const overlapTop = (br.top + br.height) - zb.top           // push up
        const overlapBottom = (zb.top + zb.height) - br.top           // push down

        // Pick the axis with the smallest penetration depth
        const minH = Math.min(overlapLeft, overlapRight)
        const minV = Math.min(overlapTop, overlapBottom)

        let left = object.left
        let top = object.top

        if (minH <= minV) {
            // Resolve horizontally
            if (overlapLeft < overlapRight) {
                left -= overlapLeft   // push object to the left of the zone
            } else {
                left += overlapRight  // push object to the right of the zone
            }
        } else {
            // Resolve vertically
            if (overlapTop < overlapBottom) {
                top -= overlapTop     // push object above the zone
            } else {
                top += overlapBottom  // push object below the zone
            }
        }

        object.set({ left, top })
        object.setCoords()

        // After resolving one zone, re-clamp to limit so we don't escape it
        clampLive(object)
    }
}

canvas.on('object:moving', (e) => {
    clampLive(e.target)
    pushOutOfPrivateZones(e.target)
})

canvas.on('object:scaling', (e) => {
    clampScaleLive(e.target)
    pushOutOfPrivateZones(e.target)
})

canvas.on('object:rotating', (e) => {
    // After rotation the bounding box changes — clamp position to keep it inside
    clampLive(e.target)
    pushOutOfPrivateZones(e.target)
})

// ─────────────────────────────────────────────────────────────────────────────

canvas.on('object:modified', (event) => {
    // Final hard check after mouse-up (catches anything live clamping missed)
    if (rejectIfBlocked(event.target)) return

    // If a private zone was moved/resized, make sure it doesn't now cover other users' objects
    if (event.target.kind === 'private-zone' && event.target.privateOwner === clientId) {
        if (zoneOverlapsForeignObjects(event.target)) {
            // Snap back to the last known good state
            const last = history[historyIndex]
            if (last) {
                loadBoard(JSON.parse(last), false)
            }
            setStatus("Can't place a private zone over another user's objects.")
            return
        }
    }

    markPrivateOwnership()
    applyBoardRules()
    sync('edit')
})
canvas.on('object:removed', () => { updateEmptyHint(); sync('edit') })
canvas.on('text:changed', () => sync('edit'))

function sendCursor(opt) {
    const now = Date.now()
    const point = canvas.getPointer(opt.e)

    lastCursorWorldPos = {
        x: Math.round(point.x),
        y: Math.round(point.y)
    }

    if (now - lastCursorSent < 50) return
    if (socket.readyState !== WebSocket.OPEN) return

    lastCursorSent = now

    socket.send(JSON.stringify({
        type: 'cursor',
        x: lastCursorWorldPos.x,
        y: lastCursorWorldPos.y
    }))
}

function worldToScreen(point) {
    const v = canvas.viewportTransform

    return {
        x: point.x * v[0] + v[4],
        y: point.y * v[3] + v[5]
    }
}

// Margin from the viewport edge where the indicator sits
const OFFSCREEN_MARGIN = 28

function updateCursorScreens() {
    const W = window.innerWidth
    const H = window.innerHeight

    cursorLayer.querySelectorAll('.remote-cursor').forEach(el => {
        const point = { x: Number(el.dataset.worldX), y: Number(el.dataset.worldY) }
        const screen = worldToScreen(point)
        const offEl = document.getElementById(`offscreen-${el.id}`)

        const onScreen =
            screen.x >= 0 && screen.x <= W &&
            screen.y >= 0 && screen.y <= H

        if (onScreen) {
            // Show normal cursor, hide indicator
            el.style.transform = `translate(${screen.x}px, ${screen.y}px)`
            el.style.opacity = '1'
            if (offEl) offEl.style.opacity = '0'
        } else {
            // Hide normal cursor, show edge indicator
            el.style.opacity = '0'
            if (!offEl) return

            // Clamp the screen position to the viewport edge with margin
            const ARROW = 8 // half-size of the triangle
            const mx = OFFSCREEN_MARGIN
            const cx = Math.max(mx, Math.min(W - mx, screen.x))
            const cy = Math.max(mx, Math.min(H - mx, screen.y))

            // Determine which edge the user is beyond and set arrow direction
            const beyondLeft = screen.x < 0
            const beyondRight = screen.x > W
            const beyondTop = screen.y < 0
            const beyondBottom = screen.y > H

            // Arrow border trick: point toward the off-screen user
            const arrowEl = offEl.querySelector('.cursor-offscreen-arrow')
            arrowEl.style.borderTop = ''
            arrowEl.style.borderBottom = ''
            arrowEl.style.borderLeft = ''
            arrowEl.style.borderRight = ''

            const color = el.dataset.color || '#66d9ff'

            let posX = cx
            let posY = cy
            let translateX = '-50%'
            let translateY = '-50%'

            if (beyondLeft && !beyondTop && !beyondBottom) {
                // User is to the left → arrow points left, pin to left edge
                posX = mx
                arrowEl.style.borderTop = `${ARROW}px solid transparent`
                arrowEl.style.borderBottom = `${ARROW}px solid transparent`
                arrowEl.style.borderRight = `${ARROW * 1.4}px solid ${color}`
                translateX = '0'
            } else if (beyondRight && !beyondTop && !beyondBottom) {
                // User is to the right → arrow points right, pin to right edge
                posX = W - mx
                arrowEl.style.borderTop = `${ARROW}px solid transparent`
                arrowEl.style.borderBottom = `${ARROW}px solid transparent`
                arrowEl.style.borderLeft = `${ARROW * 1.4}px solid ${color}`
                translateX = '-100%'
            } else if (beyondTop) {
                // User is above → arrow points up, pin to top edge
                posY = mx
                arrowEl.style.borderLeft = `${ARROW}px solid transparent`
                arrowEl.style.borderRight = `${ARROW}px solid transparent`
                arrowEl.style.borderBottom = `${ARROW * 1.4}px solid ${color}`
                translateY = '0'
            } else {
                // User is below → arrow points down, pin to bottom edge
                posY = H - mx
                arrowEl.style.borderLeft = `${ARROW}px solid transparent`
                arrowEl.style.borderRight = `${ARROW}px solid transparent`
                arrowEl.style.borderTop = `${ARROW * 1.4}px solid ${color}`
                translateY = '-100%'
            }

            offEl.style.left = `${posX}px`
            offEl.style.top = `${posY}px`
            offEl.style.transform = `translate(${translateX}, ${translateY})`
            offEl.style.opacity = '1'
        }
    })
}

function applyCursorStyle(id, name, color, dev) {
    let el = document.getElementById(`cursor-${id}`)
    if (!el) {
        el = document.createElement('div')
        el.id = `cursor-${id}`
        el.className = 'remote-cursor'
        el.innerHTML = '<div class="cursor-arrow"></div><div class="cursor-name"></div>'
        // Hide until we get a real position
        el.style.display = 'none'
        cursorLayer.appendChild(el)

        const offEl = document.createElement('div')
        offEl.id = `offscreen-cursor-${id}`
        offEl.className = 'cursor-offscreen'
        offEl.innerHTML = '<div class="cursor-offscreen-arrow"></div><div class="cursor-offscreen-name"></div>'
        offEl.style.opacity = '0'
        document.body.appendChild(offEl)
    }

    const isDevCursor = dev === true
    const normalizedColor = normalizeUserColor(color, id)

    el.dataset.color = normalizedColor
    el.dataset.dev = isDevCursor ? '1' : '0'
    el.classList.toggle('dev-cursor', isDevCursor)
    el.querySelector('.cursor-name').textContent = name
    el.querySelector('.cursor-arrow').style.borderTopColor = isDevCursor ? '' : normalizedColor
    el.querySelector('.cursor-name').style.background = isDevCursor ? '' : normalizedColor

    const offEl = document.getElementById(`offscreen-cursor-${id}`)
    if (offEl) {
        offEl.querySelector('.cursor-offscreen-name').textContent = name
        offEl.querySelector('.cursor-offscreen-name').style.background = normalizedColor
        offEl.dataset.id = id
    }
}

function showCursor(msg) {
    let el = document.getElementById(`cursor-${msg.id}`)

    if (!el) {
        el = document.createElement('div')
        el.id = `cursor-${msg.id}`
        el.className = 'remote-cursor'
        el.innerHTML = '<div class="cursor-arrow"></div><div class="cursor-name"></div>'
        cursorLayer.appendChild(el)

        const offEl = document.createElement('div')
        offEl.id = `offscreen-cursor-${msg.id}`
        offEl.className = 'cursor-offscreen'
        offEl.innerHTML = '<div class="cursor-offscreen-arrow"></div><div class="cursor-offscreen-name"></div>'
        offEl.style.opacity = '0'
        document.body.appendChild(offEl)
    }

    // Make sure it's visible (may have been pre-created hidden by applyCursorStyle)
    el.style.display = ''

    el.dataset.worldX = msg.x
    el.dataset.worldY = msg.y

    applyCursorStyle(msg.id, msg.name, msg.color, msg.dev)

    updateCursorScreens()
}

socket.onmessage = (e) => {
    const msg = JSON.parse(e.data)

    if (msg.type === 'hello') {
        updateLimitHud()
        setStatus(`Room ${msg.room}. Draw inside the green area.`)
        return
    }

    if (msg.type === 'board') {
        loadBoard(msg.data, false)
        hideLoadingOverlay()
        sfxBoardJoin()
        startAmbient()
        return
    }

    if (msg.type === 'users') {
        const prevCount = parseInt(usersEl.querySelector('#usersHeader')?.textContent?.match(/\d+/)?.[0] || '0')
        usersEl.innerHTML = ''

        const header = document.createElement('div')
        header.id = 'usersHeader'
        header.textContent = `Users: ${msg.count}`
        usersEl.appendChild(header)

        msg.users.forEach(user => {
            const row = document.createElement('div')
            row.className = 'user-row'

            const dot = document.createElement('span')
            dot.className = 'user-dot'
            const dotColor = user.dev ? '#00ff7f' : (user.color || '#66d9ff')
            dot.style.background = dotColor
            dot.style.boxShadow = `0 0 6px ${dotColor}`

            const name = document.createElement('span')
            name.className = 'user-name'
            name.textContent = user.name
            if (user.id === clientId) name.classList.add('user-name-self')

            row.appendChild(dot)
            row.appendChild(name)
            usersEl.appendChild(row)

            // Always sync cursor style — creates element if not yet seen
            if (user.id !== clientId) {
                applyCursorStyle(user.id, user.name, user.color, user.dev)
            }
        })

        if (prevCount > 0 && msg.count > prevCount) sfxUserJoin()
        else if (prevCount > 0 && msg.count < prevCount) sfxUserLeave()

        return
    }

    if (msg.type === 'cursor') {
        showCursor(msg)
        return
    }

    if (msg.type === 'chat') {
        addChatMessage(msg)
        sfxChat()
        return
    }

    if (msg.type === 'leave') {
        const el = document.getElementById(`cursor-${msg.id}`)
        if (el) el.remove()
        const offEl = document.getElementById(`offscreen-cursor-${msg.id}`)
        if (offEl) offEl.remove()
        return
    }

    if (msg.type === 'limit') {
        setStatus(msg.message)
        return
    }

    if (msg.type === 'clear_chat') {
        // Wipe the chat UI and saved history for this client
        chatMessages.innerHTML = ''
        sessionStorage.removeItem('metaspace-chat-history')
        setStatus('Chat cleared by dev.')
        return
    }

    if (msg.type === 'reset_limit') {
        // Reset this client's limit area back to the base size
        limitStartedAt = Date.now()
        limitBonusHours = 0
        saveLimitState()
        refreshLimitArea()
        setStatus('Limit area reset by dev.')
        return
    }
}

socket.onclose = () => {
    readyToSync = false
    setStatus('Disconnected from server.')
    // If we close before ever receiving a board, show an error in the overlay
    const overlay = document.getElementById('loadingOverlay')
    if (overlay && !overlay.classList.contains('hidden')) {
        const text = document.getElementById('loadingText')
        if (text) text.textContent = 'Connection lost. Please refresh.'
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay')
    if (!overlay) return
    overlay.classList.add('hidden')
    // Remove from layout after the CSS opacity transition (400ms) finishes
    overlay.addEventListener('transitionend', () => {
        overlay.style.display = 'none'
    }, { once: true })
}

setMode('select')
refreshLimitArea()
window.setInterval(refreshLimitArea, 60000)
