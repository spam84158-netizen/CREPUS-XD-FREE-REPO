require('dotenv').config({ path: require('path').join(__dirname, '.env') })
'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { parsePhoneNumberFromString } = require('libphonenumber-js')

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const ROOT = __dirname
const SESSIONS_ROOT = path.join(ROOT, 'sessions')
const LOGS_ROOT = path.join(ROOT, 'logs')
const MAX_BODY = 16 * 1024
const sessions = new Map()
const requests = new Map()
fs.mkdirSync(SESSIONS_ROOT, { recursive: true })
fs.mkdirSync(LOGS_ROOT, { recursive: true })

function cleanPhone(input) {
  let phone = String(input || '').trim()
  phone = phone.replace(/[^0-9+]/g, '')
  if (phone.startsWith('+')) phone = phone.slice(1)
  if (!/^[0-9]{8,15}$/.test(phone)) {
    throw new Error('Numéro WhatsApp invalide. Utilise le format international, ex: +2250700000000')
  }
  return phone
}
function idFor(phone) { return phone.replace(/\D/g, '') }
function rateLimit(phone) {
  const now = Date.now(), last = requests.get(phone) || 0
  if (now - last < 60000) throw new Error('Patiente 60 secondes avant de redemander un code pour ce numéro.')
  requests.set(phone, now)
}
function spawnSession(phone, cb) {
  console.log(`[PAIR] Demande de session pour ${phone}`)
  const id = idFor(phone)
  if (sessions.has(id)) return cb(sessions.get(id))
  const dir = path.join(SESSIONS_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  console.log(`[PAIR] Lancement du pairing-worker.js pour la session ${id}`)
  const child = spawn(process.execPath, [path.join(ROOT, 'pairing-worker.js')], {
    cwd: ROOT,
    env: { ...process.env, CREPUS_PHONE: phone, CREPUS_SESSION_DIR: dir, CREPUS_LOG_DIR: LOGS_ROOT },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const logFile = path.join(LOGS_ROOT, `${id}.log`)
  fs.writeFileSync(logFile, `[${new Date().toISOString()}] Session ${id} started for ${phone}\n`)
  const rec = { id, phone, child, code: null, connected: false, createdAt: Date.now(), output: '', logFile }
  sessions.set(id, rec)
  const onData = (data, source = 'stdout') => {
    const text = data.toString()
    const label = source === 'stderr' ? 'STDERR' : 'STDOUT'
    const line = `[${new Date().toISOString()}][${label}] ${text.trimEnd()}\n`
    console.log(`[PAIR][${id}][${label}] ${text.trimEnd()}`)
    try { fs.appendFileSync(logFile, line) } catch (_) {}
    rec.output = (rec.output + text).slice(-10000)
    const m = text.match(/(?:Your\s+Pairing\s+Code|Pairing\s+Code)\s*:\s*([A-Z0-9-]+)/i)
    if (m) rec.code = m[1]
    if (/connection.*open|Connected to/i.test(text)) rec.connected = true
    cb(rec)
  }
  child.stdout.on('data', data => onData(data, 'stdout')); child.stderr.on('data', data => onData(data, 'stderr'))
  child.on('error', err => { const msg = `[${new Date().toISOString()}][PROCESS ERROR] ${err.stack || err.message}\n`; console.error(`[PAIR][${id}][PROCESS ERROR] ${err.stack || err.message}`); try { fs.appendFileSync(logFile, msg) } catch (_) {}; rec.output = (rec.output + '\n' + err.message).slice(-10000); rec.error = err.message; cb(rec) })
  child.on('exit', (code, signal) => { const line = `[${new Date().toISOString()}] Process terminé: code=${code} signal=${signal || 'none'} connected=${rec.connected} codeGenerated=${!!rec.code}\n`; console.log(`[PAIR][${id}] Process terminé: code=${code} signal=${signal || 'none'} connected=${rec.connected} codeGenerated=${!!rec.code}`); try { fs.appendFileSync(logFile, line) } catch (_) {}; rec.exitCode = code; rec.signal = signal; if (!rec.connected) rec.error = rec.error || `Session process exited (${code ?? 'unknown'})`; if (!rec.code && !rec.connected) console.error(`[PAIR][${id}] Aucun code généré. Dernières sorties:\n${rec.output || '(aucune sortie)'}`); cb(rec); sessions.delete(id) })
  return rec
}
function json(res, status, body) {
  const out = JSON.stringify(body); res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(out)
}
const HTML_FILE = path.join(ROOT, 'index.html')

const server = http.createServer((req,res)=>{
  if (req.method==='GET' && req.url==='/') { if (!fs.existsSync(HTML_FILE)) return json(res,500,{ok:false,error:'index.html not found'}); res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}); return fs.createReadStream(HTML_FILE).pipe(res) }
  if (req.method==='GET' && req.url==='/assets/crepus-xd.png') {
    const imagePath = path.join(ROOT, 'assets', 'images', 'crepus-xd.png')
    if (!fs.existsSync(imagePath)) return json(res,404,{ok:false,error:'Brand image not found'})
    res.writeHead(200, {'content-type':'image/png','cache-control':'public, max-age=86400'})
    return fs.createReadStream(imagePath).pipe(res)
  }
  if (req.method==='GET' && req.url==='/health') return json(res,200,{ok:true,brand:'CREPUS XD',sessions:sessions.size})
  if (req.method==='GET' && req.url.startsWith('/api/debug/')) { const id=decodeURIComponent(req.url.slice('/api/debug/'.length)); const file=path.join(LOGS_ROOT, `${id}.log`); if (!fs.existsSync(file)) return json(res,404,{ok:false,error:'Log not found'}); const text=fs.readFileSync(file,'utf8').slice(-20000); return json(res,200,{ok:true,sessionId:id,log:text}) }
  if (req.method==='POST' && req.url==='/api/pair') {
    console.log('[PAIR] ==========================================')
    console.log('[PAIR] Nouvelle demande /api/pair')
    let body='';
    req.on('data', d => { body += d; if (body.length > MAX_BODY) { console.error('[PAIR] Requête trop volumineuse'); req.destroy(); } });
    req.on('end', async()=>{
      try {
        console.log(`[PAIR] Body reçu: ${body}`)
        const phone=cleanPhone(JSON.parse(body||'{}').phone)
        console.log(`[PAIR] Numéro nettoyé: ${phone}`)
        rateLimit(phone)
        console.log(`[PAIR] Rate-limit OK pour ${phone}`)
        const rec=spawnSession(phone,()=>{})
        console.log(`[PAIR] Session ${rec.id} créée. Attente du code...`)
        let tries=0
        const started=Date.now()
        const wait=()=>{
          if(rec.code){
            console.log(`[PAIR] ✅ CODE GÉNÉRÉ pour ${rec.id}: ${rec.code}`)
            return json(res,200,{ok:true,code:rec.code,sessionId:rec.id,message:'Code généré. Entre-le dans WhatsApp > Appareils connectés > Connecter avec un numéro de téléphone.'})
          }
          if(rec.error){
            console.error(`[PAIR] ❌ ERREUR SESSION ${rec.id}: ${rec.error}`)
            return json(res,500,{ok:false,error:`Échec de génération du code: ${rec.error}`})
          }
          if(++tries>60){
            console.error(`[PAIR][TIMEOUT] Aucun code après ${Date.now()-started} ms pour ${rec.id}`)
            console.error(`[PAIR][TIMEOUT] Dernières sorties:\n${rec.output || '(aucune sortie)'}`)
            return json(res,504,{ok:false,error:'Le code n’a pas été généré à temps. Consulte les logs du serveur.',debug:{sessionId:rec.id,elapsedMs:Date.now()-started,lastOutput:rec.output || ''}})
          }
          setTimeout(wait,500)
        }
        wait()
      } catch(e) {
        console.error(`[PAIR] ❌ ERREUR /api/pair: ${e.stack || e.message}`)
        json(res,400,{ok:false,error:e.message})
      }
    }); return }
  res.writeHead(404); res.end('Not found')
})
server.listen(PORT,HOST,()=>console.log(`CREPUS XD pairing server: http://${HOST}:${PORT}`))

// Telegram pairing gateway.
// Required: TELEGRAM_BOT_TOKEN
// Configure 2-3 mandatory channels with STINGER_CHANNELS, comma-separated.
// Example: @crepus_news,@crepus_updates,@crepus_support
if (process.env.TELEGRAM_BOT_TOKEN) {
  const TelegramBot = require('node-telegram-bot-api')
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })

  const CHANNELS = String(process.env.CREPUS_CHANNELS || process.env.STINGER_CHANNELS || '')
    .split(',').map(x => x.trim()).filter(Boolean)
  const path = require('path')
  const WELCOME_IMAGE = process.env.CREPUS_TG_WELCOME_IMAGE || path.join(__dirname, 'assets', 'images', 'crepus-xd.png')
  const WELCOME_AUDIO = process.env.CREPUS_TG_WELCOME_AUDIO || path.join(__dirname, 'assets', 'audio', 'telegram-welcome.mp3')
  const ADMIN_CONTACT = process.env.CREPUS_TG_ADMIN || process.env.STINGER_TG_ADMIN || ''
  const joinUrl = name => `https://t.me/${String(name).replace(/^@/, '')}`

  const tgState = new Map()
  const TG = {
    keyboard: {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔐 Vérifier mon accès', callback_data: 'verify_access' }],
          [{ text: '📲 Connecter WhatsApp', callback_data: 'pair_whatsapp' }],
          [{ text: 'ℹ️ Aide', callback_data: 'help' }]
        ]
      }, parse_mode: 'HTML'
    },
    menu: {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📲 CONNECTER WHATSAPP', callback_data: 'pair_whatsapp' }],
          [{ text: '🔄 Vérifier l’accès', callback_data: 'verify_access' }, { text: 'ℹ️ Aide', callback_data: 'help' }]
        ]
      }, parse_mode: 'HTML'
    }
  }

  function channelLabel(channel) {
    return channel.startsWith('@') ? channel : channel
  }

  async function membershipStatus(userId) {
    if (!CHANNELS.length) return { ok: false, reason: 'no_channels' }
    const missing = []
    for (const channel of CHANNELS) {
      try {
        const member = await bot.getChatMember(channel, userId)
        const allowed = ['creator', 'administrator', 'member'].includes(member.status) ||
          (member.status === 'restricted' && member.is_member === true)
        if (!allowed) missing.push(channelLabel(channel))
      } catch (e) {
        // A Telegram bot must be able to access/check the configured channel.
        missing.push(channelLabel(channel))
      }
    }
    return { ok: missing.length === 0, missing }
  }

  async function sendJoinGate(chatId, editMessageId) {
    const rows = []
    rows.push([{ text: '🔵 CREPUS TG', url: process.env.TELEGRAM_CHANNEL || 'https://t.me/Zainz_channel' }])
    rows.push([{ text: '🟢 CREPUS CHANNEL', url: process.env.WHATSAPP_CHANNEL || 'https://whatsapp.com/channel/0029Vb7t7R0Lo4hfdyYWLB38' }])
    rows.push([{ text: '✅ J’ai rejoint — vérifier', callback_data: 'verify_access' }])
    const text =
      '<b>『 𖣂 𝑪͜͡𝑹͜͡𝑬͜͡𝑷͜͡𝑼͜͡𝑺 𝑿𝑫 𖣂 』</b>\n' +
      '<i>Accès sécurisé au système de pairing</i>\n\n' +
      'Avant d’ouvrir le menu, rejoins les canaux officiels ci-dessous.\n' +
      '<b>Le bot vérifie automatiquement ton abonnement.</b>\n\n' +
      `Canaux requis : <b>${CHANNELS.length}</b>`
    const opts = { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } }
    if (editMessageId) return bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts })
    return bot.sendMessage(chatId, text, opts)
  }

  async function sendWelcome(chatId) {
    const caption =
      '<b>╭━━━〔 𝗖𝗥𝗘𝗣𝗨𝗦 𝗫𝗗 〕━━━╮</b>\n' +
      '<b>┃</b> <i>Multi-Device Pairing System</i>\n' +
      '<b>╰━━━━━━━━━━━━━━━━━━━━╯</b>\n\n' +
      'Bienvenue sur <b>CREPUS XD</b>. Pour utiliser le pairing WhatsApp, rejoins les canaux officiels.\n\n' +
      '🔵 <b>CREPUS TG</b> • Telegram\n' +
      '🟢 <b>CREPUS CHANNEL</b> • WhatsApp\n\n' +
      '🔒 <b>Protection</b> : accès vérifié avant toute demande.\n' +
      '📲 <b>Pairing</b> : un numéro = une session isolée.\n' +
      '⚡ <b>Rapide</b> : le code est envoyé directement ici.'
    if (WELCOME_IMAGE) {
      try { await bot.sendPhoto(chatId, WELCOME_IMAGE, { caption, parse_mode: 'HTML' }) }
      catch (_) { await bot.sendMessage(chatId, caption, TG.keyboard) }
    } else {
      await bot.sendMessage(chatId, caption, TG.keyboard)
    }
    if (WELCOME_AUDIO) {
      try { await bot.sendAudio(chatId, WELCOME_AUDIO, { caption: '𖣂 𝑪͜͡𝑹͜͡𝑬͜͡𝑷͜͡𝑼͜͡𝑺 𝑿𝑫 𖣂 • Access Audio' }) } catch (_) {}
    }
  }

  async function verifiedMenu(chatId, editMessageId) {
    const text =
      '<b>╭━━━〔 𝗖𝗥𝗘𝗣𝗨𝗦 𝗫𝗗 〕━━━╮</b>\n' +
      '<b>┃</b> <b>ACCÈS AUTORISÉ</b> ✓\n' +
      '<b>╰━━━━━━━━━━━━━━━━━━━━╯</b>\n\n' +
      'Choisis une action :\n\n' +
      '📲 <b>Connecter WhatsApp</b> — générer ton code\n' +
      '🔄 <b>Vérifier</b> — contrôler à nouveau ton accès\n' +
      'ℹ️ <b>Aide</b> — procédure de connexion'
    const opts = { parse_mode: 'HTML', reply_markup: TG.menu.reply_markup }
    if (editMessageId) return bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts })
    return bot.sendMessage(chatId, text, opts)
  }

  async function verifyAndShow(chatId, messageId) {
    if (!CHANNELS.length) {
      return bot.sendMessage(chatId, '⚠️ <b>CREPUS_CHANNELS n’est pas configuré.</b>\nLe propriétaire doit définir les 2 à 3 canaux requis.', { parse_mode: 'HTML' })
    }
    const result = await membershipStatus(chatId)
    if (!result.ok) {
      await bot.sendMessage(chatId,
        '❌ <b>Accès refusé.</b>\n\nTu n’as pas encore rejoint tous les canaux requis. Rejoins-les puis appuie de nouveau sur <b>Vérifier</b>.\n\nManquants : ' + result.missing.join(', '),
        { parse_mode: 'HTML' })
      return sendJoinGate(chatId)
    }
    tgState.set(chatId, { verifiedAt: Date.now() })
    return verifiedMenu(chatId, messageId)
  }

  bot.onText(/\/start/, async msg => {
    tgState.delete(msg.chat.id)
    await sendWelcome(msg.chat.id)
    if (CHANNELS.length) await sendJoinGate(msg.chat.id)
    else await bot.sendMessage(msg.chat.id, '⚠️ Configuration incomplète : aucun canal obligatoire n’est défini.', { parse_mode: 'HTML' })
  })

  bot.on('callback_query', async query => {
    const chatId = query.message.chat.id
    const messageId = query.message.message_id
    try {
      await bot.answerCallbackQuery(query.id)
      if (query.data === 'verify_access') return verifyAndShow(chatId, messageId)
      if (query.data === 'help') {
        return bot.sendMessage(chatId,
          '<b>📖 COMMENT ÇA MARCHE ?</b>\n\n' +
          '1. Rejoins les canaux affichés.\n' +
          '2. Appuie sur <b>Vérifier l’accès</b>.\n' +
          '3. Quand l’accès est validé, ouvre <b>Connecter WhatsApp</b>.\n' +
          '4. Envoie ton numéro au format international (+225...).\n' +
          '5. Le bot génère ton code de liaison.\n\n' +
          '<i>Ne partage jamais ton code de pairing.</i>',
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📲 Connecter WhatsApp', callback_data: 'pair_whatsapp' }]] } })
      }
      if (query.data === 'pair_whatsapp') {
        const state = tgState.get(chatId)
        if (!state) return sendJoinGate(chatId)
        tgState.set(chatId, { ...state, awaitingPhone: true })
        return bot.sendMessage(chatId,
          '<b>📲 PAIRING WHATSAPP</b>\n\nEnvoie maintenant ton numéro au format international.\nExemple : <code>+2250700000000</code>\n\n<i>Un seul numéro par session.</i>',
          { parse_mode: 'HTML' })
      }
    } catch (e) {
      bot.sendMessage(chatId, 'Une erreur Telegram est survenue. Réessaie.')
    }
  })

  bot.on('message', async msg => {
    if (!msg.text || msg.text.startsWith('/') || msg.text.startsWith('http')) return
    const chatId = msg.chat.id
    const state = tgState.get(chatId)
    if (!state || !state.awaitingPhone) return
    try {
      const member = await membershipStatus(chatId)
      if (!member.ok) {
        tgState.delete(chatId)
        return sendJoinGate(chatId)
      }
      const phone = cleanPhone(msg.text)
      rateLimit(`tg:${phone}`)
      const rec = spawnSession(phone, () => {})
      tgState.set(chatId, { ...state, awaitingPhone: false, phone })
      await bot.sendMessage(chatId, '⏳ <b>Connexion en préparation...</b>\nGénération du code de liaison WhatsApp.', { parse_mode: 'HTML' })
      let tries = 0
      const poll = () => {
        if (rec.code) return bot.sendMessage(chatId,
          '<b>╭━━━〔 PAIRING CODE 〕━━━╮</b>\n' +
          `<b>┃</b> <code>${rec.code}</code>\n` +
          '<b>╰━━━━━━━━━━━━━━━━━━━━╯</b>\n\n' +
          'WhatsApp → <b>Appareils connectés</b> → <b>Connecter avec un numéro de téléphone</b>.\n\n' +
          '⚠️ <i>Ne transmets pas ce code à quelqu’un d’autre.</i>',
          { parse_mode: 'HTML' })
        if (++tries > 30) return bot.sendMessage(chatId, '❌ Le code n’a pas été généré à temps. Réessaie depuis le menu.')
        setTimeout(poll, 1000)
      }
      poll()
    } catch (e) {
      bot.sendMessage(chatId, `❌ ${e.message}`)
    }
  })

  console.log(`Telegram pairing gateway enabled. Mandatory channels: ${CHANNELS.join(', ') || 'NOT CONFIGURED'}`)
} else console.log('Telegram pairing gateway disabled: set TELEGRAM_BOT_TOKEN to enable it.')
