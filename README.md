# GMGN Emoji Fix

把你选的那个 emoji,还给你。

GMGN 钱包备注里挑的 emoji,和页面最终显示出来的 emoji 不是同一套。挑的时候看到的是系统 emoji,显示的是 GMGN 自己的 `/static/emoji/*.webp`。这个脚本只在你本地把这层显示换回系统 emoji —— 包括 K 线图里直接用 canvas 画出来的那些头像。

## 安装

1. 装 [Tampermonkey](https://www.tampermonkey.net/)
2. 点这里安装 → **[gmgn-emoji-fix.user.js](https://raw.githubusercontent.com/HYSWZW/gmgn-emoji-fix/main/gmgn-emoji-fix.user.js)**
3. 打开 <https://gmgn.ai/>,刷新页面

装完之后 Tampermonkey 会自动跟随本仓库更新,不用手动再装。

## 它做什么

- 普通列表头像:识别 `img[alt="emoji"]` 且 `src` 形如 `/static/emoji/<code>.webp` 的站内头像,从路径反解出 Unicode emoji,在原头像容器里覆盖一层系统 emoji 文本。
- K 线图头像:识别 TradingView 在同源 blob `iframe` 里的 `canvas.drawImage` 绘制,当源图是 `/static/emoji/*.webp` 时,换成用系统 emoji 生成的本地 canvas。
- 分区域调尺寸:左侧动态列表、底部持仓、K 线 marker 各自用不同比例,尽量贴近原版占位。

## 它不做什么

- 不改 GMGN 服务器上的备注数据
- 不模拟保存 / 确认 / 提交
- 不发任何请求,不读 cookie,不碰钱包和交易
- 只作用于本地显示层,关掉脚本或刷新立刻恢复原样

本项目与 GMGN 官方无关,只是本地显示层的只读修补。

## 什么时候会失效

- GMGN 把图表头像换成别的资源链路(`external-res`、SVG、服务端合成位图)时,拦截要重写一轮。
- GMGN 改列表头像的容器结构时,选择器要补一条。

页面结构变了就提 issue,或者用下面的探针脚本自己取证。

## 调试取证

[chart-avatar-probe.user.js](https://raw.githubusercontent.com/HYSWZW/gmgn-emoji-fix/main/chart-avatar-probe.user.js) 是只读探针,不要装成 userscript。

1. 打开 GMGN K 线页,按 `F12` 进 Console
2. 整段粘进去运行
3. 鼠标悬停到 K 线头像上(不要点),按 `z`
4. 控制台打印该位置的元素栈 transcript 和 `drawImage` 日志,并尝试复制 JSON 到剪贴板

优先探测 GM 的 blob TradingView iframe;可读时直接在 iframe 内部取样,避免点击后弹出的右侧详情面板干扰。

## 自带脚本

| 文件 | 作用 |
| --- | --- |
| [gmgn-emoji-fix.user.js](https://raw.githubusercontent.com/HYSWZW/gmgn-emoji-fix/main/gmgn-emoji-fix.user.js) | 本仓库主角:emoji 头像还原 |
| [gmgn-wallet-panel-scale.user.js](https://raw.githubusercontent.com/HYSWZW/gmgn-emoji-fix/main/gmgn-wallet-panel-scale.user.js) | 顺手写的一个:放大左侧钱包追踪面板的字号和行距 |
| [chart-avatar-probe.user.js](https://raw.githubusercontent.com/HYSWZW/gmgn-emoji-fix/main/chart-avatar-probe.user.js) | 只读取证探针,开发用 |

## License

MIT
