/**
 * Self-contained example: verifies examples/demo.html with measured criteria.
 *
 *   node bin/verify.mjs examples/demo-check.mjs
 *
 * One check is expected to FAIL — demo.html has a misspelled CSS variable
 * (`--acent`), the kind of "code is there, effect is not" bug that typecheck,
 * build and a quick glance at a screenshot all miss. The evidence string
 * shows exactly what went wrong.
 */
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const URL = pathToFileURL(join(here, 'demo.html')).href

export default async function ({ Report, launch, opts, measure, shot }) {
  const r = new Report('demo')
  const { browser, page, errors } = await launch({ ...opts, width: 1280 })
  await page.goto(URL, { waitUntil: 'load' })

  // 1. No page / console errors — always include this one
  r.check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'errors=0')

  // 2. Grid really is multi-column at desktop width, single column in list mode
  const wall = page.locator('.wall')
  const grid = await measure.gridColumns(wall)
  await wall.evaluate((el) => el.classList.add('list'))
  const list = await measure.gridColumns(wall)
  await wall.evaluate((el) => el.classList.remove('list'))
  r.check('grid → list switch works', grid.count > 1 && list.count === 1,
    `grid=[${grid.value}] list=[${list.value}]`)

  // 3. Progress bar width reflects its value (inline style actually applied)
  const bar = await page.evaluate(() => {
    const t = document.querySelector('.bar-track'), f = t.querySelector('.bar-fill')
    return { t: t.getBoundingClientRect().width, f: f.getBoundingClientRect().width }
  })
  const pct = (bar.f / bar.t) * 100
  r.check('progress bar = 72%', Math.abs(pct - 72) < 2, `fill/track=${pct.toFixed(1)}%`)

  // 4. Dark theme token actually swaps, and explicit data-theme beats the OS setting
  const body = page.locator('body')
  const light = await measure.style(body, 'background-color')
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await measure.style(body, 'background-color')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  const forced = await measure.style(body, 'background-color')
  r.check('dark token applies', light !== dark, `light=${light} dark=${dark}`)
  r.check('data-theme="light" beats OS dark', forced === light, `forced=${forced}`)
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  await page.emulateMedia({ colorScheme: 'light' })

  // 5. Badge is visible AND has a background — this one catches the --acent typo
  const badge = page.locator('.badge')
  const vis = await measure.visible(badge)
  const badgeBg = await measure.style(badge, 'background-color')
  r.check('badge visible', vis.ok, `${vis.w}x${vis.h} at (${vis.x},${vis.y})`)
  r.check('badge has accent background', badgeBg === 'rgb(47, 111, 222)', `badge bg=${badgeBg}`)

  // 6. No horizontal overflow at phone width
  await page.setViewportSize({ width: 390, height: 800 })
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }))
  r.check('no horizontal overflow @390px', doc.scrollW <= doc.clientW + 1, `${doc.scrollW}/${doc.clientW}`)

  await shot(page, join(here, '..', 'out', 'demo-390.png'))
  await browser.close()
  return r.finish()
}
