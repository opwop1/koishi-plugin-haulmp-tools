const { renderCard, isText, cardTheme, CARD_DECO } = require('../util/common')

const SECTIONS = [
  ['账号', [
    ['绑定H [ID]', '绑定 HaulMP 论坛账号（示例：绑定H 123456）'],
    ['我的绑定H', '查看当前绑定'],
    ['解绑H', '解除绑定'],
    ['注册', '私聊注册 HaulMP 账号（账号/密码/邮箱 三步）'],
    ['找回密码', '私信用恢复码重置密码（平台无邮件重置）'],
    ['登录', '私聊设备码登录（免密，Steam / 账号密码均可）'],
    ['我的通知', '私聊查看论坛通知（回复 / @ / 徽章）'],
    ['我的行驶记录', '私聊查看里程 / 时长 / 最近会话 / 录制状态'],
    ['退出登录', '私聊退出当前登录'],
  ]],
  ['查询', [
    ['查询H [ID]', '个人资料卡：在线状态 / 徽章 / 里程排名 / 车队任职（支持 @群友）'],
    ['定位H [名字或ID]', '实时定位：地图 + 位置 / 速度 / 朝向 / 车型 + 附近玩家（支持 @群友）'],
  ]],
  ['排行', [
    ['里程排行榜H', '全站里程前十 + 我的名次（前100显名次，否则百分比）'],
  ]],
  ['服务器', [
    ['服务器H', '服务器状态：在线人数 / 协议 / 客户端版本'],
    ['路况H', '全平台实时路况：事故 / 施工 / 交警 / 障碍物 / 检查站'],
    ['版本H', 'HaulMP 客户端版本 + 欧卡/美卡游戏版本'],
  ]],
  ['车队', [
    ['绑定车队H [车队ID或链接]', '绑定本群车队（仅队长可绑定）'],
    ['解绑车队H', '解除本群车队绑定（绑定人或队长）'],
    ['今日里程H', '本群车队当天里程排行'],
  ]],
]

// 🎨 设计提示词（菜单）：星际导航台。靛蓝→紫极光光带，每个分区标题带光条锚点，
// 命令表像星图目录般整齐呼吸，冷艳但不冰冷。底板为共享 ink 玻璃主题。
function menuCard() {
  const sections = SECTIONS.map(([title, items]) => {
    const rows = items.map(([cmd, desc]) => `<div class="mrow"><span class="cmd">${cmd}</span><span class="desc">${desc}</span></div>`).join('')
    return `<div class="mtitle">${title}</div>${rows}`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cardTheme('#6366f1', '#a78bfa', 780)}
.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid rgba(163,166,255,.16)}
.title{font-size:24px;font-weight:700;color:#fff;letter-spacing:1px}
.brand{color:#8b90c8;font-size:13px;font-weight:700;letter-spacing:2px}
.mgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}
.mtitle{grid-column:1 / -1;display:flex;align-items:center;gap:9px;font-size:12.5px;color:#a5a9f5;font-weight:700;letter-spacing:2px;margin-top:10px}
.mtitle:first-child{margin-top:0}
.mtitle::before{content:'';width:3px;height:12px;border-radius:2px;background:linear-gradient(180deg,var(--ac),var(--ac2));box-shadow:0 0 9px var(--ac)}
.mrow{background:linear-gradient(180deg,rgba(99,102,241,.13),rgba(7,14,22,.55) 58%);border:1px solid rgba(99,102,241,.22);border-radius:11px;padding:9px 12px;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.cmd{display:block;font-size:13px;color:#c7caff;font-weight:700;font-family:Consolas,"Cascadia Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.desc{display:block;font-size:11.5px;color:#8ba0b5;margin-top:3px;line-height:1.45}
.foot{margin-top:17px;padding-top:12px;border-top:1px solid rgba(163,166,255,.16);display:flex;justify-content:space-between;font-size:11.5px;color:#6f7395}
</style></head><body><div id="card">${CARD_DECO}
<div class="head"><span class="title">HaulMP 功能菜单</span><span class="brand">MENU</span></div>
<div class="mgrid">${sections}</div>
<div class="foot"><span>HaulMP · 指令末尾 H / h 通用</span><span>发送「菜单」查看本菜单</span></div>
</div></body></html>`
}

function menuText() {
  const lines = ['📖 HaulMP 功能菜单', '━━━━━━━━━━━━']
  for (const [title, items] of SECTIONS) {
    lines.push(`【${title}】`)
    for (const [cmd, desc] of items) lines.push(` · ${cmd} — ${desc}`)
  }
  lines.push('━━━━━━━━━━━━')
  lines.push('（指令末尾 H/h 通用，菜单无需加 H）')
  return lines.join('\n')
}

function apply(ctx, config) {
  ctx.command('菜单', 'HaulMP 功能菜单')
    .alias('menuh', '菜单H')
    .action(async ({ session }) => {
      if (!session) return
      if (!isText(config, 'menu')) {
        const card = await renderCard(ctx, menuCard())
        if (card) return card
      }
      return menuText()
    })
}

module.exports = { apply, menuCard, menuText }
