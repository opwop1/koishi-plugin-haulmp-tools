// 私聊登录态功能：设备码登录 / 退出登录 / 找回密码 / 我的通知 / 我的行驶记录
const { renderCard, isText, esc, cardTheme, CARD_DECO } = require('../util/common')
const { accountsApi } = require('../api/accountsApi')
const { fetchNotifications } = require('../api/forumApi')
const { driverMe, gameStatus } = require('../api/vtcApi')
const { checkPassword } = require('./register')

const POLL_MS = 3000
const LOGIN_DAYS = 29

const KINDS = {
  reply: '回复了你的主题',
  mention: '在帖子中提到了你',
  reaction: '赞了你的帖子',
  solution: '将你的回复标为解决方案',
  badge: '授予你徽章',
  sanction: '对你的账号执行了管理操作',
}

function isPrivate(session) {
  return !!session.isDirect || String(session.channelId || '').startsWith('private:')
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

function fmtDur(sec) {
  const n = Number(sec) || 0
  const hours = Math.floor(n / 3600)
  const mins = Math.round((n % 3600) / 60)
  if (hours <= 0) return `${mins} 分钟`
  return `${hours} 小时 ${mins} 分`
}

function fmtKm(n) {
  return Number(n || 0).toLocaleString('en-US')
}

async function getLogin(ctx, session) {
  try {
    const [row] = await ctx.database.get('haulmp_login', { platform: session.platform, userId: String(session.userId) })
    if (!row) return null
    if (row.expireAt && new Date(row.expireAt).getTime() < Date.now()) return null
    return row
  } catch (e) {
    return null
  }
}

async function saveLogin(ctx, { platform, userId }, user, cookies) {
  const key = { platform, userId: String(userId) }
  await ctx.database.remove('haulmp_login', key)
  await ctx.database.create('haulmp_login', {
    ...key,
    handle: user.handle || '',
    displayName: user.displayName || user.handle || '',
    cookies: cookies || '',
    at: new Date(),
    expireAt: new Date(Date.now() + LOGIN_DAYS * 24 * 3600 * 1000),
  })
}

async function clearLogin(ctx, session) {
  await ctx.database.remove('haulmp_login', { platform: session.platform, userId: String(session.userId) })
}

// 🎨 设计提示词（我的通知）：信匣。蓝紫光带 + 未读泛绿，行如仪表盘读数。底板为共享 ink 玻璃主题。
function notifyCard(row, items, unread) {
  const rows = items.slice(0, 8).map((i) => {
    const kind = KINDS[i.kind] || '有新动态'
    const actor = (i.actor && (i.actor.displayName || i.actor.handle)) || '系统'
    const unreadCls = i.readAt ? '' : ' on'
    return `<div class="nrow${unreadCls}"><span class="nk">${esc(kind)}</span><span class="nt">${esc(actor)}：${esc(i.title || '')}</span><span class="nw">${fmtWhen(i.createdAt)}</span></div>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#4a90d9', '#8b5cf6', 720)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(74,144,217,.18)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.badge{background:linear-gradient(180deg,rgba(74,144,217,.22),rgba(74,144,217,.08));border:1px solid rgba(74,144,217,.5);color:#9cc6f0;font-weight:700;font-size:14px;border-radius:999px;padding:5px 14px}
.rows{margin-top:14px}
.nrow{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid rgba(255,255,255,.06)}
.nrow.on .nk{color:#7fe0ac}
.nk{color:#7fb4e6;font-weight:700;font-size:13px;flex:none;width:118px}
.nt{flex:1;min-width:0;color:#dbe6f0;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw{color:#62748a;font-size:12px;flex:none}
.empty{padding:22px;text-align:center;color:#62748a;font-size:14px}
.foot{margin-top:16px;padding-top:12px;border-top:1px solid rgba(74,144,217,.18);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">我的通知</span><span class="badge">${unread} 条未读</span></div>
<div class="rows">${rows || '<div class="empty">暂无通知</div>'}</div>
<div class="foot"><span>账号：${esc(row.handle)}</span><span>HaulMP Forums</span></div>
</div></body></html>`
}

function notifyText(row, items, unread) {
  const lines = [`🔔 我的通知 · ${unread} 条未读（${row.handle}）`]
  if (!items.length) lines.push('暂无通知')
  for (const i of items.slice(0, 8)) {
    const kind = KINDS[i.kind] || '有新动态'
    const actor = (i.actor && (i.actor.displayName || i.actor.handle)) || '系统'
    lines.push(`· [${kind}] ${actor}：${i.title || ''}（${fmtWhen(i.createdAt)}）`)
  }
  return lines.join('\n')
}

// 🎨 设计提示词（我的行驶记录）：行车日志。绿→蓝光带，六宫格数据 + 最近会话列表；
// "正在录制"如信号灯。底板为共享 ink 玻璃主题。
function driveCard(row, me, game) {
  const s = me.summary || {}
  const recording = game && game.session
  const sessions = (me.sessions || []).slice(0, 5).map((x) => {
    const dur = fmtDur(x.driving_seconds)
    const span = x.closed_at ? `${fmtWhen(x.started_at)} → ${fmtWhen(x.closed_at)}` : `${fmtWhen(x.started_at)} · 进行中`
    return `<div class="srow"><span class="sspan">${esc(span)}</span><span class="ssrv">${esc(x.server_name || '')}</span><span class="skm">${fmtKm(x.distance_km)} km</span><span class="sdur">${dur}</span></div>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#3aa86f', '#38bdf8', 760)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(58,168,111,.18)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.state{font-size:13px;font-weight:700;border-radius:999px;padding:5px 13px}
.state.on{color:#7fe0ac;background:rgba(58,168,111,.14);border:1px solid rgba(94,211,154,.5)}
.state.off{color:#8ba0b5;background:var(--glass-lo);border:1px solid var(--stroke-hi)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
.st{background:var(--glass-lo);border:1px solid var(--stroke);border-radius:13px;padding:12px 8px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.st b{display:block;font-size:20px;color:#fff;font-weight:800}
.st span{display:block;font-size:11.5px;color:#8ba0b5;margin-top:4px}
.sec{margin-top:18px;font-size:12.5px;color:#7fe0ac;font-weight:700;letter-spacing:2px}
.srow{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px}
.sspan{flex:1;min-width:0;color:#dbe6f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ssrv{color:#9cc6f0;flex:none}
.skm{color:#5fd39a;font-weight:700;flex:none}
.sdur{color:#8ba0b5;flex:none;width:90px;text-align:right}
.empty{padding:18px;text-align:center;color:#62748a;font-size:13.5px}
.foot{margin-top:16px;padding-top:12px;border-top:1px solid rgba(58,168,111,.18);display:flex;justify-content:space-between;font-size:11.5px;color:#62748a}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">我的行驶记录</span><span class="state ${recording ? 'on' : 'off'}">${recording ? `正在录制 · ${esc(recording.server_name || '')}` : '未连接驾驶'}</span></div>
<div class="stats">
<div class="st"><b>${fmtKm(s.distance_km)}</b><span>总里程(km)</span></div>
<div class="st"><b>${fmtDur(s.driving_seconds)}</b><span>驾驶时长</span></div>
<div class="st"><b>${Math.round(Number(s.max_speed) || 0)}</b><span>最高时速(km/h)</span></div>
<div class="st"><b>${Number(s.delivered) || 0}</b><span>完成货运</span></div>
<div class="st"><b>${Number(s.cancelled) || 0}</b><span>取消</span></div>
<div class="st"><b>${Math.round((Number(s.average_damage) || 0) * 1000) / 10}%</b><span>平均货损</span></div>
</div>
<div class="sec">最近会话</div>
${sessions || '<div class="empty">暂无行驶会话</div>'}
<div class="foot"><span>账号：${esc(row.handle)} · 数据源：游戏遥测</span><span>HaulMP</span></div>
</div></body></html>`
}

function driveText(row, me, game) {
  const s = me.summary || {}
  const recording = game && game.session
  const lines = [
    `🚛 我的行驶记录（${row.handle}）`,
    recording ? `🎮 正在录制 · ${recording.server_name || ''}` : '🎮 未连接驾驶',
    `总里程 ${fmtKm(s.distance_km)} km · 时长 ${fmtDur(s.driving_seconds)} · 最高 ${Math.round(Number(s.max_speed) || 0)} km/h`,
    `完成 ${Number(s.delivered) || 0} · 取消 ${Number(s.cancelled) || 0} · 平均货损 ${Math.round((Number(s.average_damage) || 0) * 1000) / 10}%`,
  ]
  const sessions = (me.sessions || []).slice(0, 5)
  if (sessions.length) {
    lines.push('━━━━━━━━━━━━')
    for (const x of sessions) {
      const span = x.closed_at ? `${fmtWhen(x.started_at)} → ${fmtWhen(x.closed_at)}` : `${fmtWhen(x.started_at)} · 进行中`
      lines.push(`· ${span} | ${x.server_name || ''} | ${fmtKm(x.distance_km)} km | ${fmtDur(x.driving_seconds)}`)
    }
  }
  return lines.join('\n')
}

function apply(ctx, config) {
  const pending = new Map()
  const recoverSessions = new Map()
  const RECOVER_TTL = 5 * 60 * 1000

  ctx.middleware(async (session, next) => {
    if (!session || !isPrivate(session) || !session.userId || !session.user) return next()
    const key = String(session.userId)
    const st = recoverSessions.get(key)
    if (!st) return next()
    if (Date.now() - st.at > RECOVER_TTL) {
      recoverSessions.delete(key)
      return next()
    }
    const text = String(session.content || '').trim()
    if (!text) return next()
    if (text === '取消' || text === '取消H' || text === '取消h') {
      recoverSessions.delete(key)
      return '已取消找回密码'
    }
    st.at = Date.now()
    if (st.step === 'handle') {
      if (!/^[A-Za-z0-9_]{3,24}$/.test(text)) return '账号格式不对（3-24 位，字母/数字/下划线），请重新输入：'
      st.handle = text
      st.step = 'recovery'
      return '请输入注册时保存的 64 位恢复码（在注册成功时机器人发给你的那串）：'
    }
    if (st.step === 'recovery') {
      const code = text.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
      if (code.length !== 64) return '恢复码应为 64 位，请检查后重新输入（只含 0-9、a-f）：'
      st.recoveryCode = code
      st.step = 'password'
      return '请输入新密码（至少 8 位；不能是常见词、连续数字或包含账号名）：'
    }
    if (st.step === 'password') {
      const err = checkPassword(text, st.handle)
      if (err) return `密码不合规（${err}），请重新输入：`
      st.password = text
      st.step = 'confirm'
      return `请核对重置信息：\n\n账号：${st.handle}\n恢复码：${st.recoveryCode.slice(0, 8)}…${st.recoveryCode.slice(-4)}\n新密码：已填写（不回显）\n\n回复「确认」提交重置；回复「取消」终止`
    }
    if (st.step === 'confirm') {
      if (text !== '确认' && text !== '确认重置') return '回复「确认」提交重置，或「取消」终止'
      recoverSessions.delete(key)
      let r
      try {
        r = await accountsApi('/api/auth/recover', { body: { handle: st.handle, recoveryCode: st.recoveryCode, password: st.password } })
      } catch (e) {
        return '❌ 重置请求失败（网络问题），请稍后再试'
      }
      const d = r.data || {}
      if (r.status === 200 && d.user) {
        return [
          '✅ 密码已重置成功！',
          '',
          `账号：${d.user.handle}`,
          '',
          '⚠️ 你的恢复码已更换（旧的已失效），请立即保存新的恢复码（只显示这一次）：',
          String(d.recoveryCode || '（未返回，请到官网重新找回）'),
          '',
          '下一步：发送「登录」完成设备码登录（30 天），或直接用新密码登录官网',
        ].join('\n')
      }
      const msg = d.error || d.message || `HTTP ${r.status}`
      const hint = /recovery|code|invalid|incorrect/i.test(String(msg)) ? '（账号或恢复码不对，请核对后重试）' : ''
      return `❌ 重置失败：${msg}${hint}`
    }
    return next()
  })

  ctx.setInterval(async () => {
    for (const [userId, p] of pending) {
      if (Date.now() > p.expiresAt) {
        pending.delete(userId)
        continue
      }
      try {
        const r = await accountsApi('/api/auth/device/poll', { body: { code: p.code, secret: p.secret } })
        if (!(r.data && r.data.approved && r.data.user)) continue
        pending.delete(userId)
        const cookies = r.cookies || ''
        if (!cookies) continue
        try {
          await saveLogin(ctx, { platform: p.platform, userId }, r.data.user, cookies)
        } catch (e) {
          continue
        }
        const bot = ctx.bots.find((b) => b.platform === p.platform)
        if (bot) {
          bot.sendMessage(`private:${userId}`, [
            `✅ 登录成功！（${r.data.user.displayName || r.data.user.handle}）`,
            '',
            '现在可以私信我发送：',
            '· 我的通知 — 论坛通知（回复/@/徽章等）',
            '· 我的行驶记录 — 总里程/时长/最近会话/是否在录制',
            '· 退出登录 — 退出当前账号',
            '（登录有效期 30 天）',
          ].join('\n')).catch(() => {})
        }
      } catch (e) { /* ignore */ }
    }
  }, POLL_MS)

  ctx.command('登录', '私信登录 HaulMP（设备码，免密）')
    .alias('登录h', '登录H')
    .action(async ({ session }) => {
      if (!session) return
      if (!isPrivate(session)) return '请私聊机器人发送「登录」'
      const exist = await getLogin(ctx, session)
      if (exist) {
        return `你已经登录（${exist.handle}），有效期至 ${fmtWhen(exist.expireAt)}。\n换号请先发送「退出登录」`
      }
      let r
      try {
        r = await accountsApi('/api/auth/device/start', { body: {} })
      } catch (e) {
        return '❌ 无法连接账号服务，请稍后再试'
      }
      const d = r.data || {}
      if (!d.code || !d.secret) return '❌ 获取登录码失败，请稍后再试'
      pending.set(String(session.userId), {
        platform: session.platform,
        code: d.code,
        secret: d.secret,
        expiresAt: Date.now() + (Number(d.expiresIn) || 600) * 1000,
      })
      return [
        '🔐 请在浏览器打开下面的链接，登录并点击「批准」：',
        `https://accounts.haulmp.com/?device=${d.code}`,
        '',
        '· Steam 登录或账号密码登录都可以',
        '· 链接 10 分钟内有效，批准后我会在这里通知你',
      ].join('\n')
    })

  ctx.command('退出登录', '退出 HaulMP 登录')
    .alias('退出登录h', '退出登录H')
    .action(async ({ session }) => {
      if (!session) return
      if (!isPrivate(session)) return '请私聊机器人发送「退出登录」'
      pending.delete(String(session.userId))
      await clearLogin(ctx, session).catch(() => {})
      return '已退出登录'
    })

  ctx.command('找回密码', '私信重置 HaulMP 密码（恢复码，无邮件重置）')
    .alias('找回密码h', '找回密码H', '重置密码')
    .action(async ({ session }) => {
      if (!session) return
      if (!isPrivate(session)) return '请私聊机器人发送「找回密码」'
      recoverSessions.set(String(session.userId), { step: 'handle', at: Date.now() })
      return '开始找回密码 🔑\n\n请输入你的账号（3-24 位，字母/数字/下划线）\n（随时发送「取消」终止）'
    })

  ctx.command('我的通知', '私信查看论坛通知')
    .alias('我的通知h', '我的通知H')
    .action(async ({ session }) => {
      if (!session) return
      if (!isPrivate(session)) return '请私聊机器人发送「我的通知」'
      const row = await getLogin(ctx, session)
      if (!row) return '你还没有登录，请先私聊发送「登录」'
      let r
      try {
        r = await fetchNotifications(row.cookies)
      } catch (e) {
        return '查询失败，请稍后再试'
      }
      if (r.status === 401) {
        await clearLogin(ctx, session).catch(() => {})
        return '登录已失效，请重新发送「登录」'
      }
      const items = (r.data && r.data.items) || []
      const unread = (r.data && r.data.unread) || 0
      if (!isText(config, 'myNotify')) {
        const card = await renderCard(ctx, notifyCard(row, items, unread))
        if (card) return card
      }
      return notifyText(row, items, unread)
    })

  ctx.command('我的行驶记录', '私信查看行驶记录')
    .alias('我的行驶记录h', '我的行驶记录H')
    .action(async ({ session }) => {
      if (!session) return
      if (!isPrivate(session)) return '请私聊机器人发送「我的行驶记录」'
      const row = await getLogin(ctx, session)
      if (!row) return '你还没有登录，请先私聊发送「登录」'
      let me = null
      let game = null
      try {
        const [a, b] = await Promise.all([
          driverMe(row.cookies),
          gameStatus(row.cookies),
        ])
        if (a.status === 401) {
          await clearLogin(ctx, session).catch(() => {})
          return '登录已失效，请重新发送「登录」'
        }
        me = a.data
        game = b && b.data
      } catch (e) {
        return '查询失败，请稍后再试'
      }
      if (!me || !me.summary) return '查询失败，请稍后再试'
      if (!isText(config, 'myDrive')) {
        const card = await renderCard(ctx, driveCard(row, me, game))
        if (card) return card
      }
      return driveText(row, me, game)
    })
}

module.exports = { apply }
