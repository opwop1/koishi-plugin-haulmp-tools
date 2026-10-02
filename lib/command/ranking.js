const { esc, fmtTime, bindingQuery, renderCard, isText, cardTheme, CARD_DECO } = require('../util/common')
const { ensureCache } = require('../database/rankCache')

const CARD_CSS = cardTheme('#e8b96a', '#f0a04b', 760) + `
.head{display:flex;align-items:baseline;justify-content:space-between}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#a8925f;font-size:13px;font-weight:700;letter-spacing:2px}
.sub{font-size:12.5px;color:#8ba0b5;margin-top:6px}
.podium{display:flex;align-items:flex-end;justify-content:center;gap:14px;margin-top:26px;padding:0 8px}
.pod{flex:1;max-width:215px;text-align:center;min-width:0}
.podium .pname{color:#fff;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.podium .phandle{color:#9cc6f0;font-size:11.5px;margin-top:2px}
.podium .pkm{color:#f0c887;font-weight:700;font-size:14px;margin:9px 0 9px;text-shadow:0 0 14px rgba(232,185,106,.4)}
.pbase{border-radius:12px 12px 0 0;display:flex;align-items:flex-start;justify-content:center;padding-top:9px;font-size:21px;font-weight:800}
.pod1 .pbase{height:76px;background:linear-gradient(180deg,rgba(232,185,106,.6),rgba(232,185,106,.10));color:#ffd98a;box-shadow:0 -8px 36px rgba(232,185,106,.4)}
.pod2 .pbase{height:54px;background:linear-gradient(180deg,rgba(205,214,224,.42),rgba(205,214,224,.07));color:#e6ebf0}
.pod3 .pbase{height:42px;background:linear-gradient(180deg,rgba(201,141,94,.5),rgba(201,141,94,.09));color:#eab98f}
.board{margin-top:20px;background:var(--glass);border:1px solid rgba(232,185,106,.16);border-radius:12px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.row{display:flex;align-items:center;gap:12px;padding:10px 16px}
.row + .row{border-top:1px solid rgba(255,255,255,.06)}
.row.me{background:linear-gradient(90deg,rgba(232,185,106,.12),rgba(74,144,217,.12))}
.pos{width:34px;text-align:center;font-weight:700;font-size:14.5px;color:#a8925f;flex:none}
.who{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who b{color:#fff;font-size:14.5px;font-weight:600}
.who span{color:#9cc6f0;font-size:12.5px;margin-left:7px}
.km{font-size:14.5px;font-weight:700;color:#f0c887;flex:none}
.you{display:inline-block;font-size:11px;color:#5fd39a;border:1px solid rgba(58,168,111,.5);background:rgba(58,168,111,.16);border-radius:999px;padding:1px 8px;margin-left:8px}
.mine{margin-top:18px;background:linear-gradient(180deg,rgba(232,185,106,.10),rgba(7,14,22,.55));border:1px solid rgba(232,185,106,.4);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 0 24px rgba(232,185,106,.12),inset 0 1px 0 rgba(255,255,255,.06)}
.mine .lab{font-size:13px;color:#f0c887;flex:none;letter-spacing:1px}
.mine b{color:#fff;font-size:17px}
.mine .note{font-size:12.5px;color:#8ba0b5}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10);display:flex;justify-content:space-between;font-size:12px;color:#62748a}
`

