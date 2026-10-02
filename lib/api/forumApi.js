// HaulMP 论坛 API（资料 / 成员翻页 / 通知）
const { fetchJson, fetchJsonMemo } = require('../util/common')
const { FORUM_BASE } = require('../util/constant')
const { request } = require('./accountsApi')

async function fetchProfile(apiBase, key) {
  const url = `${apiBase}/u/${encodeURIComponent(key)}`
  let data = null
  try {
    data = await fetchJsonMemo(url, 300000)
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1200))
    data = await fetchJsonMemo(url, 300000).catch(() => null)
  }
  if (!data || data.error || !data.member || !data.member.handle) return null
  return data
}

// 排行缓存构建用的成员翻页（带多重退避重试）
async function fetchMembersPage(apiBase, page) {
  const waits = [0, 2000, 5000, 10000]
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise((r) => setTimeout(r, waits[attempt]))
    let d = null
    try {
      d = await fetchJson(`${apiBase}/members?page=${page}`)
    } catch (e) {
      d = null
    }
    if (d && Array.isArray(d.members)) return d
  }
  return null
}

async function fetchNotifications(cookies) {
  return request(`${FORUM_BASE}/api/forum/notifications?page=1`, { cookie: cookies })
}

module.exports = { fetchProfile, fetchMembersPage, fetchNotifications }
