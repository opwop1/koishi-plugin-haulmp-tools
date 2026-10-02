// 地名缓存（游戏内英文地名 → 中文，入库 haulmp_city 表；对齐 ets2-tools-tmp 的 database/translateCache 职责）
const { PLACES_URL } = require('../util/constant')
const { translateNames } = require('../util/translate')

const MANUAL_CN = {
  Aberdeen: '阿伯丁',
  Argostoli: '阿尔戈斯托利',
}

async function syncCities(ctx, config) {
  const res = await fetch(PLACES_URL, { signal: AbortSignal.timeout(30000) })
  const d = await res.json()
  const cities = ((d && d.places) || []).filter((p) => p && p.category === 'city' && Array.isArray(p.coordinates))
  if (!cities.length) return 0

  const existing = await ctx.database.get('haulmp_city', {})
  const known = new Map(existing.map((r) => [r.name, r]))
  const missing = cities.filter((c) => {
    const r = known.get(c.name)
    return !r || !r.nameCn
  })
  if (!missing.length) return 0

  const translated = await translateNames(missing.map((c) => c.name))
  const rows = missing.map((c) => ({
    name: c.name,
    nameCn: translated.get(c.name) || MANUAL_CN[c.name] || '',
    lon: c.coordinates[0],
    lat: c.coordinates[1],
    updatedAt: new Date(),
  }))
  for (let i = 0; i < rows.length; i += 100) {
    try {
      await ctx.database.upsert('haulmp_city', rows.slice(i, i + 100), ['name'])
    } catch (e) {
      ctx.logger('haulmp').warn('地名入库失败: %s', e.message)
    }
  }
  const done = rows.filter((r) => r.nameCn).length
  ctx.logger('haulmp').info('地名翻译完成: %d/%d', done, missing.length)
  return done
}

async function cityZh(ctx, name) {
  if (!name) return ''
  try {
    const [r] = await ctx.database.get('haulmp_city', { name })
    return r && r.nameCn && !/[a-zA-Z]/.test(r.nameCn) ? r.nameCn : ''
  } catch (e) {
    return ''
  }
}

async function cityZhBatch(ctx, names) {
  const result = new Map()
  const uniq = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))]
  if (!uniq.length) return result
  let rows = []
  try {
    rows = await ctx.database.get('haulmp_city', { name: { $in: uniq } })
  } catch (e) {
    rows = []
  }
  const valid = (s) => !!s && !/[a-zA-Z]/.test(s)
  const found = new Map(rows.map((r) => [r.name, r.nameCn || '']))
  const missing = []
  for (const n of uniq) {
    const cn = found.get(n)
    if (valid(cn)) result.set(n, cn)
    else missing.push(n)
  }
  if (!missing.length) return result
  const translated = await translateNames(missing)
  const newRows = []
  for (const n of missing) {
    const cn = translated.get(n) || MANUAL_CN[n]
    if (valid(cn)) {
      result.set(n, cn)
      newRows.push({ name: n, nameCn: cn, lon: 0, lat: 0, updatedAt: new Date() })
    }
  }
  if (newRows.length) {
    try {
      await ctx.database.upsert('haulmp_city', newRows, ['name'])
      ctx.logger('haulmp').info('新地名翻译入库: %s', newRows.map((r) => `${r.name}→${r.nameCn}`).join('、'))
    } catch (e) { /* ignore */ }
  }
  return result
}

function apply(ctx, config) {
  ctx.setTimeout(() => {
    syncCities(ctx, config).catch((e) => ctx.logger('haulmp').warn('地名同步失败: %s', e.message))
  }, 25000)
  ctx.setInterval(() => {
    syncCities(ctx, config).catch(() => {})
  }, 24 * 60 * 60 * 1000)
}

module.exports = { apply, syncCities, cityZh, cityZhBatch }
