const http = require('http')
const fs = require('fs')
const path = require('path')
const { h } = require('koishi')
const { fetchJson, fetchJsonMemo, bindingQuery, matchByName, loadIdMap, memberByNick, isText } = require('../util/common')
const { COMPASS } = require('../util/constant')
const { gameToLngLat, nearestCity, loadPlaces, headingBearing, haversine } = require('../util/geo')
const { cityZhBatch } = require('../database/cityCache')

function nearbyPlayers(all, target) {
  const [tlon, tlat] = gameToLngLat(target.x, target.z)
  const list = []
  for (const p of all) {
    if (p === target) continue
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
    const [lon, lat] = gameToLngLat(p.x, p.z)
    const d = haversine(tlon, tlat, lon, lat)
    if (d <= 30) list.push({ name: p.name, km: d, speed: p.speed, lon, lat })
  }
  list.sort((a, b) => a.km - b.km)
  return list.slice(0, 5)
}

function matchPlayer(players, key) {
  const k = String(key || '').trim()
  if (!k) return null
  if (/^\d+$/.test(k)) {
    const byId = players.find((p) => p && String(p.id) === k)
    if (byId) return byId
  }
  return matchByName(players, k)
}

async function syncTileVersion(ctx, force) {
  try {
    const page = await getMapPage(ctx)
    if (!page) return
    const html = await fetch('https://map.haulmp.com/', { signal: AbortSignal.timeout(20000) }).then((r) => r.text())
    const mHtml = html.match(/src="(\/live-map\.[^"]+\.js)"/)
    if (!mHtml) return
    const js = await fetch('https://map.haulmp.com' + mHtml[1], { signal: AbortSignal.timeout(30000) }).then((r) => r.text())
    const mVer = js.match(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=([^"'`]+)/)
    if (!mVer) return
    const version = mVer[1]
    const current = await page.evaluate(() => window.getTileUrl())
    if (current && current.includes(version)) return
    const newUrl = `/proxy/tiles/{z}/{x}/{y}.pbf?v=${version}`
    const ok = await page.evaluate((u) => window.setTileUrl(u), newUrl)
    ctx.logger('haulmp').info('地图瓦片版本同步: %s -> %s (%s)', current ? current.split('v=')[1] : '无', version, ok ? 'ok' : 'fail')
  } catch (e) {
    ctx.logger('haulmp').warn('地图版本同步失败: %s', e.message)
  }
}

let httpServer = null
let mapPage = null

function withTimeout(promise, ms, onTimeout) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        try { if (onTimeout) onTimeout() } catch (e) { /* ignore */ }
        reject(new Error(`地图渲染超时（${ms}ms）`))
      }, ms)
    }),
  ])
}

function startStaticServer() {
  if (httpServer) return
  // lib/command/locate.js → lib/resource/map；src/command/locate.js → src/resource/map（相对层级一致）
  const root = path.join(__dirname, '..', 'resource', 'map')
  httpServer = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0])
    const qs = (req.url || '').includes('?') ? (req.url || '').slice((req.url || '').indexOf('?')) : ''
    if (u.startsWith('/proxy/')) {
      const upstream = 'https://map.haulmp.com' + u.slice('/proxy'.length) + qs
      fetch(upstream, { signal: AbortSignal.timeout(30000) })
        .then(async (up) => {
          const buf = Buffer.from(await up.arrayBuffer())
          res.writeHead(up.status, {
            'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
            'Cache-Control': 'max-age=86400',
          })
          res.end(buf)
        })
        .catch(() => {
          res.writeHead(502)
          res.end()
        })
      return
    }
    try {
      const p = u
      const file = path.normalize(path.join(root, p === '/' ? 'index.html' : p))
      if (!file.startsWith(root)) {
        res.writeHead(403)
        res.end()
        return
      }
      const data = fs.readFileSync(file)
      const ext = path.extname(file).toLowerCase()
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=86400' })
      res.end(data)
    } catch (e) {
      res.writeHead(404)
      res.end('not found')
    }
  })
  httpServer.on('error', () => {})
  httpServer.listen(12665, '127.0.0.1')
}

