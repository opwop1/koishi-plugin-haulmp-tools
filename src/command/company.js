const { esc, fmtTime, renderCard, bindingQuery, isText, cardTheme, CARD_DECO } = require('../util/common')
const { fetchCompany } = require('../api/vtcApi')
const { loadSnap, saveSnap, makeSnap, rotateSnapshots, todayStr, fmtKm } = require('../database/companySnap')

const cardCssFor = (accent) => cardTheme(accent || '#3aa86f', '#7fd4a0', 780) + `
.head{display:flex;align-items:baseline;justify-content:space-between}
.title{font-size:23px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#7f93a8;font-size:13px;font-weight:700;letter-spacing:2px}
.sub{font-size:12.5px;color:#8ba0b5;margin-top:6px}
.podium{display:flex;align-items:flex-end;justify-content:center;gap:14px;margin-top:24px;padding:0 8px}
.pod{flex:1;max-width:220px;text-align:center;min-width:0}
.podium .pname{color:#fff;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.podium .phandle{color:#9cc6f0;font-size:11.5px;margin-top:2px}
.podium .pkm{color:#7fe0ac;font-weight:700;font-size:14px;margin:9px 0 9px;text-shadow:0 0 14px rgba(58,168,111,.45)}
.pbase{border-radius:12px 12px 0 0;display:flex;align-items:flex-start;justify-content:center;padding-top:9px;font-size:21px;font-weight:800}
.pod1 .pbase{height:76px;background:linear-gradient(180deg,rgba(232,185,106,.6),rgba(232,185,106,.10));color:#ffd98a;box-shadow:0 -8px 36px rgba(232,185,106,.4)}
.pod2 .pbase{height:54px;background:linear-gradient(180deg,rgba(205,214,224,.42),rgba(205,214,224,.07));color:#e6ebf0}
.pod3 .pbase{height:42px;background:linear-gradient(180deg,rgba(201,141,94,.5),rgba(201,141,94,.09));color:#eab98f}
.board{margin-top:18px;background:var(--glass);border:1px solid var(--stroke);border-radius:12px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.row{display:flex;align-items:center;gap:12px;padding:10px 16px}
.row + .row{border-top:1px solid rgba(255,255,255,.06)}
.row.me{background:linear-gradient(90deg,rgba(58,168,111,.14),rgba(74,144,217,.12))}
.pos{width:34px;text-align:center;font-weight:700;font-size:14.5px;color:#7f93a8;flex:none}
.who{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who b{color:#fff;font-size:14.5px;font-weight:600}
.who span{color:#9cc6f0;font-size:12.5px;margin-left:7px}
.km{font-size:14.5px;font-weight:700;color:#5fd39a;flex:none}
.km small{color:#62748a;font-size:11.5px;font-weight:400;margin-left:8px}
.you{display:inline-block;font-size:11px;color:#5fd39a;border:1px solid rgba(58,168,111,.5);background:rgba(58,168,111,.16);border-radius:999px;padding:1px 8px;margin-left:8px}
.empty{padding:16px;color:#62748a;font-size:13px;text-align:center}
.mine{margin-top:18px;background:linear-gradient(180deg,rgba(58,168,111,.10),rgba(7,14,22,.55));border:1px solid rgba(58,168,111,.4);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 0 24px rgba(58,168,111,.12),inset 0 1px 0 rgba(255,255,255,.06)}
.mine .lab{font-size:13px;color:#5fd39a;flex:none;letter-spacing:1px}
.mine b{color:#fff;font-size:17px}
.mine .note{font-size:12.5px;color:#8ba0b5}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10);display:flex;justify-content:space-between;font-size:12px;color:#62748a}
`

function keyOf(session) {
  return `${session.platform}:${session.channelId || session.userId}`
}

