// 数据库模型定义（原 index.js 内的 ctx.model.extend，对齐 ets2-tools-tmp 的 database/model 职责）
function model(ctx) {
  ctx.model.extend('haulmp_binding', {
    id: 'unsigned',
    platform: 'string',
    userId: 'string',
    handle: 'string',
    displayName: 'string',
    forumId: 'string',
    boundAt: 'timestamp',
  }, { autoInc: true })

  ctx.model.extend('haulmp_company', {
    id: 'unsigned',
    platform: 'string',
    channelId: 'string',
    slug: 'string',
    name: 'string',
    tag: 'string',
    ownerHandle: 'string',
    boundBy: 'string',
    boundAt: 'timestamp',
  }, { autoInc: true })

  ctx.model.extend('haulmp_login', {
    id: 'unsigned',
    platform: 'string',
    userId: 'string',
    handle: 'string',
    displayName: 'string',
    cookies: 'text',
    at: 'timestamp',
    expireAt: 'timestamp',
  }, { autoInc: true })

  ctx.model.extend('haulmp_city', {
    id: 'unsigned',
    name: 'string',
    nameCn: 'string',
    lon: 'double',
    lat: 'double',
    updatedAt: 'timestamp',
  }, { autoInc: true })
}

module.exports = model
