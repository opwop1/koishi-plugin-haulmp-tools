const { fetchJson, fetchJsonMemo, cardTheme, CARD_DECO, bindingQuery, fmtTime, fmtMoney, esc, avatarUrl, resolveAvatar, renderCard, matchByName, loadIdMap, saveIdMap, memberByNick, isText } = require('../util/common')
const { fetchProfile } = require('../api/forumApi')
const { getMileageRank, handleByName } = require('../database/rankCache')
const { cityZhBatch } = require('../database/cityCache')

const ROLE_ZH = {
  'Company Director': '公司董事',
  'Company Owner': '公司老板',
  Manager: '经理',
  Driver: '司机',
}

const MANUAL_BADGES = {
  welcomer: '欢迎使者',
  developer: '开发者',
  contributor: '贡献者',
  supporter: '赞助者',
  event_staff: '活动工作人员',
  beta_tester: 'Beta 测试员',
  bug_hunter: 'Bug 猎手',
  bug_slayer: 'Bug 终结者',
  event_attendee: '活动参与者',
  event_winner: '活动赢家',
  convoy_leader: '联运领队',
  christmas_convoy: '圣诞联运',
  halloween_haul: '万圣节运输',
  photo_op: '上镜时刻',
  special_delivery: '特别运输',
  parking_pro: '停车专家',
  fuel_light: '油量告急',
  wrong_turn: '走错路了',
  charity_hauler: '慈善运输',
}

const BADGES = [
  ['first_haul', '首次货运', (m) => (m.deliveries || 0) > 0],
  ['km_1000', '千里之行', (m) => (m.km || 0) >= 1000],
  ['km_10000', '万里长征', (m) => (m.km || 0) >= 10000],
  ['km_100000', '十万公里', (m) => (m.km || 0) >= 100000],
  ['km_1000000', '百万公里', (m) => (m.km || 0) >= 1000000],
  ['deliveries_100', '百单司机', (m) => (m.deliveries || 0) >= 100],
  ['deliveries_1000', '千单司机', (m) => (m.deliveries || 0) >= 1000],
  ['long_haul', '长途司机', (m) => (m.longestKm || 0) >= 800],
  ['night_driver', '夜班司机', (m) => (m.nightDeliveries || 0) >= 10],
  ['clean_sheet', '无货损', (m) => (m.cleanDeliveries || 0) >= 25],
  ['first_topic', '首次发帖', (m) => (m.threads || 0) > 0],
  ['posts_100', '百帖写手', (m) => (m.posts || 0) >= 100],
  ['posts_1000', '千帖写手', (m) => (m.posts || 0) >= 1000],
  ['posts_10000', '万帖写手', (m) => (m.posts || 0) >= 10000],
  ['popular', '热门帖', (m) => (m.topReaction || 0) >= 10],
  ['respected', '声望达人', (m) => (m.reputation || 0) >= 100],
  ['conversation_starter', '话题发起者', (m) => (m.threads || 0) >= 10],
  ['helpful', '有帮助', (m) => (m.solutions || 0) > 0],
  ['regular', '常客', (m) => (m.activeDays || 0) >= 30],
  ['necromancer', '考古学家', (m) => !!m.necro],
  ['vtc_member', '车队成员', (m) => !!m.vtcMember],
  ['company_owner', '公司老板', (m) => !!m.owner],
  ['steam', 'Steam 绑定', (m) => !!m.steam],
  ['founder', '创始成员', (m) => !!m.memberSince && new Date(m.memberSince) < new Date('2026-12-01T00:00:00Z')],
  ['early_adopter', '早期用户', (m) => !!m.earlyAdopter],
  ['convoy_regular', '联运常客', (m) => (m.convoys || 0) >= 5],
  ['convoy_veteran', '联运老将', (m) => (m.convoys || 0) >= 25],
  ['one_year', '一周年', (m, now) => !!m.memberSince && now - new Date(m.memberSince).getTime() >= 365 * 864e5],
  ['five_years', '五周年', (m, now) => !!m.memberSince && now - new Date(m.memberSince).getTime() >= 5 * 365 * 864e5],
  ['still_truckin', '初心不改', (m, now) => !!m.memberSince && now - new Date(m.memberSince).getTime() >= 365 * 864e5 && !!m.lastActive && now - new Date(m.lastActive).getTime() < 30 * 864e5],
]

