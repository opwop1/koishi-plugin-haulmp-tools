// 车队每日里程基准快照（data/haulmp_company_snap.json，原 company.js 内的快照逻辑）
const fs = require('fs/promises')
const path = require('path')
const { fetchCompany } = require('../api/vtcApi')

function snapFile(ctx) {
  return path.join(ctx.baseDir || process.cwd(), 'data', 'haulmp_company_snap.json')
}

function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtKm(n) {
  return Number(n || 0).toLocaleString('en-US')
}

async function loadSnap(ctx) {
  try {
    return JSON.parse(await fs.readFile(snapFile(ctx), 'utf8')) || {}
  } catch (e) {
    return {}
  }
}

async function saveSnap(ctx, data) {
  await fs.mkdir(path.dirname(snapFile(ctx)), { recursive: true })
  await fs.writeFile(snapFile(ctx), JSON.stringify(data))
}

function makeSnap(company) {
  return {
    slug: company.company.slug,
    name: company.company.name,
    tag: company.company.tag || '',
    day: todayStr(),
    at: Date.now(),
    members: (company.roster || []).map((r) => [r.driver.handle, r.driver.displayName, r.kmTotal || 0]),
  }
}

async function rotateSnapshots(ctx, config) {
  const list = await ctx.database.get('haulmp_company', {})
  if (!list.length) return
  const snaps = await loadSnap(ctx)
  const today = todayStr()
  let changed = false
  for (const b of list) {
    const key = `${b.platform}:${b.channelId}`
    const s = snaps[key]
    if (s && s.day === today && s.slug === b.slug) continue
    try {
      const c = await fetchCompany(config, b.slug)
      if (c) {
        snaps[key] = makeSnap(c)
        changed = true
      }
    } catch (e) { /* ignore */ }
  }
  if (changed) await saveSnap(ctx, snaps)
}

module.exports = { snapFile, todayStr, fmtKm, loadSnap, saveSnap, makeSnap, rotateSnapshots }
