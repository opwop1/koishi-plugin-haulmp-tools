// 全站里程排行缓存（翻页构建 + 本地持久化，原 rank.js）
const fs = require('fs/promises')
const path = require('path')
const { fetchMembersPage } = require('../api/forumApi')

const TTL = 12 * 60 * 60 * 1000
const MAX_PAGES = 3000

let memory = null
let building = false
let nextAttempt = 0

function cacheFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_ranks.json')
}

function partialFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_ranks_partial.json')
}

function makeCache(data) {
  const list = (data.list || []).map((x) => [String(x[0] || ''), Number(x[1]) || 0, String(x[2] || '')])
  const rankOf = new Map()
  const kmOf = new Map()
  list.forEach((x, i) => {
    const key = x[0].toLowerCase()
    if (!key) return
    rankOf.set(key, i + 1)
    kmOf.set(key, x[1] || 0)
  })
  return { at: data.at || 0, total: list.length, rankOf, kmOf, list }
}

async function loadCache(ctx) {
  if (memory) return memory
  try {
    const raw = await fs.readFile(cacheFile(ctx), 'utf8')
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.list)) {
      memory = makeCache(data)
      return memory
    }
  } catch (e) { /* ignore */ }
  return null
}

async function buildCache(ctx, config) {
  if (building) return false
  building = true
  try {
    let list = []
    let page = 1
    try {
      const raw = await fs.readFile(partialFile(ctx), 'utf8')
      const p = JSON.parse(raw)
      if (p && Array.isArray(p.list) && p.nextPage > 0) {
        list = p.list
        page = p.nextPage
        console.log('[haulmp] 排名构建续传：从第 %d 页继续（已有 %d 人）', page, list.length)
      }
    } catch (e) { /* no partial */ }

    let pages = MAX_PAGES
    while (page <= pages && page <= MAX_PAGES) {
      const d = await fetchMembersPage(config.apiBase, page)
      if (!d) {
        await fs.mkdir(path.dirname(cacheFile(ctx)), { recursive: true })
        await fs.writeFile(partialFile(ctx), JSON.stringify({ nextPage: page, list }))
        console.warn('[haulmp] 排名构建暂停于第 %d 页（已收集 %d 人），下次自动续传', page, list.length)
        return false
      }
      pages = d.pages || pages
      if (pages > MAX_PAGES) {
        console.warn('[haulmp] 成员页数 %d 超过爬取上限 %d，已停止构建（需改用抽样估算方案）', pages, MAX_PAGES)
        return false
      }
      for (const m of d.members) {
        if (m && m.handle) list.push([m.handle, m.km || 0, m.displayName || m.handle])
      }
      if (page % 25 === 0) {
        await fs.mkdir(path.dirname(cacheFile(ctx)), { recursive: true })
        await fs.writeFile(partialFile(ctx), JSON.stringify({ nextPage: page + 1, list }))
        console.log('[haulmp] 排名构建进度 %d/%d', page, pages)
      }
      page++
      await new Promise((r) => setTimeout(r, 200))
    }

    const map = new Map()
    for (const x of list) {
      const key = String(x[0] || '').toLowerCase()
      if (key) map.set(key, [x[0], x[1] || 0, x[2] || x[0]])
    }
    const finalList = Array.from(map.values()).sort((a, b) => b[1] - a[1])
    const data = { at: Date.now(), list: finalList }
    await fs.mkdir(path.dirname(cacheFile(ctx)), { recursive: true })
    await fs.writeFile(cacheFile(ctx), JSON.stringify(data))
    await fs.unlink(partialFile(ctx)).catch(() => {})
    memory = makeCache(data)
    console.log('[haulmp] 排名构建完成：共 %d 人', finalList.length)
    return true
  } finally {
    building = false
  }
}

async function ensureCache(ctx, config) {
  const cache = await loadCache(ctx)
  if (!cache || Date.now() - cache.at > TTL) {
    if (Date.now() >= nextAttempt) {
      nextAttempt = Date.now() + 90 * 1000
      buildCache(ctx, config).catch(() => {})
    }
  }
  return cache
}

async function getMileageRank(ctx, config, handle) {
  const key = String(handle || '').toLowerCase()
  if (!key) return null
  const cache = await ensureCache(ctx, config)
  if (!cache) return null
  const rank = cache.rankOf.get(key)
  return { rank: rank || null, total: cache.total, km: cache.kmOf.get(key) || 0 }
}

async function handleByName(ctx, name) {
  const cache = await loadCache(ctx)
  if (!cache || !cache.list) return ''
  const k = String(name || '').toLowerCase()
  if (!k) return ''
  for (const x of cache.list) {
    if (x[2] && String(x[2]).toLowerCase() === k) return x[0]
  }
  return ''
}

module.exports = { getMileageRank, ensureCache, buildCache, loadCache, handleByName }