const CARD_CSS = cardTheme('#4a90d9', '#8b5cf6', 820) + `
.hero{position:relative;margin:-26px -28px 0;height:112px;background:linear-gradient(120deg,rgba(74,144,217,.45),rgba(139,92,246,.32) 62%,rgba(7,16,26,.05))}
.hero::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at 80% -30%,rgba(255,255,255,.22),transparent 55%)}
.hero-row{position:relative;display:block;height:100%;padding:0;z-index:2}
.avatar{position:absolute;left:28px;top:10px;width:92px;height:92px;border-radius:24px;object-fit:cover;border:3px solid rgba(255,255,255,.38);background:#0f2233;box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 30px rgba(74,144,217,.4)}
.avatar.ph{display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;color:#dbe9fb;background:linear-gradient(150deg,rgba(74,144,217,.4),rgba(139,92,246,.35))}
.hero-who{position:absolute;left:140px;right:170px;top:50%;transform:translateY(-50%);min-width:0}
.name{font-size:26px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 16px rgba(0,0,0,.5)}
.handle{font-size:14px;color:#cfe3f7;font-weight:400;margin-left:8px}
.hero-right{position:absolute;top:12px;right:28px;display:flex;gap:10px;align-items:center}
.brand{color:rgba(255,255,255,.6);font-size:13px;font-weight:700;letter-spacing:2px}
.bound{display:inline-block;font-size:12px;color:#8af0b8;border:1px solid rgba(94,211,154,.6);background:rgba(20,40,30,.45);border-radius:999px;padding:2px 10px;box-shadow:0 0 12px rgba(58,168,111,.35)}
.status{font-size:13.5px;color:#cfe3f7;margin-top:6px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;background:#8fa3b8}
.dot.on{background:#3aa86f;box-shadow:0 0 0 4px rgba(58,168,111,.18),0 0 10px rgba(58,168,111,.9)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.chip{font-size:12.5px;color:#9cc6f0;background:linear-gradient(180deg,rgba(74,144,217,.22),rgba(74,144,217,.10));border:1px solid rgba(74,144,217,.4);border-radius:999px;padding:3px 12px;white-space:nowrap;box-shadow:0 0 14px rgba(74,144,217,.15),inset 0 1px 0 rgba(255,255,255,.06)}
.chip.gold{color:#f0c887;background:linear-gradient(180deg,rgba(224,138,46,.2),rgba(224,138,46,.08));border-color:rgba(224,138,46,.45);box-shadow:0 0 14px rgba(224,138,46,.18)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.stat{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(74,144,217,.13),rgba(7,14,22,.55) 46%);border:1px solid rgba(74,144,217,.22);border-radius:12px;padding:13px 8px 11px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.stat::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;background:linear-gradient(90deg,transparent,var(--ac),transparent)}
.stat b{display:block;font-size:23px;color:#fff;font-weight:700;text-shadow:0 2px 14px rgba(74,144,217,.35)}
.stat span{display:block;font-size:12px;color:#93a7ba;margin-top:4px;letter-spacing:.5px}
.top{display:flex;gap:26px;margin-top:20px;align-items:flex-start}
.tcol{flex:1;min-width:0}
.tcol.wide{flex:1.35}
.section{margin-top:20px}
.top .section{margin-top:0}
.section:first-child{margin-top:20px}
.section h3{display:flex;align-items:center;gap:9px;font-size:12.5px;color:#9cc6f0;font-weight:700;letter-spacing:2px;margin-bottom:10px}
.section h3::before{content:'';width:3px;height:12px;border-radius:2px;background:linear-gradient(180deg,var(--ac),var(--ac2));box-shadow:0 0 9px var(--ac)}
.kv{font-size:13.5px;line-height:1.85}
.kv .row{white-space:normal;word-break:break-all}
.kv b{color:#cdd9e6;font-weight:600;margin-right:7px}
.haul{background:var(--glass);border:1px solid rgba(74,144,217,.16);border-radius:12px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.haul-row{display:flex;align-items:center;gap:12px;padding:10px 14px}
.haul-row + .haul-row{border-top:1px solid rgba(255,255,255,.06)}
.haul-main{flex:1;min-width:0}
.haul-route{color:#fff;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.haul-cargo{color:#8ba0b5;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.haul-meta{text-align:right;font-size:12px;color:#8ba0b5;flex:none;line-height:1.55}
.ok{color:#3aa86f}
.cancel{color:#e05656}
.empty{color:#62748a;font-size:13px;padding:12px 14px;background:var(--glass-lo);border:1px solid rgba(74,144,217,.14);border-radius:12px}
.foot{margin-top:4px;padding-top:13px;border-top:1px solid rgba(255,255,255,.10);display:flex;justify-content:space-between;font-size:12px;color:#62748a}
`