function parseCompanyId(input) {
  let s = String(input || '').trim()
  if (!s) return ''
  const m = s.match(/haulmp\.com\/([^/?#\s]+)\/?$/i)
  if (m) {
    s = m[1]
  } else if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const parts = u.pathname.split('/').filter(Boolean)
      s = parts[parts.length - 1] || ''
    } catch (e) { /* keep */ }
  }
  return decodeURIComponent(s.split(/[?#]/)[0])
}

async function board(ctx, config, key, bind) {
  const company = await fetchCompany(config, bind.slug)
  if (!company) return null

  const snaps = await loadSnap(ctx)
  const today = todayStr()
  const s = snaps[key]
  const sameDay = s && s.slug === bind.slug && s.day === today

  if (!sameDay) {
    // 换档：新的一天/首次 → 立即建立"今天"的基准（旧档直接丢弃，不跨天出数）
    snaps[key] = makeSnap(company)
    await saveSnap(ctx, snaps)
    return { fresh: true, company, rows: [], snapAt: snaps[key].at }
  }

  const baseline = new Map(s.members.map((m) => [String(m[0]).toLowerCase(), Number(m[2]) || 0]))
  const current = (company.roster || []).map((r) => ({
    handle: r.driver.handle,
    name: r.driver.displayName,
    km: r.kmTotal || 0,
  }))
  const rows = current
    .map((c) => {
      const base = baseline.get(c.handle.toLowerCase())
      return { ...c, delta: base == null ? 0 : Math.max(0, c.km - base) }
    })
    .sort((a, b) => b.delta - a.delta || b.km - a.km)

  return { fresh: false, company, rows, snapAt: s.at }
}

// 🎨 设计提示词（今日里程）：车队荣誉墙。以车队品牌色渲染光带与光斑，
// 前三名镀金/银/铜辉光，"我的今日"面板如徽章托，团队感与竞技感并存。底板为共享 ink 玻璃主题。
function boardCard(data, me) {
  const c = data.company.company
  const rows = data.rows
  const isMine = (r) => me && String(r.handle).toLowerCase() === String(me.handle).toLowerCase()
  const podOrder = [
    { r: rows[1], cls: 'pod2' },
    { r: rows[0], cls: 'pod1' },
    { r: rows[2], cls: 'pod3' },
  ]
  const podium = podOrder.map(({ r, cls }) => {
    if (!r) return '<div class="pod" style="visibility:hidden"></div>'
    const rank = cls === 'pod1' ? 1 : cls === 'pod2' ? 2 : 3
    return `<div class="pod ${cls}"><div class="pname">${esc(r.name || r.handle)}${isMine(r) ? '<span class="you">你</span>' : ''}</div><div class="phandle">@${esc(r.handle)}</div><div class="pkm">+${fmtKm(r.delta)} km</div><div class="pbase">${rank}</div></div>`
  }).join('')
  const list = rows.slice(3, 10).map((r, i) => {
    return `<div class="row${isMine(r) ? ' me' : ''}"><span class="pos">${i + 4}</span><div class="who"><b>${esc(r.name || r.handle)}</b><span>@${esc(r.handle)}</span>${isMine(r) ? '<span class="you">你</span>' : ''}</div><div class="km">+${fmtKm(r.delta)} km<small>总 ${fmtKm(r.km)}</small></div></div>`
  }).join('')

  let mineHtml
  if (me) {
    const idx = rows.findIndex((r) => String(r.handle).toLowerCase() === String(me.handle).toLowerCase())
    if (idx >= 0) {
      mineHtml = `<div class="mine"><span class="lab">我的今日</span><span><b>+${fmtKm(rows[idx].delta)} km</b> <span class="note">· 第 ${idx + 1} 名 / 共 ${rows.length} 人 · 累计 ${fmtKm(rows[idx].km)} km</span></span></div>`
    } else {
      mineHtml = `<div class="mine"><span class="lab">我的今日</span><span class="note">你不在该车队名册中</span></div>`
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardCssFor(c.accent)}</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">今日里程排行</span><span class="brand">DAILY</span></div>
<div class="sub">${esc(c.name)} [${esc(c.tag)}] · 基准 ${fmtTime(data.snapAt)} · 共 ${rows.length} 名司机</div>
${rows.length ? `<div class="podium">${podium}</div>` : ''}
<div class="board">${list || (rows.length ? '' : '<div class="empty">暂无数据</div>')}</div>
${mineHtml}
<div class="foot"><span>HaulMP · vtc.haulmp.com</span><span>${fmtTime(Date.now())}</span></div>
</div></body></html>`
}

function boardText(data, me) {
  const c = data.company.company
  const lines = [`🚛 今日里程排行 · ${c.name} [${c.tag}]`, `基准：${fmtTime(data.snapAt)}`, '━━━━━━━━━━━━']
  data.rows.slice(0, 10).forEach((r, i) => {
    const isMe = me && String(r.handle).toLowerCase() === String(me.handle).toLowerCase()
    lines.push(`${i + 1}. ${r.name || r.handle}${isMe ? '（你）' : ''} — +${fmtKm(r.delta)} km（总 ${fmtKm(r.km)}）`)
  })
  lines.push('━━━━━━━━━━━━')
  if (me) {
    const idx = data.rows.findIndex((r) => String(r.handle).toLowerCase() === String(me.handle).toLowerCase())
    if (idx >= 0) lines.push(`👤 我的今日：+${fmtKm(data.rows[idx].delta)} km · 第 ${idx + 1} 名 / 共 ${data.rows.length} 人`)
    else lines.push('👤 你不在该车队名册中')
  }
  return lines.join('\n')
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

// 🎨 设计提示词（车队绑定）：入队仪式。取车队品牌色渲染光带/光斑，
// 徽记发光，"已绑定本群"如绶带，数据块顶光刃，归属感拉满。底板为共享 ink 玻璃主题。
function bindCard(company, rosterCount) {
  const c = company.company
  const tag = c.tag || 'VTC'
  const initial = String(tag.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '')[0] || 'V').toUpperCase()
  const ownerHandle = (c.owner && c.owner.handle) || ''
  const founded = fmtDate(c.createdAt)
  const acc = c.accent || '#4a90d9'
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme(acc, '#7fb4e6', 720)}
.head{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--stroke)}
.ava{width:64px;height:64px;border-radius:16px;background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.05));border:2px solid rgba(255,255,255,.28);color:#fff;font-weight:800;font-size:26px;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 26px var(--ac)}
.who{flex:1;min-width:0}
.kicker{font-size:13px;color:#cfe3f7;letter-spacing:1px}
.cname{font-size:24px;font-weight:800;color:#fff;margin-top:3px;letter-spacing:.5px;text-shadow:0 2px 18px rgba(0,0,0,.4)}
.cname .tag{color:#9cc6f0;font-size:13px;font-weight:600;margin-left:8px}
.ok{flex:none;background:linear-gradient(180deg,rgba(58,168,111,.22),rgba(58,168,111,.08));border:1px solid rgba(94,211,154,.55);color:#7fe0ac;font-weight:700;font-size:13.5px;border-radius:999px;padding:7px 14px;box-shadow:0 0 18px rgba(58,168,111,.22)}
.facts{display:flex;margin-top:18px;background:linear-gradient(180deg,rgba(74,144,217,.10),rgba(7,14,22,.55) 50%);border:1px solid rgba(74,144,217,.22);border-radius:14px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.fact{flex:1;text-align:center;padding:15px 8px;min-width:0}
.fact + .fact{border-left:1px solid rgba(255,255,255,.07)}
.fact b{display:block;font-size:22px;color:#fff;font-weight:800;text-shadow:0 2px 14px rgba(74,144,217,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fact span{display:block;font-size:12px;color:#93a7ba;margin-top:4px;letter-spacing:.5px}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid var(--stroke);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><div class="ava">${esc(initial)}</div><div class="who"><div class="kicker">车队绑定成功</div><div class="cname">${esc(c.name)}<span class="tag">${esc(tag)}</span></div></div><div class="ok">已绑定本群</div></div>
<div class="facts">
<div class="fact"><b>${rosterCount}</b><span>司机</span></div>
<div class="fact"><b>${ownerHandle ? '@' + esc(ownerHandle) : '—'}</b><span>队长</span></div>
<div class="fact"><b>${founded || '—'}</b><span>成立</span></div>
</div>
<div class="foot"><span>今日基准已建立 · 发送「今日里程H」查看排行</span><span>HaulMP</span></div>
</div></body></html>`
}

function apply(ctx, config) {
  ctx.setTimeout(() => rotateSnapshots(ctx, config).catch(() => {}), 20 * 1000)
  ctx.setInterval(() => rotateSnapshots(ctx, config).catch(() => {}), 5 * 60 * 1000)

  ctx.command('绑定车队H <id>', '绑定本群车队（仅队长可绑定，车队ID或链接）')
    .alias('bindch', '绑定车队h')
    .usage('示例：绑定车队H abc123（或直接粘贴车队链接）')
    .action(async ({ session }, keyword) => {
      if (!session) return
      const kw = parseCompanyId(keyword)
      if (!kw) return '请输入车队 ID 或链接，例如：绑定车队H abc123'

      const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
      if (!b) return '请先发送「绑定H 你的ID」绑定论坛账号，绑定车队需要验证队长身份'

      const company = await fetchCompany(config, kw).catch(() => null)
      if (!company) return `没找到车队「${kw}」，请确认为车队 ID（不是名字）`

      const owner = (company.company && company.company.owner) || {}
      if (!owner.handle || String(owner.handle).toLowerCase() !== String(b.handle).toLowerCase()) {
        return `只有队长才能绑定车队（「${company.company.name}」的队长是 @${owner.handle || '未知'}）`
      }

      const key = keyOf(session)
      await ctx.database.remove('haulmp_company', { platform: session.platform, channelId: key })
      await ctx.database.create('haulmp_company', {
        platform: session.platform,
        channelId: key,
        slug: company.company.slug,
        name: company.company.name,
        tag: company.company.tag || '',
        ownerHandle: owner.handle,
        boundBy: session.userId,
        boundAt: new Date(),
      })

      const snaps = await loadSnap(ctx)
      snaps[key] = makeSnap(company)
      await saveSnap(ctx, snaps)

      if (!isText(config, 'companyBind')) {
        const card = await renderCard(ctx, bindCard(company, (company.roster || []).length))
        if (card) return card
      }
      return `绑定成功！本群车队：${company.company.name} [${company.company.tag}]（${(company.roster || []).length} 名司机）\n今日基准已建立，发送「今日里程H」查看排行`
    })

  ctx.command('解绑车队H', '解除本群车队绑定（绑定人或队长可操作）')
    .alias('unbindch', '解绑车队h')
    .action(async ({ session }) => {
      if (!session) return
      const key = keyOf(session)
      const [bind] = await ctx.database.get('haulmp_company', { platform: session.platform, channelId: key })
      if (!bind) return '本群还没有绑定车队'

      let allowed = String(bind.boundBy) === String(session.userId)
      if (!allowed && bind.ownerHandle) {
        const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
        if (b && String(b.handle).toLowerCase() === String(bind.ownerHandle).toLowerCase()) allowed = true
      }
      if (!allowed) return '只有绑定人或车队队长可以解绑'

      await ctx.database.remove('haulmp_company', { platform: session.platform, channelId: key })
      const snaps = await loadSnap(ctx)
      if (snaps[key]) {
        delete snaps[key]
        await saveSnap(ctx, snaps)
      }
      return `已解绑本群车队「${bind.name} [${bind.tag}]」`
    })

  ctx.command('今日里程H', '本群车队今日里程排行')
    .alias('todayh', '今日里程h')
    .action(async ({ session }) => {
      if (!session) return
      const key = keyOf(session)
      const [bind] = await ctx.database.get('haulmp_company', { platform: session.platform, channelId: key })
      if (!bind) return '本群还没绑定车队，队长请先发「绑定车队H 车队名」'

      let data
      try {
        data = await board(ctx, config, key, bind)
      } catch (e) {
        ctx.logger('haulmp').warn('今日里程查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!data) return '查询失败，请稍后再试'

      if (data.fresh) {
        return `基准已建立（${fmtTime(data.snapAt)}）\n司机们跑一段后再发「今日里程H」即可看到排行`
      }

      const [ub] = await ctx.database.get('haulmp_binding', bindingQuery(session))
      if (!isText(config, 'companyBoard')) {
        const card = await renderCard(ctx, boardCard(data, ub))
        if (card) return card
      }
      return boardText(data, ub)
    })
}

module.exports = { apply, board, keyOf, boardCard, boardText, bindCard }
