const fs = require('fs')
const path = require('path')
const { renderCard, esc, fetchJson, isText, cardTheme, CARD_DECO } = require('../util/common')
const { translateBatch } = require('../util/translate')

const STATUS_API = 'https://haulmp.com/api/status'

function statePath(ctx) {
  return path.join(ctx.baseDir, 'data', 'haulmp_client.json')
}

function loadState(ctx) {
  try {
    return JSON.parse(fs.readFileSync(statePath(ctx), 'utf8'))
  } catch (e) {
    return null
  }
}

function saveState(ctx, state) {
  try {
    const p = statePath(ctx)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(state, null, 1))
  } catch (e) { /* ignore */ }
}

function fmtBytes(v) {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtPublished(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

// 🎨 设计提示词（客户端更新）：信号塔通报。冰蓝数据流，版本徽章自带辉光，
// 像新固件在空中广播，干净、科技、可信。底板为共享 ink 玻璃主题。
function updateCard(status, notesCn, oldVersion) {
  const notes = notesCn || status.notes || '（本次更新无说明）'
  const nm = String(status.notes || '').match(/HaulMP\s+([\d.]+)/i)
  const verName = nm ? nm[1] : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#38bdf8', '#22d3ee', 720)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(56,189,248,.16)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#6f9bb3;font-size:13px;font-weight:700;letter-spacing:2px}
.verline{display:flex;align-items:center;gap:14px;margin-top:18px}
.vold{color:#8ba0b5;font-size:15px;padding:6px 13px;border:1px solid var(--stroke-hi);border-radius:10px}
.arrow{color:#38bdf8;font-size:19px;font-weight:700;text-shadow:0 0 12px rgba(56,189,248,.7)}
.vname{font-size:15px;font-weight:700;color:#9bdcff;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.45);border-radius:999px;padding:5px 13px;box-shadow:0 0 16px rgba(56,189,248,.2)}
.vnew{font-size:22px;font-weight:800;color:#9bdcff;padding:6px 17px;background:linear-gradient(180deg,rgba(56,189,248,.25),rgba(56,189,248,.10));border:1px solid rgba(56,189,248,.55);border-radius:12px;box-shadow:0 0 26px rgba(56,189,248,.32)}
.vinfo{margin-left:auto;color:#8ba0b5;font-size:12.5px;text-align:right;line-height:1.7}
.notes{margin-top:16px;padding:14px 18px;background:var(--glass-lo);border:1px solid rgba(56,189,248,.16);border-left:3px solid rgba(56,189,248,.65);border-radius:10px;font-size:14.5px;line-height:1.9;color:#cdd9e6;white-space:pre-wrap}
.foot{margin-top:18px;padding-top:12px;border-top:1px solid rgba(56,189,248,.16);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">HaulMP 客户端更新</span><span class="brand">RELEASE</span></div>
<div class="verline">${oldVersion ? `<span class="vold">v${oldVersion}</span><span class="arrow">→</span>` : ''}<span class="vnew">v${status.version}</span>${verName ? `<span class="vname">HaulMP ${verName}</span>` : ''}<span class="vinfo">发布于 ${fmtPublished(status.publishedAt) || '—'}<br>${fmtBytes(status.bytes)}</span></div>
<div class="notes">${esc(notes)}</div>
<div class="foot"><span>HaulMP · haulmp.com</span><span>自动推送 · 机器翻译仅供参考</span></div>
</div></body></html>`
}

function textFallback(status, notesCn, oldVersion) {
  const notes = notesCn || status.notes || '（本次更新无说明）'
  const nm4 = String(status.notes || '').match(/HaulMP\s+([\d.]+)/i)
  return `📦 HaulMP 客户端更新${oldVersion ? ` v${oldVersion} → v${status.version}` : ` v${status.version}`}${nm4 ? `（HaulMP ${nm4[1]}）` : ''}\n发布于：${fmtPublished(status.publishedAt)} · ${fmtBytes(status.bytes)}\n\n${notes}`
}

async function broadcast(ctx, config, content) {
  let sent = 0
  const only = String((config && config.pushChannels) || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (only.length) {
    for (const ch of only) {
      const idx = ch.indexOf(':')
      const platform = idx > 0 ? ch.slice(0, idx) : 'onebot'
      const id = idx > 0 ? ch.slice(idx + 1) : ch
      const bot = ctx.bots.find((b) => b.platform === platform)
      if (!bot) continue
      try {
        await bot.sendMessage(id, content)
        sent++
      } catch (e) {
        ctx.logger('haulmp').warn('更新推送失败（%s）: %s', ch, e.message)
      }
    }
    return sent
  }
  const bots = ctx.bots.filter((b) => b.platform === 'onebot')
  for (const bot of bots) {
    try {
      const res = await bot.getGuildList()
      const groups = (res && res.data) || res || []
      for (const g of groups) {
        const channelId = g.id != null ? g.id : g.guildId
        if (channelId == null) continue
        try {
          await bot.sendMessage(String(channelId), content)
          sent++
        } catch (e) {
          ctx.logger('haulmp').warn('更新推送失败（群 %s）: %s', channelId, e.message)
        }
      }
    } catch (e) {
      ctx.logger('haulmp').warn('获取群列表失败: %s', e.message)
    }
  }
  return sent
}

async function check(ctx, config) {
  const logger = ctx.logger('haulmp')
  let client
  try {
    const d = await fetchJson(STATUS_API)
    client = d && d.client
  } catch (e) {
    return
  }
  if (!client || client.version == null) return

  const state = loadState(ctx)
  if (!state || state.version == null) {
    saveState(ctx, {
      version: client.version,
      notes: client.notes || '',
      bytes: client.bytes,
      publishedAt: client.publishedAt,
      seenAt: Date.now(),
    })
    logger.info('首次记录客户端版本 v%s（不推送）', client.version)
    return
  }
  if (state.version === client.version) return

  let notesCn = ''
  if (client.notes) {
    try {
      const parts = await translateBatch([client.notes])
      if (parts && parts[0]) notesCn = parts[0]
    } catch (e) {
      notesCn = ''
    }
  }

  saveState(ctx, {
    version: client.version,
    notes: client.notes || '',
    notesCn,
    bytes: client.bytes,
    publishedAt: client.publishedAt,
    pushedAt: Date.now(),
  })

  let content = textFallback(client, notesCn, state.version)
  if (!isText(config, 'changelog')) {
    const card = await renderCard(ctx, updateCard(client, notesCn, state.version))
    if (card) content = card
  }
  const sent = await broadcast(ctx, config, content)
  logger.info('客户端更新 v%s → v%s，已推送到 %d 个群', state.version, client.version, sent)
}

function apply(ctx, config) {
  const run = () => check(ctx, config).catch((e) => ctx.logger('haulmp').warn('更新检测异常: %s', e.message))
  setTimeout(run, 45000)
  ctx.setInterval(run, 10 * 60 * 1000)
}

module.exports = { apply, check, updateCard, textFallback, broadcast }
