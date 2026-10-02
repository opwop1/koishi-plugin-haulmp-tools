const { Schema } = require('koishi')
const { warm, setupHttp } = require('./util/common')
const model = require('./database/model')
const bind = require('./command/bind')
const query = require('./command/query')
const ranking = require('./command/ranking')
const status = require('./command/status')
const company = require('./command/company')
const locate = require('./command/locate')
const city = require('./database/cityCache')
const menu = require('./command/menu')
const changelog = require('./command/changelog')
const announce = require('./command/announce')
const traffic = require('./command/traffic')
const version = require('./command/version')
const register = require('./command/register')
const login = require('./command/login')

const name = 'haulmp-bot'
const inject = ['database', 'puppeteer']

const CARD_MODES = [
  Schema.const('image').description('图片'),
  Schema.const('text').description('文字'),
]
const cardMode = (desc) => Schema.union(CARD_MODES).default('image').description(desc)

const Config = Schema.object({
  apiBase: Schema.string()
    .default('https://forum.haulmp.com/api/forum')
    .description('HaulMP 论坛 API 根地址'),
  vtcBase: Schema.string()
    .default('https://vtc.haulmp.com/api')
    .description('HaulMP VTC API 根地址'),
  statusUrl: Schema.string()
    .default('https://haulmp.com/api/status')
    .description('HaulMP 服务器在线状态接口'),
  mapLiveUrl: Schema.string()
    .default('https://map.haulmp.com/api/live')
    .description('HaulMP 实时地图数据接口'),
  pushChannels: Schema.string()
    .default('')
    .description('自动推送限定群（逗号分隔，如 onebot:1075867897；留空 = 推送到全部群）'),
  output: Schema.object({
    bind: cardMode('绑定'),
    query: cardMode('资料查询'),
    ranking: cardMode('里程排行榜'),
    status: cardMode('服务器状态'),
    companyBind: cardMode('车队绑定'),
    companyBoard: cardMode('今日里程'),
    menu: cardMode('菜单'),
    changelog: cardMode('客户端更新推送'),
    announce: cardMode('车队公告推送'),
    locate: cardMode('实时定位'),
    traffic: cardMode('路况'),
    version: cardMode('版本'),
    gameVersion: cardMode('游戏版本更新'),
    myNotify: cardMode('我的通知'),
    myDrive: cardMode('我的行驶记录'),
  }).description('各功能输出方式（图片 / 文字）'),
})

const GLUED_COMMANDS = ['我的行驶记录H', '我的通知H', '找回密码H', '退出登录H', '我的绑定H', '里程排行榜H', '绑定车队H', '解绑车队H', '今日里程H', '登录H', '绑定H', '解绑H', '查询H', '定位H', '服务器H', '路况H', '版本H', '注册H']
const GLUED_VARIANTS = GLUED_COMMANDS.flatMap((n) => (n.endsWith('H') ? [n, n.slice(0, -1) + 'h'] : [n])).sort((a, b) => b.length - a.length)

function apply(ctx, config) {
  setupHttp()
  const warmUrls = () => {
    warm(config.mapLiveUrl).catch(() => {})
    warm(config.statusUrl).catch(() => {})
  }
  ctx.setTimeout(warmUrls, 25 * 1000)
  ctx.setInterval(warmUrls, 25 * 1000)

  ctx.middleware(async (session, next) => {
    try {
      const content = session.content
      if (content && content.length > 3) {
        for (const name of GLUED_VARIANTS) {
          if (content.startsWith(name)) {
            const rest = content.slice(name.length)
            if (rest && !/^[\s\u3000]/.test(rest)) {
              session.content = name + ' ' + rest
            }
            break
          }
        }
      }
    } catch (e) { /* ignore */ }
    return next()
  }, true)

  model(ctx)

  bind.apply(ctx, config)
  query.apply(ctx, config)
  ranking.apply(ctx, config)
  status.apply(ctx, config)
  company.apply(ctx, config)
  locate.apply(ctx, config)
  city.apply(ctx, config)
  menu.apply(ctx, config)
  changelog.apply(ctx, config)
  announce.apply(ctx, config)
  traffic.apply(ctx, config)
  version.apply(ctx, config)
  register.apply(ctx, config)
  login.apply(ctx, config)
}

module.exports = { name, inject, Config, apply }
