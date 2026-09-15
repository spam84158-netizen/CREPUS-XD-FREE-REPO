'use strict'

const pino = require('pino')
const fs = require('fs')
const path = require('path')
const {
  default: makeWASocket,
  Browsers,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys')

const phone = String(process.env.CREPUS_PHONE || '').replace(/\D/g, '')
const sessionDir = process.env.CREPUS_SESSION_DIR || path.join(process.cwd(), 'sessions', phone)
const logDir = process.env.CREPUS_LOG_DIR || path.join(process.cwd(), 'logs')
const logPath = path.join(logDir, `worker-${phone || 'unknown'}.log`)
fs.mkdirSync(logDir, { recursive: true })

function log(msg, err = false) {
  const line = `[${new Date().toISOString()}] ${msg}`
  ;(err ? console.error : console.log)(line)
  try { fs.appendFileSync(logPath, line + '\n') } catch (_) {}
}
function fail(err) {
  log(`[FATAL] ${err?.stack || err}`, true)
  process.exitCode = 1
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)

async function getWaVersion() {
  try {
    const r = await fetchLatestWaWebVersion()
    if (r?.version?.length === 3) {
      log(`LIVE WhatsApp Web version: ${r.version.join('.')}, latest=${r.isLatest}`)
      return r.version
    }
    throw r?.error || new Error('fetchLatestWaWebVersion returned no version')
  } catch (e) {
    log(`[WARN] Live WA Web version failed: ${e?.stack || e}`, true)
    try {
      const r = await fetchLatestBaileysVersion()
      log(`Fallback Baileys version: ${r.version.join('.')}, latest=${r.isLatest}`)
      return r.version
    } catch (e2) {
      log(`[WARN] Baileys version fallback failed: ${e2?.stack || e2}`, true)
      return undefined
    }
  }
}

async function main() {
  if (!/^\d{8,15}$/.test(phone)) throw new Error(`Invalid phone: ${phone}`)
  fs.mkdirSync(sessionDir, { recursive: true })
  log(`Starting pairing worker for ${phone}`)
  log(`Session directory: ${sessionDir}`)

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  if (state.creds.registered) {
    log('Session is already registered; refusing to request a new pairing code.')
    return
  }

  const version = await getWaVersion()

  const socket = makeWASocket({
    ...(version ? { version } : {}),
    logger: pino({ level: 'silent' }),
    browser: Browsers.windows('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 10000,
    fireInitQueries: false
  })

  let pairingRequested = false
  let finishTimer = null

  socket.ev.on('creds.update', async creds => {
    try {
      await saveCreds(creds)
      log(`creds.update: registered=${!!creds.registered} pairingCode=${!!creds.pairingCode}`)
    } catch (e) {
      log(`[ERROR] saveCreds: ${e?.stack || e}`, true)
    }
  })

  socket.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update
    if (connection) log(`connection.update: ${connection}`)
    if (qr) {
      log('WhatsApp emitted QR/pairing-ready event')
      if (!pairingRequested && !socket.authState.creds.registered) {
        pairingRequested = true
        try {
          log(`Calling requestPairingCode(${phone}) after pairing-ready event`)
          const raw = await socket.requestPairingCode(phone)
          const formatted = String(raw || '').replace(/\s/g, '').match(/.{1,4}/g)?.join('-') || raw
          if (!formatted) throw new Error('Baileys returned an empty pairing code')
          log(`CREPUS_PAIRING_CODE:${formatted}`)
          log(`Your Pairing Code : ${formatted}`)
          clearTimeout(finishTimer)
          finishTimer = setTimeout(() => {
            log('Pairing window reached 180s without a confirmed connection; closing worker.')
            try { socket.ws?.close?.() } catch (_) {}
            process.exit(0)
          }, 180000)
        } catch (e) {
          log(`[ERROR] requestPairingCode failed: ${e?.stack || e}`, true)
          process.exitCode = 1
          try { socket.ws?.close?.() } catch (_) {}
        }
      }
    }
    if (lastDisconnect?.error) {
      const code = lastDisconnect?.error?.output?.statusCode
      log(`disconnect detail: status=${code ?? 'unknown'} error=${lastDisconnect.error?.stack || lastDisconnect.error}`, true)
    }
    if (connection === 'open') {
      log('WHATSAPP_CONNECTED: true')
      clearTimeout(finishTimer)
      // Do not exit: keep the worker/session alive.
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      log(`connection closed status=${code ?? 'unknown'}`)
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
        process.exitCode = 1
      }
    }
  })

  log('Pairing worker ready; waiting for WhatsApp pairing-ready event...')
}

main().catch(fail)
