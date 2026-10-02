const fs = require('fs')
const path = require('path')
const { fetchJsonMemo, renderCard, isText, esc, cardTheme, CARD_DECO } = require('../util/common')
const { broadcast } = require('./changelog')

// 🎨 设计提示词（版本信息）：固件面板。冰蓝→青渐变光带；HaulMP 大版本居中发光，
// 欧卡/美卡版本以双格托底；像设备信息页，一眼看清"客户端 + 游戏"三件套。底板为共享 ink 玻璃主题。
function fmtBytes(v) {
  if (v == null || isNaN(v)) return ''
  const n = Number(v)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

async function steamGameVersion(appid) {
  try {
    const d = await fetchJsonMemo(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=30`, 30 * 60 * 1000)
    const items = (d && d.appnews && d.appnews.newsitems) || []
    for (const i of items) {
      const t = String(i.title || '')
      if (!/update|release/i.test(t)) continue
      const m = t.match(/(\d+\.\d+(?:\.\d+){0,3}s?)/)
      if (m) return m[1]
    }
  } catch (e) { /* ignore */ }
  return ''
}

async function collect(config) {
  let status = null
  let tmp = null
  const [st, ets2, ats, tp] = await Promise.all([
    fetchJsonMemo(config.statusUrl, 60000).catch(() => null),
    steamGameVersion(227300),
    steamGameVersion(270880),
    fetchJsonMemo('https://api.truckersmp.com/v2/version', 10 * 60 * 1000).catch(() => null),
  ])
  status = st
  tmp = tp
  return {
    client: (status && status.client) || null,
    ets2: (tmp && tmp.supported_game_version) || ets2 || '',
    ats: (tmp && tmp.supported_ats_game_version) || ats || '',
  }
}

function versionCard(v) {
  const c = v.client || {}
  const m = String(c.notes || '').match(/HaulMP\s+([\d.]+)/i)
  const name = m ? m[1] : ''
  const big = name || (c.version != null ? `v${c.version}` : '—')
  const sub = [
    c.version != null ? `build v${c.version}` : '',
    c.bytes ? fmtBytes(c.bytes) : '',
    c.publishedAt ? `发布 ${fmtWhen(c.publishedAt)}` : '',
  ].filter(Boolean).join(' · ')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#38bdf8', '#22d3ee', 720)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(56,189,248,.16)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#6f9bb3;font-size:13px;font-weight:700;letter-spacing:2px}
.hero-v{text-align:center;padding:18px 0 4px}
.hlab{font-size:13px;color:#7fb8d0;letter-spacing:4px}
.hbig{font-size:58px;font-weight:800;line-height:1.1;margin-top:8px;background:linear-gradient(180deg,#fff,#9bdcff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 8px 30px rgba(56,189,248,.45))}
.hsub{color:#8ba0b5;font-size:12.5px;margin-top:10px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}
.tile{background:var(--glass-lo);border:1px solid var(--stroke);border-radius:14px;padding:16px 12px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 20px rgba(0,0,0,.24)}
.tile .t{font-size:12.5px;color:#8ba0b5;letter-spacing:1px}
.tile .v{font-size:27px;font-weight:800;color:#fff;margin-top:8px;text-shadow:0 2px 18px rgba(56,189,248,.35)}
.foot{margin-top:20px;padding-top:12px;border-top:1px solid rgba(56,189,248,.16);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">版本信息</span><span class="brand">VERSION</span></div>
<div class="hero-v"><div class="hlab">HAULMP 客户端</div><div class="hbig">${esc(big)}</div><div class="hsub">${esc(sub || '—')}</div></div>
<div class="tiles">
<div class="tile"><div class="t">欧洲卡车模拟 2</div><div class="v">${esc(v.ets2 || '—')}</div></div>
<div class="tile"><div class="t">美国卡车模拟</div><div class="v">${esc(v.ats || '—')}</div></div>
</div>
<div class="foot"><span>HaulMP · 游戏版本实时同步</span><span>${fmtWhen(Date.now())}</span></div>
</div></body></html>`
}

function versionText(v) {
  const c = v.client || {}
  const m = String(c.notes || '').match(/HaulMP\s+([\d.]+)/i)
  const name = m ? `${m[1]}（build v${c.version}）` : c.version != null ? `v${c.version}` : '—'
  return `📦 HaulMP 客户端：${name}\n🚛 欧卡版本：${v.ets2 || '—'}\n🚚 美卡版本：${v.ats || '—'}`
}

function stateFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_game_ver.json')
}

function loadState(ctx) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(ctx), 'utf8'))
  } catch (e) {
    return null
  }
}

