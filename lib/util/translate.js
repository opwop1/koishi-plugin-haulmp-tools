// 通用文本翻译（原 city.js 的翻译部分，对齐 ets2-tools-tmp 的 util/baiduTranslate 职责）
const { TRANSLATE_API } = require('./constant')

async function translateBatch(texts) {
  const q = texts.join('|')
  const res = await fetch(`${TRANSLATE_API}?text=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(20000),
  })
  const d = await res.json()
  if (!d || d.code !== 200 || typeof d.data !== 'string') return null
  const parts = d.data.split('|')
  if (parts.length !== texts.length) return null
  return parts
}

async function translateNames(names) {
  const result = new Map()
  let pending = names.slice()
  for (let round = 0; round < 3 && pending.length; round++) {
    const next = []
    const chunkSize = round === 0 ? 40 : 15
    for (let i = 0; i < pending.length; i += chunkSize) {
      const chunk = pending.slice(i, i + chunkSize)
      let parts = null
      try {
        parts = await translateBatch(chunk)
      } catch (e) {
        parts = null
      }
      if (parts && parts.length === chunk.length) {
        chunk.forEach((n, j) => {
          const t = parts[j]
          if (t && t !== n) result.set(n, t)
          else next.push(n)
        })
      } else {
        next.push(...chunk)
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    pending = next
    if (pending.length) await new Promise((r) => setTimeout(r, 600))
  }
  return result
}

module.exports = { translateBatch, translateNames }
