const { h } = require('koishi')
const fs = require('fs')
const path = require('path')
const { FONT } = require('./constant')

// 🎨 共享卡片主题：深墨蓝玻璃拟态（与 ets2-tools-tmp 同一设计语言家族，但保留区分度）：
//   - 底色偏蓝青的 ink 渐变（ets2 为偏紫的 #0c1426 家族）
//   - 卡片自带极细扫描线网格（ haulmp 签名元素，ets2 没有）
//   - 顶部 accent 光带 + 双光斑极光
//   - 圆角 20px（ets2 为 18/13/10 体系）
function cardTheme(accent, accent2, width) {
  const a2 = accent2 || accent
  return `:root{--ac:${accent};--ac2:${a2};--glass:rgba(255,255,255,.05);--glass-lo:rgba(255,255,255,.02);--stroke:rgba(255,255,255,.09);--stroke-hi:rgba(255,255,255,.18);--t1:#e8f2fc;--t2:#a9bdd2;--t3:#7c90a6}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#04070c;font-family:${FONT}}
#card{position:relative;overflow:hidden;width:${width || 720}px;background:linear-gradient(168deg,#0e1b2a 0%,#0a1521 55%,#071018 100%);padding:26px 28px 16px;color:#cdd9e6}
#card::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.013) 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,rgba(255,255,255,.013) 0 1px,transparent 1px 28px)}
#card>*{position:relative;z-index:1}
#card>.glow,#card>.orb{z-index:0}
#card>.glow{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--ac) 30%,var(--ac2) 70%,transparent);box-shadow:0 2px 26px var(--ac)}
#card>.orb{position:absolute;border-radius:50%;filter:blur(85px);pointer-events:none}
#card>.orb1{width:320px;height:320px;background:var(--ac);top:-150px;right:-100px;opacity:.20}
#card>.orb2{width:260px;height:260px;background:var(--ac2);bottom:-130px;left:-80px;opacity:.12}`
}

const CARD_DECO = '<div class="glow"></div><div class="orb orb1"></div><div class="orb orb2"></div>'

let httpReady = false

function setupHttp() {
  if (httpReady) return
  httpReady = true
  try {
    const { Agent, setGlobalDispatcher } = require('undici')
    setGlobalDispatcher(new Agent({
      keepAliveTimeout: 5 * 60 * 1000,
      keepAliveMaxTimeout: 5 * 60 * 1000,
      connections: 4,
      connect: { timeout: 6000 },
    }))
  } catch (e) { /* 环境无 undici 时退回默认 fetch */ }
}

async function hedgedFetch(url) {
  return new Promise((resolve, reject) => {
    let done = false
    let failures = 0
    let lastErr = null
    const timers = []
    const settle = (fn, v) => {
      if (done) return
      done = true
      for (const t of timers) clearTimeout(t)
      fn(v)
    }
    const launch = () => {
      if (done) return
      fetch(url, { signal: AbortSignal.timeout(10000) })
        .then((res) => {
          if (done) {
            try { res.body && res.body.cancel && res.body.cancel().catch(() => {}) } catch (e) { /* ignore */ }
            return
          }
          settle(resolve, res)
        })
        .catch((e) => {
          if (done) return
          failures++
          lastErr = e
          if (failures >= 3) settle(reject, lastErr)
        })
    }
    for (const delay of [0, 1800, 4500]) timers.push(setTimeout(launch, delay))
  })
}

async function fetchJson(url) {
  const res = await hedgedFetch(url)
  return res.json()
}

function bindingQuery(session) {
  return { platform: session.platform, userId: session.userId }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtMoney(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '€0'
  return '€' + n.toLocaleString('en-US')
}

function esc(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => map[c])
}

function avatarUrl(avatar) {
  const a = avatar || ''
  if (!a) return ''
  if (a.startsWith('/')) return 'https://forum.haulmp.com' + a
  return a
}

function stripTags(name) {
  return String(name || '').replace(/^(\[[^\]]*\]\s*)+/, '').trim()
}

function matchByName(list, key) {
  if (!Array.isArray(list)) return null
  const k = String(key || '').trim()
  if (!k) return null
  const lower = k.toLowerCase()
  let found = list.find((x) => x && x.name === k)
  if (found) return found
  found = list.find((x) => x && typeof x.name === 'string' && x.name.toLowerCase() === lower)
  if (found) return found
  found = list.find((x) => x && typeof x.name === 'string' && stripTags(x.name).toLowerCase() === lower)
  if (found) return found
  found = list.find((x) => x && typeof x.name === 'string' && x.name.toLowerCase().endsWith(' ' + lower))
  return found || null
}

const avatarCache = new Map()