function saveState(ctx, st) {
  try {
    fs.writeFileSync(stateFile(ctx), JSON.stringify(st, null, 1))
  } catch (e) { /* ignore */ }
}

function gameCard(changes) {
  const rows = changes.map(([g, from, to]) => `<div class="grow"><span class="gname">${esc(g)}</span><span class="gfrom">${esc(from)}</span><span class="garrow">→</span><span class="gnew">${esc(to)}</span></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#3aa86f', '#38bdf8', 720)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(58,168,111,.18)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#6f9a86;font-size:13px;font-weight:700;letter-spacing:2px}
.rows{margin-top:18px}
.grow{display:flex;align-items:center;gap:14px;background:var(--glass-lo);border:1px solid var(--stroke);border-radius:14px;padding:16px 18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 20px rgba(0,0,0,.24)}
.grow + .grow{margin-top:12px}
.gname{flex:1;color:#fff;font-weight:700;font-size:16px}
.gfrom{color:#8ba0b5;font-size:15px;text-decoration:line-through;opacity:.85}
.garrow{color:#5fd39a;font-weight:700;font-size:17px;text-shadow:0 0 12px rgba(58,168,111,.7)}
.gnew{font-size:17px;font-weight:800;color:#7fe0ac;text-shadow:0 0 16px rgba(58,168,111,.5)}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(58,168,111,.18);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">游戏版本更新</span><span class="brand">GAME</span></div>
<div class="rows">${rows}</div>
<div class="foot"><span>更新游戏后请同步升级</span><span>${fmtWhen(Date.now())}</span></div>
</div></body></html>`
}

function gameText(changes) {
  const lines = ['🎮 游戏版本更新']
  for (const [g, from, to] of changes) lines.push(`${g}：${from} → ${to}`)
  lines.push('（更新游戏后请同步升级客户端）')
  return lines.join('\n')
}

async function check(ctx, config) {
  const logger = ctx.logger('haulmp')
  let tmp = null
  try {
    tmp = await fetchJsonMemo('https://api.truckersmp.com/v2/version', 10 * 60 * 1000)
  } catch (e) {
    return
  }
  const ets2 = (tmp && tmp.supported_game_version) || ''
  const ats = (tmp && tmp.supported_ats_game_version) || ''
  if (!ets2 && !ats) return
  const st = loadState(ctx)
  if (!st || (!st.ets2 && !st.ats)) {
    saveState(ctx, { ets2, ats, at: Date.now() })
    logger.info('首次记录游戏版本 ETS2 %s / ATS %s（不推送）', ets2, ats)
    return
  }
  const changes = []
  if (ets2 && st.ets2 && st.ets2 !== ets2) changes.push(['欧洲卡车模拟 2', st.ets2, ets2])
  if (ats && st.ats && st.ats !== ats) changes.push(['美国卡车模拟', st.ats, ats])
  if (!changes.length) {
    if (ets2 !== st.ets2 || ats !== st.ats) saveState(ctx, { ets2, ats, at: Date.now() })
    return
  }
  saveState(ctx, { ets2, ats, at: Date.now() })
  let content = gameText(changes)
  if (!isText(config, 'gameVersion')) {
    const card = await renderCard(ctx, gameCard(changes))
    if (card) content = card
  }
  const sent = await broadcast(ctx, config, content)
  logger.info('游戏版本更新推送: %s → %d 个群', changes.map((c) => c[0]).join('、'), sent)
}

function apply(ctx, config) {
  const runVer = () => check(ctx, config).catch(() => {})
  ctx.setTimeout(runVer, 90 * 1000)
  ctx.setInterval(runVer, 30 * 60 * 1000)

  ctx.command('版本H', 'HaulMP 客户端版本 + 欧卡/美卡版本')
    .alias('版本h')
    .usage('查询 HaulMP 客户端版本与当前游戏版本（来源：Steam）')
    .action(async ({ session }) => {
      if (!session) return
      let v
      try {
        v = await collect(config)
      } catch (e) {
        ctx.logger('haulmp').warn('版本查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!v.client && !v.ets2 && !v.ats) return '查询失败，请稍后再试'
      if (!isText(config, 'version')) {
        const card = await renderCard(ctx, versionCard(v))
        if (card) return card
      }
      return versionText(v)
    })
}

module.exports = { apply, collect, versionCard, versionText, check, gameCard, gameText }
