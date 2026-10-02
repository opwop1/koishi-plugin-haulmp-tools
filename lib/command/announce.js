const fs = require('fs')
const path = require('path')
const { renderCard, esc, isText, cardTheme, CARD_DECO } = require('../util/common')
const { fetchAnnouncements } = require('../api/vtcApi')
const { translateBatch } = require('../util/translate')

function stateFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_company_ann.json')
}

function loadState(ctx) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(ctx), 'utf8'))
  } catch (e) {
    return {}
  }
}

function saveState(ctx, state) {
  try {
    fs.writeFileSync(stateFile(ctx), JSON.stringify(state, null, 1))
  } catch (e) { /* ignore */ }
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

// 🎨 设计提示词（车队公告）：车队长喇叭。琥珀暖光如封蜡火漆，徽记泛光，
// 正文像正式通告，温暖、有人情味。底板为共享 ink 玻璃主题。
function annCard(row, ann, titleCn, bodyCn) {
  const title = titleCn || ann.title || '（无标题）'
  const body = bodyCn || ann.body || ''
  const tag = row.tag || 'VTC'
  const initial = String(tag.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '')[0] || 'V').toUpperCase()
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#f59e0b', '#fbbf24', 720)}
.head{display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid rgba(245,158,11,.18)}
.ava{width:54px;height:54px;border-radius:13px;background:linear-gradient(150deg,rgba(245,158,11,.30),rgba(251,191,36,.12));border:1px solid rgba(245,158,11,.6);color:#ffd08a;font-weight:700;font-size:22px;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 22px rgba(245,158,11,.3)}
.who{flex:1;min-width:0}
.kicker{font-size:13px;color:#c9a86a;letter-spacing:1px}
.cname{font-size:20px;font-weight:700;color:#fff;margin-top:3px}
.cname .tag{color:#ffd08a;font-size:13px;font-weight:600;margin-left:8px}
.stamp{width:60px;height:60px;border:2px solid rgba(245,158,11,.7);border-radius:50%;color:#ffd08a;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;letter-spacing:3px;transform:rotate(-12deg);box-shadow:0 0 20px rgba(245,158,11,.28),inset 0 0 16px rgba(245,158,11,.15);flex:none}
.title{margin-top:20px;font-size:20px;font-weight:700;color:#fff;line-height:1.5;padding-left:14px;border-left:3px solid rgba(245,158,11,.7);text-shadow:0 2px 14px rgba(245,158,11,.25)}
.body{margin-top:12px;font-size:14.5px;line-height:1.95;color:#cdd9e6;white-space:pre-wrap;padding:13px 17px;background:var(--glass-lo);border:1px solid rgba(245,158,11,.14);border-radius:12px}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(245,158,11,.16);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><div class="ava">${esc(initial)}</div><div class="who"><div class="kicker">车队公告</div><div class="cname">${esc(row.name || row.slug)}<span class="tag">${esc(tag)}</span></div></div><div class="stamp">公告</div></div>
<div class="title">${esc(title)}</div>
<div class="body">${esc(body)}</div>
<div class="foot"><span>发布者：${esc(ann.display_name || ann.handle || '—')} · ${fmtWhen(ann.created_at)}</span><span>自动推送 · 机器翻译仅供参考</span></div>
</div></body></html>`
}

function annText(row, ann, titleCn, bodyCn) {
  return `📢 ${row.name || row.slug} 车队公告\n${titleCn || ann.title || ''}\n\n${bodyCn || ann.body || ''}\n\n发布者：${ann.display_name || ann.handle || '—'} · ${fmtWhen(ann.created_at)}`
}

async function pushTo(ctx, rows, content) {
  let sent = 0
  for (const row of rows) {
    try {
      const idx = String(row.channelId).indexOf(':')
      const platform = idx > 0 ? row.channelId.slice(0, idx) : row.platform
      const id = idx > 0 ? row.channelId.slice(idx + 1) : row.channelId
      const bot = ctx.bots.find((b) => b.platform === platform)
      if (!bot) continue
      await bot.sendMessage(id, content)
      sent++
    } catch (e) {
      ctx.logger('haulmp').warn('公告推送失败（%s）: %s', row.channelId, e.message)
    }
  }
  return sent
}

async function check(ctx, config) {
  const logger = ctx.logger('haulmp')
  let rows = []
  try {
    rows = await ctx.database.get('haulmp_company', {})
  } catch (e) {
    return
  }
  if (!rows || !rows.length) return

  const bySlug = new Map()
  for (const r of rows) {
    if (!bySlug.has(r.slug)) bySlug.set(r.slug, [])
    bySlug.get(r.slug).push(r)
  }

  const state = loadState(ctx)
  let changed = false

  for (const [slug, group] of bySlug) {
    let ann = []
    try {
      ann = await fetchAnnouncements(config, slug)
    } catch (e) {
      continue
    }
    if (!ann.length) continue
    const latest = ann.reduce((a, b) => (new Date(b.created_at || 0) > new Date(a.created_at || 0) ? b : a))
    const prev = state[slug]
    if (!prev) {
      state[slug] = { id: latest.id, at: Date.now() }
      changed = true
      logger.info('首次记录车队公告 %s（不推送）', slug)
      continue
    }
    if (prev.id === latest.id) continue

    state[slug] = { id: latest.id, at: Date.now() }
    changed = true

    let titleCn = ''
    let bodyCn = ''
    try {
      const parts = await translateBatch([latest.title || '', latest.body || ''])
      if (parts && parts.length === 2) {
        if (parts[0] && parts[0] !== latest.title) titleCn = parts[0]
        if (parts[1] && parts[1] !== latest.body) bodyCn = parts[1]
      }
    } catch (e) { /* 用原文 */ }

    const row = group[0]
    let content = annText(row, latest, titleCn, bodyCn)
    if (!isText(config, 'announce')) {
      const card = await renderCard(ctx, annCard(row, latest, titleCn, bodyCn))
      if (card) content = card
    }
    const sent = await pushTo(ctx, group, content)
    logger.info('车队公告推送 %s「%s」→ %d 个群', slug, String(latest.title || '').slice(0, 30), sent)
  }

  if (changed) saveState(ctx, state)
}

function apply(ctx, config) {
  const run = () => check(ctx, config).catch((e) => ctx.logger('haulmp').warn('车队公告检测异常: %s', e.message))
  setTimeout(run, 60000)
  ctx.setInterval(run, 10 * 60 * 1000)
}

module.exports = { apply, check, annCard, annText }
