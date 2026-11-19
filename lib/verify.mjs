/**
 * 验证报告器：PASS/FAIL + 计数 + 失败自动留证。
 *
 * 为什么不用 playwright test：那套要额外装 runner、要写 config、要按它的目录约定放文件。
 * 这里的用法是「临时验一下」——写个 .mjs 直接 node 跑，改一行立刻重跑，没有中间层。
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export class Report {
  constructor(title = '') {
    this.title = title
    this.rows = []
    this.startedAt = Date.now()
  }

  /**
   * 记一条判据。
   *
   * 🔴 `detail` 不是可选的装饰——**判据要用量出来的数**。
   * 「PASS 列表视图单列」什么都没说明；「PASS 列表视图单列 — grid=[404px 404px 404px]
   * list=[1250px]」才是证据。写 detail 的成本极低，回头查问题时的价值极高。
   */
  check(name, ok, detail = '') {
    this.rows.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) })
    const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`
    console.log(line)
    return !!ok
  }

  get failed() {
    return this.rows.filter((r) => !r.ok)
  }

  /** 收尾：打印计数并按失败数退出（非 0 退出码方便被脚本串起来） */
  finish() {
    const total = this.rows.length
    const bad = this.failed.length
    const secs = ((Date.now() - this.startedAt) / 1000).toFixed(1)
    console.log(`\n${this.title ? this.title + ': ' : ''}${total - bad} passed / ${bad} failed (${secs}s)`)
    if (bad) console.log('Failed:\n' + this.failed.map((r) => `  - ${r.name}${r.detail ? ' — ' + r.detail : ''}`).join('\n'))
    return bad
  }
}

/** 截图落到指定目录（自动建目录）。失败时**总是**留一张，不然事后只剩一行 FAIL */
export async function shot(page, path) {
  const full = resolve(path)
  mkdirSync(dirname(full), { recursive: true })
  await page.screenshot({ path: full, fullPage: false })
  return full
}
