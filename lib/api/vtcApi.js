// HaulMP VTC API（车队信息 / 公告 / 登录态的驾驶数据）
const { fetchJson } = require('../util/common')
const { VTC_ROOT } = require('../util/constant')
const { request } = require('./accountsApi')

async function fetchCompany(config, slug) {
  const d = await fetchJson(`${config.vtcBase}/public/company/${encodeURIComponent(slug)}`)
  if (!d || !d.company || !Array.isArray(d.roster)) return null
  return d
}

async function fetchAnnouncements(config, slug) {
  const d = await fetchJson(`${config.vtcBase}/public/vtcs/${encodeURIComponent(slug)}`)
  return (d && d.announcements) || []
}

// 登录态接口（我的行驶记录）
async function driverMe(cookies) {
  return request(`${VTC_ROOT}/api/driver/me`, { cookie: cookies })
}

async function gameStatus(cookies) {
  return request(`${VTC_ROOT}/api/game/status`, { cookie: cookies }).catch(() => null)
}

module.exports = { fetchCompany, fetchAnnouncements, driverMe, gameStatus }
