---
name: browser-verify
description: Quantitatively verify in a real browser that a frontend change actually took effect (CSS, theme tokens, templates, inline SVG, layout). Criteria are measured numbers, not eyeballed screenshots. Use when the user says "verify the page", "check the styles", "take a screenshot", "does it work in the browser", "browser-verify". **Use it proactively, unasked**, before claiming done whenever any of these hold — changed CSS or theme tokens (especially light + dark), wrote an inline SVG chart, touched template conditional branches, about to judge layout from a screenshot, or debugging "the code is there but the effect isn't".
user-invocable: true
allowed-tools: "Bash, PowerShell, Read, Write, Edit, Glob, Grep"
---

# Quantitative browser verification

The runner lives in this repository: `bin/verify.mjs`, two directories above this
`SKILL.md` (`<skill base dir>/../../bin/verify.mjs`). If the skill was copied on its own,
use `$BROWSER_VERIFY_HOME/bin/verify.mjs` instead. On first use, if
`<repo>/node_modules/playwright` is missing, run `npm install` in the repo root once.

```bash
V="<repo>/bin/verify.mjs"
node "$V" ./my-check.mjs              # headless
node "$V" ./my-check.mjs --headed     # watch it run
node "$V" ./my-check.mjs --slow=300   # slow motion (ms per action)
```

It uses the system Chrome by default. Without Chrome, set `BV_CHANNEL=chromium` and run
`npx playwright install chromium` once in the repo.

Put throwaway check scripts in the target project's scratch area (or a temp dir), **not**
in the project's source tree, and do not add playwright to the project's dependencies.
The runner is installed once and every project calls it.

## First principle: a criterion is a measured number

The third argument of `check()` is not decoration. **If you cannot write an evidence
string, the criterion did not verify anything.**

```js
r.check('dark theme applies', dark !== light)                  // ❌ says nothing
r.check('dark theme applies', dark === 'rgb(13, 13, 13)',
        `light=${light} dark=${dark}`)                         // ✅ failure explains itself
```

This targets one class of bug: **the code is there but the effect isn't.** Typecheck
and build don't catch it, and an eyeballed screenshot often doesn't either. Examples: a
misspelled CSS variable fails silently, rules of equal specificity win by load order, a
media query can't override `.x.y`, and a token cleanup can flatten base and hover to the
same value. Only measuring exposes them.

## When to stop and verify first

No need to wait to be asked. Verify if any of these hold:

