// 私聊注册 HaulMP 账号（三步向导 + 密码校验）
const { accountsApi, registerAccount } = require('../api/accountsApi')

const TTL = 5 * 60 * 1000

const sessions = new Map()

function isPrivate(session) {
  return !!session.isDirect || String(session.channelId || '').startsWith('private:')
}

function keyOf(session) {
  return `${session.platform}:${session.userId}`
}

function checkPassword(pw, handle) {
  if (!pw || pw.length < 8) return '至少 8 位'
  const p = String(pw).toLowerCase()
  if (/password|haulmp|truck|letmein|welcome/.test(p)) return '不能包含常见弱密码词（password/haulmp/truck 等）'
  if (/(1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwert|asdf|zxcv)/.test(p)) return '不能包含连续字符序列（如 1234 / abcd）'
  if (handle && String(handle).length >= 3 && p.includes(String(handle).toLowerCase())) return '不能包含账号名'
  return ''
}

function apply(ctx) {

  async function submit(session, st) {
    sessions.delete(keyOf(session))
    let res
    try {
      res = await registerAccount(st.handle, st.email, st.password)
    } catch (e) {
      return '❌ 注册请求失败（网络问题），请稍后再试'
    }
    const d = res.data || {}
    if (res.status === 201 && d.user) {
      const lines = [
        '✅ HaulMP 账号注册成功！',
        '',
        `账号：${d.user.handle}`,
        `邮箱：${d.email || st.email}`,
        '',
        '⚠️ 请立即保存你的恢复码（找回账号的唯一凭证，只显示这一次）：',
        String(d.recoveryCode || '（未返回）'),
        '',
        '🔗 Steam 绑定链接（浏览器打开，完成授权即绑定）：',
        'https://accounts.haulmp.com/auth/steam',
        '（如提示需要登录，请先用刚注册的账号登录一次再绑定）',
        '',
        `下一步：发送「绑定H ${d.user.handle}」即可查询/定位`,
      ]
      return lines.join('\n')
    }
    const msg = d.error || d.message || `HTTP ${res.status}`
    let hint = ''
    if (/taken|exists|already/i.test(String(msg))) hint = '（这个账号已被注册，换一个再试）'
    return `❌ 注册失败：${msg}${hint}`
  }

  ctx.command('注册 [handle] [password] [email]', '私信注册 HaulMP 账号（账号 / 密码 / 邮箱）')
    .alias('注册h', '注册H')
    .usage('仅私信可用；例如：注册 / 注册 账号 密码 邮箱')
    .action(async ({ session }, handle, password, email) => {
      if (!session) return
      if (!isPrivate(session)) return '注册涉及账号密码，请私聊机器人发送「注册」'
      if (handle && email && password) {
        const h = String(handle).trim()
        const em = String(email).trim()
        const pw = String(password)
        if (!/^[A-Za-z0-9_]{3,24}$/.test(h)) return '账号格式不对（3-24位，字母/数字/下划线）'
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return '邮箱格式不对'
        const err = checkPassword(pw, h)
        if (err) return `密码不合规（${err}）`
        return submit(session, { handle: h, email: em, password: pw })
      }
      sessions.set(keyOf(session), { step: 'handle', at: Date.now() })
      return '开始注册 ✍️\n\n请输入想注册的账号（3-24 位，字母/数字/下划线）\n（随时发送「取消」终止）'
    })

  ctx.middleware(async (session, next) => {
    if (!session || !isPrivate(session) || !session.userId || !session.user) return next()
    const key = keyOf(session)
    const st = sessions.get(key)
    if (!st) return next()
    if (Date.now() - st.at > TTL) {
      sessions.delete(key)
      return next()
    }
    const text = String(session.content || '').trim()
    if (!text) return next()
    if (text === '取消' || text === '取消H' || text === '取消h') {
      sessions.delete(key)
      return '已取消注册'
    }
    st.at = Date.now()
    if (st.step === 'handle') {
      if (!/^[A-Za-z0-9_]{3,24}$/.test(text)) return '账号格式不对（3-24 位，字母/数字/下划线），请重新输入：'
      st.handle = text
      st.step = 'password'
      return '请输入密码（至少 8 位；不能是常见词、连续数字或包含账号名）：'
    }
    if (st.step === 'password') {
      const err = checkPassword(text, st.handle)
      if (err) return `密码不合规（${err}），请重新输入：`
      st.password = text
      st.step = 'email'
      return '请输入邮箱：'
    }
    if (st.step === 'email') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return '邮箱格式不对，请重新输入：'
      st.email = text
      st.step = 'confirm'
      return `请核对注册信息：\n\n账号：${st.handle}\n邮箱：${st.email}\n密码：已填写（不回显）\n\n回复「确认」提交注册；回复「取消」终止`
    }
    if (st.step === 'confirm') {
      if (text === '确认' || text === '确认注册') return submit(session, st)
      return '回复「确认」提交注册，或「取消」终止'
    }
    return next()
  })
}

module.exports = { apply, registerAccount, checkPassword }
