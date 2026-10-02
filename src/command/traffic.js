const { h } = require('koishi')
const { fetchJson, fetchJsonMemo, renderCard, isText, esc, cardTheme, CARD_DECO } = require('../util/common')
const { gameToLngLat, nearestCity, loadPlaces } = require('../util/geo')
const { cityZhBatch } = require('../database/cityCache')

const KINDS = {
  accident: { zh: '事故', color: '#e35d5d', icon: '🔴' },
  roadworks: { zh: '施工', color: '#e8a23d', icon: '🚧' },
  police: { zh: '交警', color: '#d9d95c', icon: '👮' },
  debris: { zh: '障碍物', color: '#9aa4ad', icon: '⚠️' },
  checkpoint: { zh: '检查站', color: '#5c9df5', icon: '⚖️' },
}
const ORDER = ['accident', 'roadworks', 'police', 'debris', 'checkpoint']

async function fetchLive(config) {
  try {
    return await fetchJsonMemo(config.mapLiveUrl, 30000)
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1500))
    return fetchJson(config.mapLiveUrl)
  }
}

async function collect(ctx, config) {
  const live = await fetchLive(config)
  const evs = live && Array.isArray(live.events) ? live.events : []
  const now = Date.now()
  const cities = await loadPlaces()
  const list = []
  const names = []
  for (const e of evs) {
    if (!e || e.x == null || e.z == null) continue
    if (e.endsAt != null && e.endsAt <= now) continue
    const [lng, lat] = gameToLngLat(e.x, e.z)
    const near = cities && cities.length ? nearestCity(cities, lng, lat) : null
    if (near) names.push(near.name)
    list.push({ e, lng, lat, near })
  }
  const zhMap = await cityZhBatch(ctx, names).catch(() => new Map())
  for (const it of list) {
    it.city = it.near ? zhMap.get(it.near.name) || it.near.name : '未知区域'
    it.remain = it.e.endsAt ? Math.max(1, Math.round((it.e.endsAt - now) / 60000)) : null
  }
  return list
}

function countsOf(list) {
  const c = {}
  for (const it of list) c[it.e.kind] = (c[it.e.kind] || 0) + 1
  return c
}

function trafficText(list) {
  const c = countsOf(list)
  const parts = ORDER.filter((k) => c[k]).map((k) => `${KINDS[k].icon}${KINDS[k].zh} ${c[k]}`)
  const lines = [`🛣 HaulMP 实时路况 · 共 ${list.length} 处`, parts.join(' · '), '━━━━━━━━━━━━']
  let shown = 0
  for (const k of ORDER) {
    const items = list.filter((it) => it.e.kind === k)
    if (!items.length) continue
    const cap = Math.max(2, Math.min(5, 24 - shown))
    for (const it of items.slice(0, cap)) {
      lines.push(`${KINDS[k].icon} ${KINDS[k].zh} · ${it.city} 附近${it.remain ? ` · 剩 ${it.remain} 分钟` : ''}`)
      shown++
    }
    if (items.length > cap) {
      lines.push(`   …等 ${items.length} 处`)
    }
    if (shown >= 24) break
  }
  return lines.join('\n')
}

// 🎨 设计提示词（实时路况）：公路警报中心。绯红→琥珀警示光带，像巡逻灯塔；
// 事件以彩色信号点分类，行如仪表盘读数，紧急（≤3分钟）转琥珀发光提示；
// 多列排版像交通指挥大屏，冷静但有紧张感。底板为共享 ink 玻璃主题。
function trafficCard(list) {
  const cols = list.length > 48 ? 3 : list.length > 24 ? 2 : 1
  const width = cols === 3 ? 1180 : cols === 2 ? 940 : 720
  const c = countsOf(list)
  const chips = ORDER.map((k) => `<span class="chip"><i style="background:${KINDS[k].color}"></i>${KINDS[k].zh} <b>${c[k] || 0}</b></span>`).join('')
  const rows = []
  for (const k of ORDER) {
    const items = list.filter((it) => it.e.kind === k)
    for (const it of items) {
      const soon = it.remain != null && it.remain <= 3
      rows.push(`<div class="r"><i style="background:${KINDS[k].color};box-shadow:0 0 10px ${KINDS[k].color}"></i><span class="k">${KINDS[k].zh}</span><span class="city">${esc(it.city)} 附近</span><span class="rm${soon ? ' soon' : ''}">${it.remain ? `剩 ${it.remain} 分钟` : ''}</span></div>`)
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#ef6a6a', '#f5a623', width)}
.head{display:flex;align-items:center;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid var(--stroke)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.badge{background:linear-gradient(180deg,rgba(245,166,35,.24),rgba(245,166,35,.10));border:1px solid rgba(245,166,35,.55);color:#ffcb7a;font-weight:700;font-size:15px;border-radius:999px;padding:6px 15px;box-shadow:0 0 20px rgba(245,166,35,.28)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}
.chip{background:var(--glass-lo);border:1px solid var(--stroke);border-radius:999px;padding:5px 13px;font-size:13px;color:#aebdcb;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.chip b{color:#fff;margin-left:4px}
.chip i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}
.list{margin-top:15px;background:var(--glass-lo);border:1px solid var(--stroke);border-radius:14px;overflow:hidden;column-count:${cols};column-gap:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 24px rgba(0,0,0,.3)}
.r{display:flex;align-items:center;gap:12px;padding:9px 16px;break-inside:avoid}
.r + .r{border-top:1px solid rgba(255,255,255,.05)}
.r > i{width:9px;height:9px;border-radius:50%;flex:none}
.r .k{width:52px;font-size:13.5px;font-weight:600;color:#cdd9e6;flex:none}
.r .city{flex:1;min-width:0;font-size:13.5px;color:#eef4f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r .rm{font-size:12.5px;color:#8ba0b5;flex:none}
.r .rm.soon{color:#ffcb7a;font-weight:700;text-shadow:0 0 10px rgba(245,166,35,.6)}
.foot{margin-top:16px;padding-top:12px;border-top:1px solid var(--stroke);display:flex;justify-content:space-between;font-size:11.5px;color:#5f7186}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">HaulMP 实时路况</span><span class="badge">${list.length} 处</span></div>
<div class="chips">${chips}</div>
<div class="list">${rows.join('')}</div>
<div class="foot"><span>数据实时更新 · 事故 / 施工 / 交警 / 障碍物 / 检查站</span><span>HaulMP</span></div>
</div></body></html>`
}

function apply(ctx, config) {
  ctx.command('路况H', 'HaulMP 实时路况（事故/施工/交警等）')
    .alias('路况h')
    .usage('实时全平台路况：事故 / 施工 / 交警 / 障碍物 / 检查站')
    .action(async ({ session }) => {
      if (!session) return
      let list
      try {
        list = await collect(ctx, config)
      } catch (e) {
        ctx.logger('haulmp').warn('路况查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!list.length) return '当前没有实时路况事件'

      if (!isText(config, 'traffic')) {
        const card = await renderCard(ctx, trafficCard(list))
        if (card) return card
      }
      return trafficText(list)
    })
}

module.exports = { apply, collect, trafficText, trafficCard }