function fmtKm(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function isMe(entry, bound) {
  return !!(bound && entry && String(entry[0]).toLowerCase() === String(bound.handle || '').toLowerCase())
}

// 🎨 设计提示词（排行榜）：黑金荣誉殿堂。金色渐变光带 + 暖金光斑；
// 名次发光（金/银/铜各有色温），里程数字用暖金辉光；"我的排名"面板金边泛光，
// 像奖牌陈列柜，庄重里带一点庆典感。底板为共享 ink 玻璃主题。
function rankCard(topData, mine, bound) {
  const top = topData.top || []
  const podOrder = [
    { x: top[1], cls: 'pod2' },
    { x: top[0], cls: 'pod1' },
    { x: top[2], cls: 'pod3' },
  ]
  const podium = podOrder.map(({ x, cls }) => {
    if (!x) return '<div class="pod" style="visibility:hidden"></div>'
    const [handle, km, displayName] = x
    const me = isMe(x, bound)
    const rank = cls === 'pod1' ? 1 : cls === 'pod2' ? 2 : 3
    return `<div class="pod ${cls}"><div class="pname">${esc(displayName || handle)}${me ? '<span class="you">你</span>' : ''}</div><div class="phandle">@${esc(handle)}</div><div class="pkm">${fmtKm(km)} km</div><div class="pbase">${rank}</div></div>`
  }).join('')
  const rows = top.slice(3).map((x, i) => {
    const [handle, km, displayName] = x
    const me = isMe(x, bound)
    return `<div class="row${me ? ' me' : ''}"><span class="pos">${i + 4}</span><div class="who"><b>${esc(displayName || handle)}</b><span>@${esc(handle)}</span>${me ? '<span class="you">你</span>' : ''}</div><div class="km">${fmtKm(km)} km</div></div>`
  }).join('')

  let mineHtml
  if (mine && mine.rank) {
    if (mine.rank <= 100) {
      mineHtml = `<div class="mine"><span class="lab">我的排名</span><span><b>第 ${mine.rank} 名</b> <span class="note">/ 共 ${mine.total} 人 · ${fmtKm(mine.km)} km</span></span></div>`
    } else {
      const pct = (((mine.total - mine.rank) / mine.total) * 100).toFixed(1)
      mineHtml = `<div class="mine"><span class="lab">我的排名</span><span><b>超过 ${pct}% 的人</b> <span class="note">/ 共 ${mine.total} 人 · ${fmtKm(mine.km)} km</span></span></div>`
    }
  } else if (mine) {
    mineHtml = `<div class="mine"><span class="lab">我的排名</span><span class="note">未收录（全站 ${mine.total} 人）</span></div>`
  } else {
    mineHtml = `<div class="mine"><span class="lab">我的排名</span><span class="note">未绑定，发送「绑定H 你的论坛ID」后显示</span></div>`
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">HaulMP 里程排行榜</span><span class="brand">TOP 10</span></div>
<div class="sub">全站 ${topData.total} 名司机 · 数据更新 ${fmtTime(topData.at)}</div>
<div class="podium">${podium}</div>
<div class="board">${rows}</div>
${mineHtml}
<div class="foot"><span>HaulMP Forums · forum.haulmp.com</span><span>${fmtTime(Date.now())}</span></div>
</div></body></html>`
}

function rankText(topData, mine, bound) {
  const lines = [`🏆 HaulMP 里程排行榜（全站 ${topData.total} 人）`, '━━━━━━━━━━━━']
  topData.top.forEach((x, i) => {
    const [handle, km, displayName] = x
    lines.push(`${i + 1}. ${displayName || handle}${isMe(x, bound) ? '（你）' : ''} — ${fmtKm(km)} km`)
  })
  lines.push('━━━━━━━━━━━━')
  if (mine && mine.rank) {
    if (mine.rank <= 100) {
      lines.push(`👤 我的排名：第 ${mine.rank} 名 / 共 ${mine.total} 人 · ${fmtKm(mine.km)} km`)
    } else {
      const pct = (((mine.total - mine.rank) / mine.total) * 100).toFixed(1)
      lines.push(`👤 我的排名：超过 ${pct}% 的人 / 共 ${mine.total} 人 · ${fmtKm(mine.km)} km`)
    }
  } else if (mine) {
    lines.push(`👤 我的排名：未收录（全站 ${mine.total} 人）`)
  } else {
    lines.push('👤 未绑定，发送「绑定H 你的ID」后显示我的排名')
  }
  lines.push(`🕐 更新：${fmtTime(topData.at)}`)
  return lines.join('\n')
}

function apply(ctx, config) {
  ctx.command('里程排行榜H', 'HaulMP 里程排行榜（前十 + 我的排名）')
    .alias('rankh', '里程排行榜h')
    .action(async ({ session }) => {
      if (!session) return
      const cache = await ensureCache(ctx, config)
      if (!cache) return '排行榜数据构建中（约3-5分钟），请稍后再试'

      const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
      let mine = null
      if (b) {
        const key = String(b.handle || '').toLowerCase()
        const rank = cache.rankOf.get(key)
        mine = { rank: rank || null, total: cache.total, km: cache.kmOf.get(key) || 0 }
      }

      const topData = { at: cache.at, total: cache.total, top: cache.list.slice(0, 10) }
      if (!isText(config, 'ranking')) {
        const card = await renderCard(ctx, rankCard(topData, mine, b))
        if (card) return card
      }
      return rankText(topData, mine, b)
    })
}

module.exports = { apply, rankCard, rankText }
