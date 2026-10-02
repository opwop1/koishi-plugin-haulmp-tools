// accounts.haulmp.com 账号服务（注册 / 设备码登录 / 找回密码共用的请求层）
const { ACCOUNTS_BASE } = require('../util/constant')

function cookiesOf(res) {
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      return res.headers.getSetCookie().map((c) => String(c).split(';')[0]).join('; ')
    }
    const raw = res.headers.get('set-cookie') || ''
    return raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ')
  } catch (e) {
    return ''
  }
}

async function request(url, { cookie, body } = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
  if (cookie) headers.Cookie = cookie
  if (body) {
    headers['Content-Type'] = 'application/json'
    headers.Origin = ACCOUNTS_BASE
    headers.Referer = ACCOUNTS_BASE + '/'
  }
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, cookies: cookiesOf(res) }
}

async function accountsApi(path, opts) {
  return request(ACCOUNTS_BASE + path, opts)
}

async function registerAccount(handle, email, password) {
  const s1 = await accountsApi('/api/session')
  return accountsApi('/api/auth/register', { body: { handle, email, password }, cookie: s1.cookies })
}

module.exports = { request, accountsApi, registerAccount, cookiesOf }