function computeBadges(m, staff, now) {
  const labels = []
  for (const [, label, test] of BADGES) {
    try {
      if (test(m, now)) labels.push(label)
    } catch (e) { /* ignore */ }
  }
  if (staff) labels.unshift('官方团队')
  return labels
}

async function fetchExtras(config, m) {
  const extras = {}
  const rosterP = m.company && m.company.slug
    ? fetchJsonMemo(`${config.vtcBase}/public/company/${encodeURIComponent(m.company.slug)}`, 6 * 3600 * 1000)
        .then((d) => {
          if (d && Array.isArray(d.roster)) {
            extras.roster = d.roster.find((r) => r.driver && r.driver.handle === m.handle) || null
          }
        })
        .catch(() => {})
    : Promise.resolve()
  const [s, l] = await Promise.all([
    fetchJsonMemo(config.statusUrl, 60000).catch(() => null),
    fetchJsonMemo(config.mapLiveUrl, 30000).catch(() => null),
    rosterP,
  ])
  const names = []
  if (m.displayName && m.company && m.company.tag) names.push(`[${m.company.tag}] ${m.displayName}`)
  names.push(m.displayName || m.handle)
  const pick = (list) => {
    if (!Array.isArray(list)) return null
    for (const n of names) {
      const r = matchByName(list, n)
      if (r) return r
    }
    return null
  }
  extras.game = pick(s && s.drivers)
  extras.live = pick(l && l.players)
  if (s && typeof s.players === 'number') extras.total = s.players
  else if (l && Array.isArray(l.players)) extras.total = l.players.length
  return extras
}

