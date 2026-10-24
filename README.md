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

页面结构变了就提 issue,附上能复现的页面和截图。

## License

MIT
