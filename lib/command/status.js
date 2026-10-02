const { esc, fmtTime, fetchJsonMemo, renderCard, isText, cardTheme, CARD_DECO } = require('../util/common')

const CARD_CSS = cardTheme('#3aa86f', '#2dd4bf', 720) + `
.head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px}
.title{font-size:23px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#6f9a86;font-size:13px;font-weight:700;letter-spacing:2px}
.hero-num{text-align:center;padding:16px 0 6px}
.ring{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:1px solid rgba(58,168,111,.55);box-shadow:0 0 20px rgba(58,168,111,.35);margin-bottom:8px}
.dot{width:10px;height:10px;border-radius:50%;background:#8fa3b8}
.dot.on{background:#3aa86f;box-shadow:0 0 12px rgba(58,168,111,1)}
.big{font-size:66px;font-weight:800;color:#fff;line-height:1.02;text-shadow:0 8px 44px rgba(58,168,111,.55)}
.cap{color:#93a7ba;font-size:13px;margin-top:6px;letter-spacing:3px}
.hstate{margin-top:9px;font-size:12.5px;color:#5fd39a;letter-spacing:2px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
.tile{background:linear-gradient(180deg,rgba(58,168,111,.11),rgba(7,14,22,.55) 52%);border:1px solid rgba(58,168,111,.2);border-radius:12px;padding:11px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.tile .t{font-size:12px;color:#7fa896;letter-spacing:1px}
.tile .v{font-size:15px;color:#eef6f1;font-weight:600;margin-top:5px}
.on{color:#5fd39a;text-shadow:0 0 10px rgba(58,168,111,.6)}
.off{color:#e05656}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10);display:flex;justify-content:space-between;font-size:12px;color:#62748a}
`

function fmtBytes(n) {
  const v = Number(n || 0)
  if (!v) return '—'
  return (v / 1024 / 1024).toFixed(1) + ' MB'
}

function kvRows(d) {
  const rows = []
  rows.push(['状态', d.online ? '<span class="on">在线</span>' : '<span class="off">离线</span>', true])
  const cap = d.maxPlayers != null ? Math.max(Number(d.maxPlayers) || 0, Number(d.players) || 0) : null
  rows.push(['在线人数', `${d.players ?? '—'}${cap != null ? ` / ${cap}` : ''}`])
  rows.push(['协议版本', d.protocol != null ? `v${d.protocol}` : '—'])
  const c = d.client || {}
  if (c.version != null) rows.push(['客户端', `v${c.version} · ${fmtBytes(c.bytes)}`])
  if (c.publishedAt) rows.push(['客户端发布', fmtTime(c.publishedAt)])
  if (d.updatedAt) rows.push(['数据更新', fmtTime(d.updatedAt)])
  return rows
}

// 🎨 设计提示词（服务器状态）：机房哨站。青绿渐变光带象征"在线/健康"；
// 面板像终端监控窗，绿色数据带自发光；整体沉静、专业、有脉搏感。底板为共享 ink 玻璃主题。
function statusCard(d) {
  const online = d.players
  const cap = d.maxPlayers != null ? Math.max(Number(d.maxPlayers) || 0, Number(d.players) || 0) : null
  const heroHtml = `<div class="hero-num"><div class="ring"><span class="dot${d.online ? ' on' : ''}"></span></div><div class="big">${online != null ? online : '—'}</div><div class="cap">当前在线司机${cap != null ? ` / 上限 ${cap}` : ''}</div><div class="hstate">${d.online ? '服务器在线' : '服务器离线'}</div></div>`
  const tiles = kvRows(d)
    .filter(([k]) => k !== '状态' && k !== '在线人数')
    .map(([k, v]) => `<div class="tile"><div class="t">${k}</div><div class="v">${v}</div></div>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">HaulMP 服务器状态</span><span class="brand">SERVER</span></div>
${heroHtml}
<div class="tiles">${tiles}</div>
<div class="foot"><span>HaulMP · haulmp.com</span><span>${fmtTime(Date.now())}</span></div>
</div></body></html>`
}

function statusText(d) {
  const lines = ['🖥 HaulMP 服务器状态', '━━━━━━━━━━━━']
  lines.push(`📌 状态：${d.online ? '🟢 在线' : '⚫ 离线'}`)
  lines.push(`👥 在线人数：${d.players ?? '—'}${d.maxPlayers != null ? ` / ${Math.max(Number(d.maxPlayers) || 0, Number(d.players) || 0)}` : ''}`)
  lines.push(`📡 协议版本：v${d.protocol ?? '—'}`)
  const c = d.client || {}
  if (c.version != null) lines.push(`📦 客户端：v${c.version} · ${fmtBytes(c.bytes)}`)
  if (c.publishedAt) lines.push(`🗓 客户端发布：${fmtTime(c.publishedAt)}`)
  if (d.updatedAt) lines.push(`🕐 数据更新：${fmtTime(d.updatedAt)}`)
  return lines.join('\n')
}

function apply(ctx, config) {
  ctx.command('服务器H', 'HaulMP 服务器状态（不含在线司机列表）')
    .alias('statush', '服务器h')
    .action(async ({ session }) => {
      if (!session) return
      let d
      try {
        d = await fetchJsonMemo(config.statusUrl, 60000)
      } catch (e) {
        ctx.logger('haulmp').warn('服务器状态查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!d || typeof d !== 'object') return '查询失败，请稍后再试'

      if (!isText(config, 'status')) {
        const card = await renderCard(ctx, statusCard(d))
        if (card) return card
      }
      return statusText(d)
    })
}

module.exports = { apply, statusCard, statusText }
