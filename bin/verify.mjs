#!/usr/bin/env node
/**
 * 跑一个验证脚本：`verify <script.mjs> [--headed] [--slow=200]`
 *
 * 脚本自己 import lib 里的东西即可；本入口只做两件事：
 *  ① 把 lib 挂到 globalThis.bv，省掉每个脚本写一串相对路径 import；
 *  ② 统一退出码（失败数 → 非 0），好被别的脚本串起来。
 */
import { pathToFileURL } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (!existsSync(join(root, 'node_modules', 'playwright'))) {
  console.error(`playwright is not installed. Run once:\n  cd "${root}" && npm install`)
  process.exit(2)
}
const verify = await import('../lib/verify.mjs')
const browser = await import('../lib/browser.mjs')
const measure = await import('../lib/measure.mjs')

const target = process.argv[2]
if (!target) {
  console.error('usage: verify <script.mjs> [--headed] [--slow=200]')
  process.exit(2)
}
globalThis.bv = { ...verify, ...browser, measure, opts: {
  headless: !process.argv.includes('--headed'),
  slowMo: Number((process.argv.find((a) => a.startsWith('--slow=')) || '').split('=')[1] || 0),
} }

const mod = await import(pathToFileURL(resolve(target)).href)
if (typeof mod.default === 'function') {
  const failed = await mod.default(globalThis.bv)
  process.exit(Number(failed) || 0)
}
