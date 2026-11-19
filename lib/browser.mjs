/**
 * 浏览器启动与常用动作。
 *
 * 默认 `channel: 'chrome'` 用系统 Chrome —— 不下载 playwright 自带的浏览器，
 * 省几百 MB，且渲染结果与用户看到的一致（验 UI 时这点重要）。
 */
import { chromium } from 'playwright'

/**
 * 起一个带**错误捕获**的页面。
 *
 * 🔴 `pageerror` / console error 默认就收：见过太多「功能看着好、控制台在刷红」的情况，
 * 而验证脚本如果不主动收，这些永远不会出现在报告里。
 */
export async function launch(options = {}) {
  // CLI 的 --headed / --slow 放在 globalThis.bv.opts；这里兜底读它，
  // 免得脚本忘了展开 opts 时这两个开关静默失效
  const cli = globalThis.bv?.opts ?? {}
  const {
    headless = cli.headless ?? true,
    slowMo = cli.slowMo ?? 0,
    width = 1600,
    height = 1000,
    // 'chrome' = 系统 Chrome；设 BV_CHANNEL=chromium 改用 playwright 自带浏览器
    //（需先 `npx playwright install chromium`）
    channel = process.env.BV_CHANNEL ?? 'chrome',
  } = options
  const browser = await chromium.launch({
    ...(channel && channel !== 'chromium' ? { channel } : {}),
    headless,
    slowMo,
  })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })
  const requests = []
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }))
  return { browser, page, errors, requests }
}

/**
 * 表单式登录。字段选择器给了一组兜底 —— 不同项目的登录框 placeholder 五花八门，
 * 与其每个脚本各抄一遍，不如在这里一次给全。
 */
export async function login(page, {
  url,
  email,
  password,
  userSelector = 'input[type="text"], input[type="email"], input[placeholder*="邮箱"], input[placeholder*="账号"], input[name="username"]',
  passSelector = 'input[type="password"]',
  submitText,
  timeout = 20000,
} = {}) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.fill(userSelector, email)
  await page.fill(passSelector, password)
  // 不给 submitText 时按常见文案匹配提交按钮
  const name = submitText ?? /登录|登 录|log ?in|sign ?in/i
  await page.getByRole('button', { name }).first().click()
  // 判据是「离开登录页」而不是「出现某个元素」——后者与具体项目耦合
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout })
  return page.url()
}

/**
 * 轮询等一个条件成立。
 *
 * 比 `waitForTimeout(固定秒数)` 好在两点：条件早满足就早返回（快），
 * 条件一直不满足会**返回最后一次的值**（能写进 detail，而不是只知道超时）。
 */
export async function until(fn, { timeout = 30000, interval = 500, label = '条件' } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last) return last
    await new Promise((r) => setTimeout(r, interval))
  }
  return last ?? null
}