- Changed **CSS or theme tokens**, especially light + dark, or several scopes (`@media` + `[data-theme]`)
- Wrote an **inline SVG chart** (wrong geometry doesn't error, it just draws crooked or empty)
- Touched **template conditional branches** (a missed else-if branch is silent)
- About to **judge layout from a screenshot**. That is the signal to switch to measured criteria
- Debugging "I changed the code but the page didn't change"

Conversely, **pure logic changes with no visual output don't need it.** Launching a
browser has a fixed cost.

## Script template

```js
export default async function ({ Report, launch, opts, measure, shot, until, login }) {
  const r = new Report('page name')
  const { browser, page, errors } = await launch({ ...opts, width: 1280 })

  await page.goto(URL, { waitUntil: 'load' })

  r.check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'errors=0')

  const bg = await measure.style(page.locator('body'), 'background-color')
  r.check('background correct', bg === 'rgb(252, 252, 251)', `body bg=${bg}`)

  await shot(page, './out/page.png')
  await browser.close()
  return r.finish()          // returns failure count → process exit code
}
```

`launch()` collects `pageerror` and console errors by default. **Every script should have
the "no errors" criterion**, otherwise "works fine but the console is full of red" never
shows up in a report.

`<repo>/examples/demo-check.mjs` is a complete, runnable example with one deliberately
failing check.

## measure API

| Function | Catches |
|---|---|
| `style(el, prop)` | Misspelled CSS variables, equal-specificity overrides. Typos fail **silently**; the computed value exposes them |
| `visible(el)` | Present ≠ visible: correct `display` but zero width/height |
| `gridColumns(el)` | Did the grid/list switch really take effect? |
| `overlaps(a, b)` | A badge covering something else (**see pitfall ①**) |
| `sampleTransition(el)` | Is the enter animation **actually animating**? (a screenshot can't show "starts at the final frame") |
| `rect(el)` | Rounded bounding box, keeps decimal noise out of reports |

Anything else: measure it yourself with `page.evaluate()`, for example
`scrollWidth > clientWidth` for overflow, or `document.querySelector(a.getAttribute('href'))`
for broken anchors.

Other helpers: `until(fn, { timeout })` polls a condition and **returns the last value on
timeout** (so it can go into the evidence string). `login(page, { url, email, password })`
fills a typical login form and waits until the URL leaves `/login`.

## Common checks (copy as-is)

```js
// No horizontal page overflow (wide tables must scroll inside their own container)
const doc = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth }))
r.check('no horizontal overflow', doc.scrollW <= doc.clientW + 1, `${doc.scrollW}/${doc.clientW}`)

// Light/dark: the token really swaps, and explicit data-theme beats the OS setting (test both directions)
const light = await measure.style(page.locator('body'), 'background-color')
await page.emulateMedia({ colorScheme: 'dark' })
const dark = await measure.style(page.locator('body'), 'background-color')
r.check('dark token applies', light !== dark, `light=${light} dark=${dark}`)
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
r.check('data-theme beats OS', await measure.style(page.locator('body'), 'background-color') === light)

// Inline style actually lands (a silently broken style attribute → progress bar stuck at 0 width)
const bar = await page.evaluate(() => {
  const t = document.querySelector('.bar-track'), f = t?.querySelector('.bar-fill')
  return t && f ? { t: t.getBoundingClientRect().width, f: f.getBoundingClientRect().width } : null })
r.check('bar width reflects value', Math.abs(bar.f / bar.t * 100 - expected) < 2,
        `fill/track=${(bar.f / bar.t * 100).toFixed(1)}%`)

// Text doesn't overflow its container (catches real layout bugs better than "do elements overlap")
const bad = await page.evaluate(() => [...document.querySelectorAll('td')]
  .filter(td => td.scrollWidth > td.clientWidth + 1).map(td => td.className))
r.check('text fits cells', bad.length === 0, bad.join(' | ') || 'all inside')
```

## Pitfalls (all hit in practice)

**① `overlaps()` counts a shared edge as overlap.** Non-overlap is tested with
`ra.right < rb.x`, and adjacent table cells have exactly `right === x`, so they always
"overlap". **Don't use it on tables, grids or other inherently adjacent structures.**
Measure `scrollWidth > clientWidth` (text overflow) or the specific gap instead.

**② An SVG polyline with bbox height 0 isn't necessarily a bug.** A constant series draws
a flat line, so its bbox is naturally zero-height. Verify that the SVG itself has a rendered
size, that all points are inside the viewBox, and that **a constant series isn't pinned to
the top edge** (that makes a steady value look like a peak).

**③ A wrong criterion looks exactly like wrong code.** When a FAIL appears, **first ask
whether the criterion itself is right**, then change code. ① and ② were both first
misdiagnosed as code bugs. The evidence string is what saves you:
`name.right=641 score.x=641` shows at a glance that the elements are "adjacent", not "overlapping".

**④ Don't use `img.complete` to mean "lazy image loaded".** Chrome reports
`complete === true` for `loading="lazy"` images that haven't started loading. The wait
returns at once, `naturalWidth` is 0, and it looks like "all images are broken". Wait
for `naturalWidth > 0` with a timeout and fail honestly only on timeout. A fixed
`waitForTimeout(2000)` doesn't work either: on a slow CDN it turns "still loading" into
"can't display".

**⑤ When finding "the element that widens the page", exclude parts clipped by scroll
containers.** A wide table inside its own scroll container may legitimately extend past
the viewport. Testing `right > innerWidth` directly gives false positives.

**⑥ `:target` matching a row inside a collapsed `<details>` doesn't mean the reader can see
it.** If a footnote link is supposed to open an appendix, check that the target is
`visible()` after the click, not just that it matches.

**⑦ (Windows) Don't count lines of CJK files with PowerShell `Get-Content`.** BOM-less UTF-8
can swallow line endings and silently undercount. Use `node` or `python`.

## Recipes

Once a project's criteria stabilise, save the script as a reusable recipe, e.g.
`recipes/<project>-<page>.mjs` in the browser-verify checkout (git-ignored by default, so
private URLs and credentials stay local). Rerunning a recipe after each style change is
cheaper than rewriting it. Throwaway exploratory scripts don't need to be kept.

## Don't

- **Don't install playwright into the project repo.** The runner is installed once and every project calls it.
- **Don't use it for interactive exploration.** It is a batch assertion tool; to poke at a page step by step, use a browser MCP.
- **Don't screenshot without criteria.** Screenshots are supporting evidence on failure, not the criterion.
