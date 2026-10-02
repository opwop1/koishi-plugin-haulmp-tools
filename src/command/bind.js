const { bindingQuery, esc, avatarUrl, resolveAvatar, renderCard, isText, cardTheme, CARD_DECO } = require('../util/common')
const { fetchProfile } = require('../api/forumApi')

// 🎨 设计提示词（绑定成功）：成就解锁。翡翠绿庆典氛围，光环扩散 + 勾选徽记居中，
// 光线收束到姓名，像游戏通关结算界面。底板用共享 ink 玻璃主题（深墨蓝 + 扫描线）。
const CARD_CSS = cardTheme('#3aa86f', '#7fd4a0', 640) + `
.hero{position:relative;height:150px;margin:-26px -28px 0;background:linear-gradient(120deg,rgba(58,168,111,.42),rgba(45,212,191,.24) 60%,rgba(7,16,26,.05));overflow:hidden}
.hero::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 135%,rgba(255,255,255,.20),transparent 60%)}
.avatar{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid #14283b;background:#0f2233;box-shadow:0 0 0 3px rgba(94,211,154,.45),0 12px 40px rgba(0,0,0,.5),0 0 44px rgba(58,168,111,.4)}
.avatar.ph{display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:40px;font-weight:700;color:#dff8ea;background:linear-gradient(150deg,rgba(58,168,111,.45),rgba(45,212,191,.35))}
h1{color:#fff;font-size:26px;margin-top:16px;letter-spacing:6px;text-align:center;text-shadow:0 2px 20px rgba(58,168,111,.4)}
.uline{width:60px;height:3px;margin:11px auto 0;border-radius:2px;background:linear-gradient(90deg,transparent,var(--ac),transparent);box-shadow:0 0 12px var(--ac)}
.name{margin-top:16px;font-size:25px;color:#fff;font-weight:700;text-align:center}
.handle{font-size:14px;color:#9cc6f0;text-align:center;margin-top:4px}
.ribbon{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px}
.rchip{font-size:12.5px;color:#cfe3f7;background:var(--glass);border:1px solid var(--stroke-hi);border-radius:999px;padding:5px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.rchip b{color:#fff}
.hint{margin-top:18px;font-size:13px;color:#8ba0b5;line-height:1.85;text-align:center}
.hint b{color:#cdd9e6}
.foot{margin-top:22px;padding-top:13px;border-top:1px solid rgba(94,211,154,.16);display:flex;justify-content:space-between;font-size:12px;color:#62748a}
`

function successCard(member, session, avatarSrc) {
  const m = member
  const src = avatarSrc !== undefined ? avatarSrc : avatarUrl(m.avatar)
  const avatarEl = src
    ? `<img class="avatar" src="${esc(src)}">`
    : `<div class="avatar ph">${esc((m.displayName || m.handle || '?').slice(0, 1))}</div>`
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div id="card">${CARD_DECO}
<div class="hero"></div>
<div style="text-align:center;margin-top:-72px;position:relative;z-index:3">${avatarEl}</div>
<h1>绑定成功</h1>
<div class="uline"></div>
<div class="name">${esc(m.displayName || m.handle)}</div>
<div class="handle">@${esc(m.handle)}</div>
<div class="ribbon"><span class="rchip">QQ <b>${esc(session.userId)}</b></span>${m.company ? `<span class="rchip">车队 <b>${esc(m.company.name)} [${esc(m.company.tag)}]</b></span>` : ''}</div>
<div class="hint">发送「查询H」查看完整资料 · 发送「解绑H」解除绑定</div>
<div class="foot"><span>HaulMP Forums</span><span>forum.haulmp.com</span></div>
</div></body></html>`
}

function apply(ctx, config) {
  ctx.command('绑定H <handle>', '绑定 HaulMP 论坛账号')
    .alias('bindh', '绑定h')
    .usage('示例：绑定H 123456')
    .action(async ({ session }, handle) => {
      if (!session) return
      const key = String(handle || '').trim().replace(/^@+/, '')
      if (!key) return '请输入要绑定的 ID，例如：绑定H 123456'

      const [exist] = await ctx.database.get('haulmp_binding', bindingQuery(session))
      if (exist) {
        return `你已经绑定过 ${exist.displayName}（@${exist.handle}）了，如需更换请先发送「解绑H」`
      }

      let data
      try {
        data = await fetchProfile(config.apiBase, key)
      } catch (e) {
        ctx.logger('haulmp').warn('绑定查询失败: %s', e.message)
        return '查询失败，请稍后再试'
      }
      if (!data) return `没找到用户「${key}」，请检查 ID 是否正确`

      const m = data.member
      await ctx.database.create('haulmp_binding', {
        ...bindingQuery(session),
        handle: m.handle,
        displayName: m.displayName || m.handle,
        forumId: m.id || '',
        boundAt: new Date(),
      })

      if (!isText(config, 'bind')) {
        const card = await renderCard(ctx, successCard(m, session, await resolveAvatar(m)))
        if (card) return card
      }
      return `${m.displayName || m.handle} 绑定成功！`
    })

  ctx.command('我的绑定H', '查看已绑定的 HaulMP 账号')
    .alias('我的绑定h')
    .action(async ({ session }) => {
      if (!session) return
      const [b] = await ctx.database.get('haulmp_binding', bindingQuery(session))
      if (!b) return '你还没有绑定，发送「绑定H 你的ID」即可绑定'
      return `你绑定的是 ${b.displayName}（@${b.handle}）`
    })

  ctx.command('解绑H', '解除 HaulMP 账号绑定')
    .alias('解绑h')
    .action(async ({ session }) => {
      if (!session) return
      const res = await ctx.database.remove('haulmp_binding', bindingQuery(session))
      return res && res.removed ? '已解绑' : '你还没有绑定'
    })
}

module.exports = { apply, successCard }
