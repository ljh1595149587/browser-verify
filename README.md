# browser-verify

**Verify frontend changes in a real browser with measured numbers, not by eyeballing screenshots.**

[中文说明](README.zh-CN.md)

A tiny Playwright-based toolbox plus a [Claude Code](https://claude.com/claude-code) skill that
teaches the agent to check its own UI work before saying "done".

```
PASS  grid → list switch works  — grid=[296px 296px 296px 296px] list=[1232px]
PASS  dark token applies  — light=rgb(252, 252, 251) dark=rgb(13, 13, 13)
FAIL  badge has accent background  — badge bg=rgba(0, 0, 0, 0)

demo: 7 passed / 1 failed (0.8s)
```

## Why

There is a family of bugs where **the code is there but the effect isn't**. `typecheck` and
`build` are green, the screenshot looks roughly fine, and yet:

- a CSS variable name is misspelled → silently falls back to nothing
- two rules have equal specificity → the winner depends on load order
- a media query can't beat `.x.y`
- the enter animation runs on the skeleton, so the real content appears at its final frame
- an else-if chain in a template misses a branch
- a token cleanup collapses `base` and `hover` to the same value

The only reliable way to catch these is to **measure**: computed styles, bounding boxes,
grid columns, overflow, sampled animation frames. Every check in this toolbox records the
number it measured, so a failure explains itself.

Installing Playwright into every project is heavy (deps, config, directory conventions,
browser downloads in CI). Instead: **install once, call it from any project, throw scripts away freely.**

## Install

```bash
git clone https://github.com/ljh1595149587/browser-verify.git
cd browser-verify
npm install
node bin/verify.mjs examples/demo-check.mjs   # 7 pass, 1 deliberate fail
```

Requires Node 18+ and Google Chrome. No Chrome? Use Playwright's bundled Chromium:

```bash
npx playwright install chromium
BV_CHANNEL=chromium node bin/verify.mjs examples/demo-check.mjs
```

## Usage

```bash
node path/to/browser-verify/bin/verify.mjs ./my-check.mjs          # headless
node path/to/browser-verify/bin/verify.mjs ./my-check.mjs --headed # watch it run
node path/to/browser-verify/bin/verify.mjs ./my-check.mjs --slow=300
```

A check script exports one function. It receives the toolbox and returns the failure count,
which becomes the process exit code:

```js
export default async function ({ Report, launch, login, until, shot, measure }) {
  const r = new Report('accounts page')
  const { browser, page, errors } = await launch({ width: 1280 })
  await login(page, { url: 'http://localhost:5173/login', email: 'a@b.c', password: '…' })

  await page.goto('http://localhost:5173/accounts', { waitUntil: 'networkidle' })
  r.check('cards rendered', await page.locator('.acc-card').count() > 0)

  const cols = await measure.gridColumns(page.locator('.wall'))
  r.check('grid is multi-column', cols.count > 1, `grid-template-columns=[${cols.value}]`)

  r.check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await shot(page, './out/accounts.png')
  await browser.close()
  return r.finish()
}
```

See [`examples/demo-check.mjs`](examples/demo-check.mjs) for a complete, self-contained example.

## API

| | |
|---|---|
| `launch({ width, height, headless, slowMo, channel })` | Opens a page and returns `{ browser, page, errors, requests }`. `errors` collects `pageerror` and console errors automatically. `--headed`/`--slow` are applied by default. |
| `new Report(title)` | `.check(name, ok, evidence)` records one criterion; `.finish()` prints a summary and returns the failure count. |
| `shot(page, path)` | Screenshot, creates directories as needed. |
| `until(fn, { timeout, interval })` | Polls until `fn()` is truthy. **On timeout it returns the last value**, so you can put it in the evidence string. |
| `login(page, { url, email, password, ... })` | Fills a typical login form and waits until the URL leaves `/login`. |
| `measure.style(el, prop)` | Computed style, including custom properties. Catches misspelled variables. |
| `measure.visible(el)` | Exists **and** has non-zero size. |
| `measure.gridColumns(el)` | Number of resolved grid columns. |
| `measure.overlaps(a, b)` | Do two boxes overlap? (A shared edge counts as overlap, so don't use it on adjacent cells.) |
| `measure.sampleTransition(el, { prop, ms })` | Samples a property over time. `changed: true` means it is really animating. |
| `measure.rect(el)` | Rounded bounding box. |

Plain Playwright is fully available through `page`, so use `page.evaluate()` for anything else.

## The discipline

**The third argument of `check()` is not decoration.**
`PASS list view is single-column` says nothing.
`PASS list view is single-column — grid=[404px 404px 404px] list=[1250px]` is evidence.
If you can't write the evidence string, the check didn't verify anything.

## Claude Code skill

[`skills/browser-verify/SKILL.md`](skills/browser-verify/SKILL.md) tells Claude Code when to
verify (proactively, after CSS/theme/SVG/template changes), how to write measured criteria,
and which pitfalls to avoid.

**As a plugin** (recommended):

```
/plugin marketplace add ljh1595149587/browser-verify
/plugin install browser-verify@browser-verify
```

Then run `npm install` once inside the installed plugin directory, or let Claude do it on
first use; the skill tells it how.

**As a plain skill:** clone the repo, run `npm install`, and copy or symlink
`skills/browser-verify` into `~/.claude/skills/`. Set `BROWSER_VERIFY_HOME` to the clone path
so the skill can find the runner.

Then just ask "verify the page in the browser", or let Claude do it on its own after a style change.

## Recipes

`recipes/` is git-ignored. Keep project-specific scripts (local URLs, test accounts) there
and rerun them after each change.

## License

[MIT](LICENSE)