async function resolveAvatar(member) {
  const url = avatarUrl((member || {}).avatar)
  if (!url) return ''
  let abs = url
  if (url.startsWith('//')) abs = 'https:' + url
  else if (url.startsWith('/')) abs = 'https://forum.haulmp.com' + url
  const hit = avatarCache.get(abs)
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data
  try {
    const res = await hedgedFetch(abs)
    if (!res.ok) return abs
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0]
    const data = `data:${ct};base64,${buf.toString('base64')}`
    avatarCache.set(abs, { at: Date.now(), data })
    return data
  } catch (e) {
    return abs
  }
}

const memoStore = new Map()

async function fetchJsonMemo(url, ttl) {
  const now = Date.now()
  const hit = memoStore.get(url)
  if (hit && now - hit.at < (ttl || 30000)) return hit.data
  const data = await fetchJson(url)
  memoStore.set(url, { at: now, data })
  return data
}

async function warm(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      memoStore.set(url, { at: Date.now(), data })
      return true
    } catch (e) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1200 : 3000))
    }
  }
  return false
}

let cardPage = null
let cardPageAt = 0
let cardPageUses = 0
let cardQueue = Promise.resolve()

function renderCard(ctx, html) {
  const run = cardQueue.then(
    () => doRenderCard(ctx, html),
    () => doRenderCard(ctx, html),
  )
  cardQueue = run.catch(() => {})
  return run
}

async function doRenderCard(ctx, html) {
  let puppeteer = null
  try {
    puppeteer = ctx.get('puppeteer')
  } catch (e) { /* ignore */ }
  if (!puppeteer) return null
  try {
    if (cardPage && !cardPage.isClosed() && (cardPageUses > 30 || Date.now() - cardPageAt > 10 * 60 * 1000)) {
      try { await cardPage.close() } catch (e) { /* ignore */ }
      cardPage = null
    }
    if (!cardPage || cardPage.isClosed()) {
      cardPage = await puppeteer.page()
      cardPageAt = Date.now()
      cardPageUses = 0
      await cardPage.setViewport({ width: 1200, height: 600, deviceScaleFactor: 1.5 })
    }
    cardPageUses++
    const t0 = Date.now()
    await cardPage.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const t1 = Date.now()
    await cardPage.waitForFunction(() => Array.from(document.images).every((img) => img.complete), { timeout: 8000 }).catch(() => {})
    const t2 = Date.now()
    const el = await cardPage.$('#card')
    if (!el) return null
    const box = await el.boundingBox()
    if (!box) return null
    const scale = 1.5
    if (cardPage._haulmpScale !== scale) {
      cardPage._haulmpScale = scale
      await cardPage.setViewport({ width: 1200, height: 600, deviceScaleFactor: scale })
    }
    const buffer = await cardPage.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      encoding: 'binary',
      type: 'jpeg',
      quality: 92,
    })
    const t3 = Date.now()
    ctx.logger('haulmp').info('卡片渲染 %dms (内容 %d / 等待 %d / 截屏 %d) %dx%d @%sx', t3 - t0, t1 - t0, t2 - t1, t3 - t2, Math.round(box.width), Math.round(box.height), scale)
    return h.image(buffer, 'image/jpeg')
  } catch (e) {
    ctx.logger('haulmp').warn('卡片渲染失败: %s', e.message)
    if (cardPage) {
      try { cardPage.close().catch(() => {}) } catch (err) { /* ignore */ }
      cardPage = null
    }
    return null
  }
}

function idMapFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_player_ids.json')
}

function loadIdMap(ctx) {
  try {
    return JSON.parse(fs.readFileSync(idMapFile(ctx), 'utf8'))
  } catch (e) {
    return {}
  }
}

function saveIdMap(ctx, map) {
  try {
    fs.writeFileSync(idMapFile(ctx), JSON.stringify(map))
  } catch (e) { /* ignore */ }
}

async function memberByNick(bot, guildId, key) {
  if (!bot || !guildId || !key) return null
  try {
    const res = await bot.getGuildMemberList(guildId)
    const list = (res && res.data) || (Array.isArray(res) ? res : [])
    const k = String(key).toLowerCase()
    const qqOf = (m) => (m && m.user && m.user.id != null ? String(m.user.id) : m && m.id != null ? String(m.id) : '')
    const nameOf = (m) => String((m && (m.nick || (m.user && m.user.name) || m.name)) || '')
    let hit = list.find((m) => nameOf(m).toLowerCase() === k)
    if (!hit) hit = list.find((m) => nameOf(m).replace(/^@+/, '').toLowerCase() === k)
    return hit && qqOf(hit) ? { id: qqOf(hit), nick: nameOf(hit) } : null
  } catch (e) {
    return null
  }
}

function isText(config, key) {
  try {
    return !!(config && config.output && config.output[key] === 'text')
  } catch (e) {
    return false
  }
}

module.exports = { fetchJson, fetchJsonMemo, warm, setupHttp, bindingQuery, fmtTime, fmtMoney, esc, avatarUrl, resolveAvatar, renderCard, matchByName, loadIdMap, saveIdMap, memberByNick, isText, cardTheme, CARD_DECO }