async function getMapPage(ctx) {
  let puppeteer = null
  try {
    puppeteer = ctx.get('puppeteer')
  } catch (e) { /* ignore */ }
  if (!puppeteer) return null
  startStaticServer()
  if (mapPage) {
    try {
      if (!mapPage.isClosed()) {
        ctx.logger('haulmp').info('使用已就绪地图页面')
        return mapPage
      }
    } catch (e) { /* ignore */ }
  }
  ctx.logger('haulmp').info('重建地图页面…')
  mapPage = await puppeteer.page()
  const t0 = Date.now()
  await mapPage.setViewport({ width: 720, height: 500, deviceScaleFactor: 2 })
  await mapPage.goto('http://127.0.0.1:12665/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await mapPage.waitForFunction(() => window.__ready === true, { timeout: 30000 })
  ctx.logger('haulmp').info('地图页面构建完成 %dms', Date.now() - t0)
  preloadEurope(mapPage).catch(() => {})
  return mapPage
}

async function preloadEurope(page) {
  try {
    await page.evaluate(() => {
      const m = window.__map
      if (!m) return
      m.jumpTo({ center: [12, 50], zoom: 4 })
    })
  } catch (e) { /* ignore */ }
}

let mapQueue = Promise.resolve()

async function mapShot(ctx, info, p, nearby) {
  ctx.logger('haulmp').info('地图任务入队')
  const run = mapQueue.then(
    () => doMapShot(ctx, info, p, nearby),
    () => doMapShot(ctx, info, p, nearby),
  )
  mapQueue = run.catch(() => {})
  return run
}

async function doMapShot(ctx, info, p, nearby) {
  try {
    const page = await getMapPage(ctx)
    if (!page) return null
    const [lng, lat] = gameToLngLat(p.x, p.z)
    const resetPage = () => {
      try { page.close().catch(() => {}) } catch (e) { /* ignore */ }
      mapPage = null
    }
    const t1 = Date.now()
    await withTimeout(
      page.evaluate((data) => window.updateView(data), {
        lng,
        lat,
        zoom: 11,
        info,
        nearby: nearby.map((n) => ({ lng: n.lon, lat: n.lat, name: n.name, km: n.km })),
      }),
      15000,
      resetPage,
    )
    const t2 = Date.now()
    await new Promise((r) => setTimeout(r, 120))
    const buf = await withTimeout(page.screenshot({ encoding: 'binary', type: 'png' }), 10000, resetPage)
    ctx.logger('haulmp').info('updateView %dms | 截图 %dms', t2 - t1, Date.now() - t2)
    return buf
  } catch (e) {
    ctx.logger('haulmp').warn('地图渲染失败: %s', e.message)
    if (mapPage) {
      try { mapPage.close().catch(() => {}) } catch (err) { /* ignore */ }
      mapPage = null
    }
    return null
  }
}

function apply(ctx, config) {
  ctx.setTimeout(() => {
    getMapPage(ctx).catch(() => {})
  }, 12000)
  ctx.setTimeout(() => {
    syncTileVersion(ctx).catch(() => {})
  }, 30000)
  ctx.setInterval(() => {
    syncTileVersion(ctx).catch(() => {})
  }, 6 * 60 * 60 * 1000)
  ctx.command('定位H [name]', '定位玩家位置（地图 + 朝向 + 车型）')
    .alias('locateh', '定位h')
    .usage('不填时定位自己；例如：定位H / 定位H 玩家名 / 定位H 316810984 / 定位H @群友')
    .action(async ({ session }, name) => {
      if (!session) return
      const raw = String(name || '').trim()
      const key = raw.replace(/^@+/, '')

      let atId = null
      const mAt = raw.match(/<at id="([^"]+)"/)
      if (mAt) atId = mAt[1]
      if (!atId && session.event && Array.isArray(session.event.message)) {
        for (const el of session.event.message) {
          if (el.type === 'at' && el.attrs && el.attrs.id != null) atId = String(el.attrs.id)
        }
      }
      if (atId && atId === String(session.selfId)) atId = String(session.userId)

      let target = key.replace(/<at[^>]*\/?>/g, '').trim()
      if (atId) {
        const [b] = await ctx.database.get('haulmp_binding', { platform: session.platform, userId: atId })
        if (!b) return 'TA 还没有绑定，让 TA 发送「绑定H 论坛ID」后即可定位'
        target = b.displayName || b.handle
      }
      if (!target) {
        const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
        if (!b) return '你还没有绑定，发送「绑定H 你的ID」，或直接用「定位H 玩家名」/「定位H @群友」'
        target = b.displayName || b.handle
      }

      let players = null
      let cities = null
      let status = null
      try {
        const [live, cs, st] = await Promise.all([
          fetchJsonMemo(config.mapLiveUrl, 30000),
          loadPlaces(),
          fetchJsonMemo(config.statusUrl, 60000).catch(() => null),
        ])
        players = live && Array.isArray(live.players) ? live.players : null
        cities = cs
        status = st
      } catch (e) {
        ctx.logger('haulmp').warn('定位查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!players || !cities || !cities.length) return '查询失败，请稍后再试'

      ctx.logger('haulmp').info('定位查询: %s', target)
      let p = matchPlayer(players, target)
      if (!p && /^\d+$/.test(target)) {
        const [b] = await ctx.database.get('haulmp_binding', { platform: session.platform, userId: target })
        if (b) {
          const t2 = b.displayName || b.handle
          const p2 = matchPlayer(players, t2)
          target = t2
          if (p2) p = p2
        }
      }
      if (!p && /^\d+$/.test(target)) {
        const name = loadIdMap(ctx)[target]
        if (name) {
          const p2 = matchPlayer(players, name)
          if (p2) {
            target = name
            p = p2
          }
        }
      }
      if (!p && session.guildId) {
        const m = await memberByNick(session.bot, session.guildId, target).catch(() => null)
        if (m) {
          const [b] = await ctx.database.get('haulmp_binding', { platform: session.platform, userId: m.id })
          if (b) {
            const t2 = b.displayName || b.handle
            ctx.logger('haulmp').info('群名片 %s → 绑定 %s（游戏名 %s）', target, b.handle, t2)
            const p2 = matchPlayer(players, t2)
            target = t2
            if (p2) p = p2
          }
        }
      }
      if (!p) return `未检测到 ${target} 在线（可能不在游戏中）`

      const [lon, lat] = gameToLngLat(p.x, p.z)
      const near = nearestCity(cities, lon, lat)
      const zhMap = await cityZhBatch(ctx, [near.name]).catch(() => new Map())
      const zhCity = zhMap.get(near.name) || ''
      ctx.logger('haulmp').info('cityZh %s → %s', near.name, zhCity || '-')
      const cityDisplay = zhCity || near.name
      const bearingDeg = headingBearing(p)
      const bearingText = bearingDeg == null ? '—' : `${COMPASS[Math.round(bearingDeg / 45) % 8]} ${Math.round(bearingDeg)}°`
      let model = ''
      if (status && Array.isArray(status.drivers)) {
        const d = matchByName(status.drivers, p.name)
        if (d && d.model) model = d.model
      }
      const nearby = nearbyPlayers(players, p)

      const info = {
        initial: (String(p.name || '?').replace(/^(\[[^\]]*\]\s*)+/, '').trim()[0] || '?').toUpperCase(),
        name: p.name,
        sub: `${p.speed} km/h · 朝向 ${bearingText}${model ? ` · ${model}` : ' · 车型未知'}`,
        city: cityDisplay,
        dist: near.km.toFixed(0),
        id: p.id,
      }

      let card = null
      if (!isText(config, 'locate')) {
        const mapBuffer = await mapShot(ctx, info, p, nearby)
        card = mapBuffer ? h.image(mapBuffer, 'image/png') : null
      }
      ctx.logger('haulmp').info('定位完成: %s | 卡片:%s', p.name, !!card)

      let text = `📍 ${p.name}（ID ${p.id}）· 「${cityDisplay}」附近（${near.km.toFixed(0)} km）\n🏎 速度 ${p.speed} km/h · 朝向 ${bearingText}${model ? ` · 车型 ${model}` : ' · 车型未知'}`
      if (nearby.length) {
        text += '\n👥 附近玩家（30 km 内）：'
        for (const n of nearby) text += `\n · ${n.name}（${n.km.toFixed(1)} km · ${n.speed} km/h）`
      } else {
        text += '\n👥 附近 30 km 内没有其他玩家'
      }

      if (card) return card
      return text
    })
}

module.exports = { apply, gameToLngLat, nearestCity, nearbyPlayers, loadPlaces, matchPlayer, headingBearing, mapShot, syncTileVersion }