// 🎨 设计提示词（资料卡）：深夜蓝紫极光仪表盘。冷色渐变光带压顶，右上/左下两团低饱和光斑呼吸感；
// 头像用渐变描边环 + 冷光晕；徽章玻璃拟态；四个数据块顶部细光刃 + 数字辉光；
// 标题左侧光条锚点；克制的发光，不刺眼。底板为共享 ink 玻璃主题。
function profileCard(data, extras, opts) {
  const m = data.member || {}
  extras = extras || {}
  opts = opts || {}

  const avatarSrc = opts.avatarSrc !== undefined ? opts.avatarSrc : avatarUrl(m.avatar)
  const avatarEl = avatarSrc
    ? `<img class="avatar" src="${esc(avatarSrc)}">`
    : `<div class="avatar ph">${esc((m.displayName || m.handle || '?').slice(0, 1))}</div>`

  const chips = []
  if (m.admin) chips.push('管理员')
  if (m.beta) chips.push('Beta 测试者')
  if (m.supporter) chips.push('支持者')
  if (m.earlyAdopter) chips.push('早期用户')
  chips.push(...computeBadges(m, data.staff, Date.now()))
  const manual = (m.awarded || []).map((k) => MANUAL_BADGES[k] || k)

  const stats = [
    [m.km || 0, '公里'],
    [(m.driving || {}).hours || 0, '驾驶小时'],
    [m.deliveries || 0, '完成货运'],
    [m.longestKm || 0, '最长单程(km)'],
  ]

  const kv = []
  kv.push(['论坛ID', m.id || '—', false])
  kv.push(['注册', fmtTime(m.memberSince), false])
  if (m.country) kv.push(['国家', m.country, false])
  if (m.title) kv.push(['头衔', m.title, false])
  if (m.company) kv.push(['公司', `${m.company.name} [${m.company.tag}]`, false])
  kv.push(['绑定', m.steam ? 'Steam ✓' : '无', false])
  const mr = extras.mileage
  if (mr && mr.rank) {
    if (mr.rank <= 100) kv.push(['排名', `全站里程第 ${mr.rank} 名 / 共 ${mr.total} 人`, false])
    else {
      const pct = (((mr.total - mr.rank) / mr.total) * 100).toFixed(1)
      kv.push(['排名', `里程超过 ${pct}% 的人 / 共 ${mr.total} 人`, false])
    }
  } else if (mr) kv.push(['排名', `未收录（全站 ${mr.total} 人）`, false])
  else kv.push(['排名', '排名缓存构建中，稍后再查', false])
  if (extras.game) {
    const bits = [`正在驾驶「${extras.game.model}」`]
    if (extras.live && typeof extras.live.speed === 'number') bits.push(`${extras.live.speed} km/h`)
    kv.push(['游戏', bits.join(' · '), false])
  } else if (extras.live) {
    kv.push(['游戏', `在线 · ${extras.live.speed} km/h`, false])
  } else {
    kv.push(['游戏', '不在游戏中', false])
  }
  if (m.bio) kv.push(['简介', m.bio, true])
  if (m.signature) kv.push(['签名', m.signature, true])
  const links = []
  const l = m.links || {}
  if (l.website) links.push(l.website)
  if (l.steam) links.push(l.steam)
  if (l.youtube) links.push(l.youtube)
  if (l.twitch) links.push(l.twitch)
  if (links.length) kv.push(['链接', links.join(' · '), true])

  let rosterHtml = ''
  const r = extras.roster
  if (r) {
    const rows = [
      ['职位', ROLE_ZH[r.role] || r.role],
      ['入职', fmtTime(r.joinedAt)],
      ['近30天', `${r.km30 || 0} km / ${r.deliveries30 || 0} 单`],
      ['累计', `${r.kmTotal || 0} km / ${r.deliveriesTotal || 0} 单`],
    ]
    if (r.lastDrive) rows.push(['最后驾驶', fmtTime(r.lastDrive)])
    if (r.driving) rows.push(['当前', '正在驾驶'])
    rosterHtml = `<div class="section"><h3>车队任职 · ${esc(m.company ? `${m.company.name} [${m.company.tag}]` : '')}</h3><div class="kv">${rows.map(([k, v]) => `<div class="row"><b>${k}</b>${esc(v)}</div>`).join('')}</div></div>`
  }

  const ds = (data.deliveries || []).slice(0, 5)
  let haulHtml
  if (!ds.length) {
    haulHtml = '<div class="empty">暂无货运记录</div>'
  } else {
    haulHtml = `<div class="haul">${ds.map((j) => {
      const dmg = Math.round((j.damage || 0) * 100)
      const st = j.status === 'delivered'
        ? '<span class="ok">已完成</span>'
        : j.status === 'cancelled'
          ? '<span class="cancel">已取消</span>'
          : esc(j.status)
      return `<div class="haul-row"><div class="haul-main"><div class="haul-route">${esc(j.origin)} → ${esc(j.destination)}</div><div class="haul-cargo">${esc(j.cargo || '—')} · ${fmtMoney(j.revenue)}</div></div><div class="haul-meta"><div>${j.km || 0} km · 货损 ${dmg}%</div><div>${st} · ${fmtTime(j.at)}</div></div></div>`
    }).join('')}</div>`
  }

  const rs = (data.recent || []).slice(0, 3)
  let postsHtml = ''
  if (rs.length) {
    postsHtml = `<div class="section"><h3>最近发帖</h3><div class="kv">${rs.map((p) => `<div class="row full">「${esc(p.title)}」<span style="color:#62748a">${esc(p.categoryName || '')} · ${fmtTime(p.createdAt)}</span></div>`).join('')}</div></div>`
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div id="card">${CARD_DECO}
<div class="hero"><div class="hero-row">${avatarEl}<div class="hero-who"><div class="name">${esc(m.displayName || m.handle)}<span class="handle">@${esc(m.handle)}</span></div><div class="status"><span class="dot${m.online ? ' on' : ''}"></span>${m.online ? '在线' : '离线'}</div></div></div><div class="hero-right"><span class="brand">HaulMP</span>${opts.bound ? '<span class="bound">已绑定</span>' : ''}</div></div>
${(chips.length || manual.length) ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}${manual.map((c) => `<span class="chip gold">${esc(c)}</span>`).join('')}</div>` : '<div style="height:30px"></div>'}
<div class="stats">${stats.map(([v, k]) => `<div class="stat"><b>${esc(v)}</b><span>${k}</span></div>`).join('')}</div>
<div class="top">
<div class="tcol wide"><div class="section"><h3>资料</h3><div class="kv">${kv.map(([k, v, full]) => `<div class="row${full ? ' full' : ''}"><b>${k}</b>${esc(v)}</div>`).join('')}</div></div></div>
${rosterHtml ? `<div class="tcol">${rosterHtml}</div>` : ''}
</div>
<div class="section"><h3>最近货运</h3>${haulHtml}</div>
${postsHtml}
<div class="foot"><span>HaulMP Forums · forum.haulmp.com</span><span>${typeof extras.total === 'number' ? `服务器在线 ${extras.total} 人 · ` : ''}${fmtTime(Date.now())}</span></div>
</div></body></html>`
}

function formatProfile(data, extras, opts) {
  const m = data.member || {}
  extras = extras || {}
  opts = opts || {}
  const lines = []

  lines.push(`🚛 ${m.displayName || m.handle}（@${m.handle}）${opts.bound ? ' · 已绑定' : ''}`)
  lines.push('━━━━━━━━━━━━')
  lines.push(`📌 状态：${m.online ? '🟢 在线' : '⚫ 离线'}`)
  if (extras.game) {
    const bits = [`正在驾驶「${extras.game.model}」`]
    if (extras.live && typeof extras.live.speed === 'number') bits.push(`${extras.live.speed} km/h`)
    lines.push(`🎮 游戏状态：${bits.join(' · ')}`)
  } else if (extras.live) {
    lines.push(`🎮 游戏状态：在线 · ${extras.live.speed} km/h`)
  } else {
    lines.push('🎮 游戏状态：不在游戏中')
  }
  if (typeof extras.total === 'number') lines.push(`🖥 服务器在线：${extras.total} 人`)
  lines.push(`🆔 论坛ID：${m.id || '—'}`)
  lines.push(`🗓 注册：${fmtTime(m.memberSince)}`)

  const info = []
  if (m.country) info.push(`🌍 ${m.country}`)
  if (m.title) info.push(`🎖 ${m.title}`)
  if (m.company) info.push(`🏢 ${m.company.name} [${m.company.tag}]`)
  if (info.length) lines.push(info.join(' · '))

  const tags = []
  if (m.admin) tags.push('管理员')
  if (m.beta) tags.push('Beta 测试者')
  if (m.supporter) tags.push('支持者')
  if (m.earlyAdopter) tags.push('早期用户')
  if (tags.length) lines.push(`🏷 身份：${tags.join(' · ')}`)

  lines.push(`🔗 绑定：${m.steam ? 'Steam ✓' : '无'}`)

  const badges = computeBadges(m, data.staff, Date.now())
  const manual = (m.awarded || []).map((k) => `★${MANUAL_BADGES[k] || k}`)
  const allBadges = badges.concat(manual)
  if (allBadges.length) lines.push(`🏅 徽章：${allBadges.join(' · ')}`)

  if (m.suspended) lines.push(`⛔ 封禁：${m.suspended}`)
  if (m.bio) lines.push(`📝 简介：${m.bio}`)
  if (m.signature) lines.push(`✍️ 签名：${m.signature}`)

  const l = m.links || {}
  const ext = []
  if (l.website) ext.push(`官网 ${l.website}`)
  if (l.steam) ext.push(`Steam ${l.steam}`)
  if (l.youtube) ext.push(`YouTube ${l.youtube}`)
  if (l.twitch) ext.push(`Twitch ${l.twitch}`)
  if (ext.length) lines.push(`🌐 链接：${ext.join(' · ')}`)

  lines.push('━━━━━━━━━━━━')
  lines.push(`📊 论坛：${m.posts || 0} 帖 · ${m.threads || 0} 主题 · ${m.reputation || 0} 声望 · ${m.solutions || 0} 采纳 · ${m.activeDays || 0} 活跃天`)
  const drv = m.driving || {}
  lines.push(`🛣 驾驶：${m.km || 0} km · ${drv.hours || 0} 小时 · 完成 ${m.deliveries || 0} 单`)
  lines.push(`📏 最长单程 ${m.longestKm || 0} km · 夜班 ${m.nightDeliveries || 0} · 无货损 ${m.cleanDeliveries || 0} · 联运 ${m.convoys || 0}`)
  const mr = extras.mileage
  if (mr && mr.rank) {
    if (mr.rank <= 100) lines.push(`🏆 全站里程排名：第 ${mr.rank} 名 / 共 ${mr.total} 人`)
    else {
      const pct = (((mr.total - mr.rank) / mr.total) * 100).toFixed(1)
      lines.push(`🏆 全站里程排名：超过 ${pct}% 的人 / 共 ${mr.total} 人`)
    }
  } else if (mr) lines.push(`🏆 全站里程排名：未收录（全站 ${mr.total} 人）`)
  else lines.push('🏆 全站里程排名：缓存构建中，稍后再查')

  const r = extras.roster
  if (r) {
    lines.push('━━━━━━━━━━━━')
    lines.push(`🏢 车队任职（${m.company ? `${m.company.name} [${m.company.tag}]` : '—'}）：`)
    lines.push(`   职位：${ROLE_ZH[r.role] || r.role} · 入职：${fmtTime(r.joinedAt)}`)
    lines.push(`   近30天：${r.km30 || 0} km / ${r.deliveries30 || 0} 单 · 累计：${r.kmTotal || 0} km / ${r.deliveriesTotal || 0} 单`)
    if (r.lastDrive) lines.push(`   最后驾驶：${fmtTime(r.lastDrive)}`)
    if (r.driving) lines.push('   🚦 当前正在驾驶')
  }

  const ds = data.deliveries || []
  lines.push('━━━━━━━━━━━━')
  lines.push(`📦 最近货运（${ds.length}）：`)
  if (!ds.length) {
    lines.push('  暂无')
  } else {
    ds.slice(0, 5).forEach((j, i) => {
      const st = j.status === 'delivered' ? '✅ 已完成' : j.status === 'cancelled' ? '❌ 已取消' : `📄 ${j.status}`
      const dmg = Math.round((j.damage || 0) * 100)
      lines.push(`  ${i + 1}. ${j.origin} → ${j.destination}`)
      lines.push(`     ${j.cargo || '—'} · ${j.km || 0} km · ${fmtMoney(j.revenue)} · 货损 ${dmg}%`)
      lines.push(`     ${st} · ${fmtTime(j.at)}`)
    })
  }

  const rs = data.recent || []
  if (rs.length) {
    lines.push('━━━━━━━━━━━━')
    lines.push('📝 最近发帖：')
    rs.slice(0, 3).forEach((r2) => {
      lines.push(`  「${r2.title}」${r2.categoryName || ''} · ${fmtTime(r2.createdAt)}`)
    })
  }

  return lines.join('\n')
}

async function snapshotLiveIds(ctx, config) {
  try {
    const live = await fetchJsonMemo(config.mapLiveUrl, 30000)
    if (!live || !Array.isArray(live.players)) return
    const map = loadIdMap(ctx)
    let changed = false
    for (const p of live.players) {
      if (p && p.id != null && p.name) {
        const k = String(p.id)
        if (map[k] !== p.name) {
          map[k] = p.name
          changed = true
        }
      }
    }
    if (changed) saveIdMap(ctx, map)
  } catch (e) { /* ignore */ }
}

async function resolveHandle(ctx, config, key, session) {
  if (/^\d+$/.test(key)) {
    const [b] = await ctx.database.get('haulmp_binding', { userId: key })
    if (b && b.handle) return b.handle

    let name = loadIdMap(ctx)[key] || ''
    if (!name) {
      try {
        const live = await fetchJsonMemo(config.mapLiveUrl, 30000)
        const p = (live.players || []).find((x) => String(x.id) === key)
        if (p) name = p.name
      } catch (e) { /* ignore */ }
    }
    if (name) {
      const h = await handleByName(ctx, name)
      if (h) return h
    }
    return ''
  }
  if (session && session.guildId && session.bot) {
    const m = await memberByNick(session.bot, session.guildId, key).catch(() => null)
    if (m) {
      const [b] = await ctx.database.get('haulmp_binding', { platform: session.platform, userId: m.id })
      if (b && b.handle) return b.handle
    }
  }
  return ''
}

function apply(ctx, config) {
  const snap = () => snapshotLiveIds(ctx, config).catch(() => {})
  setTimeout(snap, 90 * 1000)
  ctx.setInterval(snap, 10 * 60 * 1000)

  ctx.command('查询H [handle]', '查询 HaulMP 账号信息')
    .alias('queryh', '查询h')
    .usage('不填时查询已绑定的账号；例如：查询H / 查询H 注册账号（如 gebilaohei） / 查询H @群友')
    .action(async ({ session }, handle) => {
      if (!session) return
      const raw = String(handle || '').trim()
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

      let bound = false
      let target = key.replace(/<at[^>]*\/?>/g, '').trim()

      if (atId) {
        const [b] = await ctx.database.get('haulmp_binding', { platform: session.platform, userId: atId })
        if (!b) return 'TA 还没有绑定，让 TA 发送「绑定H 论坛ID」后即可查询'
        target = b.handle
        bound = true
      } else if (!target) {
        const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
        if (!b) return '你还没有绑定，发送「绑定H 你的ID」，或直接用「查询H 别人的ID」/「查询H @群友」'
        target = b.handle
        bound = true
      }

      let data
      try {
        data = await fetchProfile(config.apiBase, target)
      } catch (e) {
        ctx.logger('haulmp').warn('查询用户失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!data && target) {
        const resolved = await resolveHandle(ctx, config, target, session).catch(() => '')
        if (resolved && resolved.toLowerCase() !== target.toLowerCase()) {
          try {
            data = await fetchProfile(config.apiBase, resolved)
          } catch (e) {
            data = null
          }
          if (data) target = resolved
        }
      }
      if (!data) return `没找到「${target}」。支持：注册账号（如 gebilaohei）/ 游戏ID / QQ号（已绑定群友）/ @群友`

      let extras = {}
      let avatarSrc = ''
      try {
        const [ex, av, mv] = await Promise.all([
          fetchExtras(config, data.member),
          resolveAvatar(data.member),
          getMileageRank(ctx, config, data.member.handle).catch(() => null),
        ])
        extras = ex
        avatarSrc = av
        extras.mileage = mv
      } catch (e) {
        ctx.logger('haulmp').warn('查询扩展数据失败: %s', e.message)
      }

      const deliveries = Array.isArray(data.deliveries) ? data.deliveries : []
      const cityNames = []
      for (const j of deliveries) {
        if (j.origin) cityNames.push(j.origin)
        if (j.destination) cityNames.push(j.destination)
      }
      const zhMap = await cityZhBatch(ctx, cityNames).catch(() => new Map())
      for (const j of deliveries) {
        if (j.origin && zhMap.get(j.origin)) j.origin = zhMap.get(j.origin)
        if (j.destination && zhMap.get(j.destination)) j.destination = zhMap.get(j.destination)
      }

      if (!isText(config, 'query')) {
        const card = await renderCard(ctx, profileCard(data, extras, { bound, avatarSrc }))
        if (card) return card
      }
      return formatProfile(data, extras, { bound })
    })
}

module.exports = { apply, profileCard, formatProfile, computeBadges, fetchExtras }
