# browser-verify

**用量出来的数验证前端改动是否真的生效，而不是肉眼看截图。**

[English](README.md)

一个基于 Playwright 的小工具箱，外加一个 [Claude Code](https://claude.com/claude-code) skill。
skill 让 Claude 在说「改好了」之前先在浏览器里把效果量出来。

```
PASS  grid → list switch works  — grid=[296px 296px 296px 296px] list=[1232px]
PASS  dark token applies  — light=rgb(252, 252, 251) dark=rgb(13, 13, 13)
FAIL  badge has accent background  — badge bg=rgba(0, 0, 0, 0)

demo: 7 passed / 1 failed (0.8s)
```

## 为什么

有一族 bug 叫**「代码在、效果无」**：`typecheck`、`build` 全绿，截图看着也差不多，但实际上：

- CSS 变量名拼错，静默失效
- 同特异性的规则靠加载顺序决定胜负
- 媒体查询不增加特异性，压不住 `.x.y`
- 入场动画跑在骨架屏上，真内容一出来就是终态
- 模板的 else-if 链漏了分支
- token 收敛后 base 和 hover 成了同一个值，hover 形同虚设

对付它们只有一个办法：**量**。计算样式、盒子尺寸、网格列数、溢出、动画采样都量出来。
工具箱里的每一条判据都会记下量到的数，失败时一眼就能看出错在哪。

把 playwright 装进每个项目又太重（依赖、config、目录约定、CI 上的浏览器下载）。
所以做成：**一处安装，各项目临时调用，脚本随写随扔。**

## 安装

```bash
git clone https://github.com/ljh1595149587/browser-verify.git
cd browser-verify
npm install
node bin/verify.mjs examples/demo-check.mjs   # 7 过 1 败（故意的）
```

需要 Node 18+ 和系统 Chrome。没有 Chrome 时可以用 playwright 自带的 Chromium：

```bash
npx playwright install chromium
BV_CHANNEL=chromium node bin/verify.mjs examples/demo-check.mjs
```

## 用法

```bash
node <路径>/browser-verify/bin/verify.mjs ./my-check.mjs          # 无头
node <路径>/browser-verify/bin/verify.mjs ./my-check.mjs --headed # 看着它跑
node <路径>/browser-verify/bin/verify.mjs ./my-check.mjs --slow=300
```

验证脚本导出一个函数，接收工具箱，返回失败数（即进程退出码）。完整示例见
[`examples/demo-check.mjs`](examples/demo-check.mjs)，API 表见[英文 README](README.md#api)。

## 判据纪律（这套工具的全部意义）

**`check()` 的第三个参数不是装饰。**
「PASS 列表视图单列」什么都没说明；
「PASS 列表视图单列 — grid=[404px 404px 404px] list=[1250px]」才是证据。
写不出证据串，说明这条判据没验到东西。

## Claude Code skill

[`skills/browser-verify/SKILL.md`](skills/browser-verify/SKILL.md) 告诉 Claude 什么时候该验
（改了 CSS、主题、SVG、模板之后主动验）、怎么写量化判据、别踩哪些坑。

**作为插件安装**（推荐）：

```
/plugin marketplace add ljh1595149587/browser-verify
/plugin install browser-verify@browser-verify
```

装好后在插件目录里执行一次 `npm install`，也可以让 Claude 首次使用时自己装（skill 里写了做法）。

**作为普通 skill 安装**：clone 仓库并 `npm install`，再把 `skills/browser-verify` 复制或软链到
`~/.claude/skills/`，然后设置环境变量 `BROWSER_VERIFY_HOME` 指向 clone 目录。

之后说一句「浏览器验证一下」即可；改完样式后 Claude 也会自己去验。

## recipes/

`recipes/` 已被 git 忽略。各项目的可复用脚本（本地地址、测试账号）放这里，每次改完重跑。

## 许可

[MIT](LICENSE)
