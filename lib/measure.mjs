/**
 * 量化判据工具箱。
 *
 * 这个文件的存在理由是一条踩出来的经验：
 * **「代码在、效果无」的静默失败，typecheck / build 全查不出，肉眼看截图也常常看不出。**
 * 已知的几族：
 *   ① CSS 同特异性靠加载顺序决胜；② CSS 变量名拼错（静默失效）；
 *   ③ 动画跑在骨架屏上（loading 未置 false 就入场）；④ 模板 else-if 链漏类型分支；
 *   ⑤ 媒体查询不增加特异性，压不住 `.x.y`；⑥ token 收敛把 base/hover 抹成同值，hover 形同虚设。
 *
 * 对付它们只有一个办法：**量出来的数**。下面每个函数都返回数字或布尔 + 数字证据，
 * 好让判据写成 `check(名字, 条件, 证据)` 而不是 `check(名字, true)`。
 */

/** 元素矩形（四舍五入，避免小数噪音进报告） */
export async function rect(locator) {
  const box = await locator.boundingBox()
  if (!box) return null
  return {
    x: Math.round(box.x), y: Math.round(box.y),
    w: Math.round(box.width), h: Math.round(box.height),
    right: Math.round(box.x + box.width), bottom: Math.round(box.y + box.height),
  }
}

/** 两个元素是否重叠——查「角标盖住状态徽标」这类问题 */
export async function overlaps(a, b) {
  const [ra, rb] = await Promise.all([rect(a), rect(b)])
  if (!ra || !rb) return { ok: false, reason: '至少一个元素不可见', a: ra, b: rb }
  const hit = !(ra.right < rb.x || ra.x > rb.right || ra.bottom < rb.y || ra.y > rb.bottom)
  return { ok: true, overlap: hit, a: ra, b: rb }
}

/** 计算样式的某个属性。查 CSS 变量拼错 / 同特异性覆盖 */
export async function style(locator, prop) {
  return locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
}

/** grid 列数——`grid-template-columns` 的值个数。查「网格/列表切换真的生效了吗」 */
export async function gridColumns(locator) {
  const value = await style(locator, 'grid-template-columns')
  return { count: String(value).trim().split(/\s+/).filter(Boolean).length, value }
}

/**
 * 采样一次动画中间态。
 *
 * 「入场动画有没有真的跑」用肉眼和截图都判不了 —— 截图只能拍到某一帧，
 * 而 bug 恰恰是「一上来就是终态」。这里在动画期间连续取 opacity/transform，
 * 中间值出现过 = 真的在动。
 */
export async function sampleTransition(locator, { prop = 'opacity', ms = 600, step = 60 } = {}) {
  const samples = []
  const end = Date.now() + ms
  while (Date.now() < end) {
    samples.push(await style(locator, prop).catch(() => null))
    await new Promise((r) => setTimeout(r, step))
  }
  const uniq = [...new Set(samples.filter(Boolean))]
  return { samples: uniq, changed: uniq.length > 1 }
}

/** 元素是否真的可见且有尺寸（`visibility/display` 都对但宽高为 0 的坑） */
export async function visible(locator) {
  if ((await locator.count()) === 0) return { ok: false, reason: '不存在' }
  const r = await rect(locator)
  if (!r) return { ok: false, reason: '无 boundingBox（display:none 或未渲染）' }
  return { ok: r.w > 0 && r.h > 0, ...r }
}
