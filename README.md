# GMGN Emoji Avatar Restorer

将 GMGN 钱包备注里实际显示的 emoji 头像，还原为你本机系统 emoji 风格显示，包括普通列表区和 K 线图里的 canvas 头像。

## 解决的问题

GMGN 在“备注钱包时提供给你选择的 emoji 风格”和“页面最终实际显示出来的头像风格”之间并不一致。

- 备注时你看到的是浏览器 / 系统当前渲染出来的那套 emoji 风格。
- 但 GMGN 在左侧钱包动态、底部持仓列表、以及 K 线 marker 上，实际显示的是它自己的 `/static/emoji/*.webp` 图片资源。
- 结果就是：同一个 emoji，语义没变，但最终头像的画风和你当时选择时看到的样子不一致，影响辨识度。

这个项目解决的就是这个“所见不即所得”的问题：让 GMGN 最终显示出来的钱包 emoji，尽量回到你本机当前系统 emoji 的视觉效果。

## 最终解决方案

最终方案不是去改 GMGN 的备注数据，也不是去提交任何保存请求，而是只在你本地浏览器的显示层做只读替换。

- 对普通 DOM 列表头像：
  - 识别 `img[alt="emoji"]` 且 `src` 形如 `/static/emoji/<code>.webp` 的 GM 头像资源。
  - 从资源路径里反解出对应 Unicode emoji。
  - 保留原图占位，在同一个头像盒子里覆盖系统 emoji 文本层。
- 对 TradingView K 线图头像：
  - 识别 GM 在同源 blob `iframe` 里的 `canvas.drawImage` 绘制。
  - 当源图是 `/static/emoji/*.webp` 时，不再直接画 GM 图片。
  - 改为先用系统 emoji 生成一张本地 canvas，再把它画到原 marker 位置上。
- 对不同展示区分别调尺寸：
  - 左侧动态列表、底部持仓、K 线 marker 分别用不同的大小比例，尽量贴近 GM 原版占位和视觉观感。

整个方案的边界是：

- 不改 GMGN 服务器上的备注数据
- 不改备注提交逻辑
- 不模拟保存、确认、提交按钮
- 关闭脚本后立即恢复 GM 原始显示

## 当前行为

- 只处理真正显示出来的钱包 emoji 头像图片。
- 只命中 `img[alt="emoji"]` 且 `src` 形如 `/static/emoji/<code>.webp` 的 GM 站内头像资源。
- 脚本会把图片里的 codepoint 反解成对应 Unicode emoji，并在原头像容器内覆盖一个文本 emoji 层。
- 原图不再 `display:none`，而是继续参与布局，仅设置为透明和不可点。
- emoji 文本优先使用 `Segoe UI Emoji`，并回退到 `Apple Color Emoji`、`Noto Color Emoji`。
- DOM 列表区会按场景分别调尺寸：底部持仓保持较稳的比例，左侧窄栏列表会更接近 GM 原版大小，其余区域走中间比例。
- 如果 K 线图头像由 TradingView `canvas` 直接绘制，脚本会在同源 blob `iframe` 里拦截 `drawImage`，把 `/static/emoji/*.webp` 的源图替换成系统 emoji 生成的本地 canvas。
- 默认跳过 emoji 候选面板、搜索框和带 `Emoji / Search / 自定义图片` 特征的弹层，避免把编辑 UI 改丑。
- 关闭脚本或刷新页面后，会恢复 GM 原始图片显示。

## 使用方法

1. 打开 Tampermonkey，新建脚本。
2. 把 [gmgn-openmoji.user.js](./gmgn-openmoji.user.js) 的内容全部粘进去并保存。
3. 打开 `https://gmgn.ai/`，刷新页面。

## 调试取证

如果后续 GM 页面结构再变，下面两个只读调试脚本还可以继续用。

### 1. 悬停元素取证

如果需要确认某个 K 线头像当前是不是普通 DOM 节点，可以用 [chart-avatar-mousedown-probe.js](./chart-avatar-mousedown-probe.js) 做一次悬停取证：

1. 打开 GMGN K 线页，按 `F12` 进入 Console。
2. 把 [chart-avatar-mousedown-probe.js](./chart-avatar-mousedown-probe.js) 全部粘进去运行。
3. 把鼠标移动到 K 线图里的头像上，不要点击。
4. 直接按键盘 `z`。
5. 控制台会立刻打印当前位置的元素栈，并尝试复制 JSON 到剪贴板。

这个脚本会优先探测 GM 的 blob TradingView `iframe`；如果可读，就直接在 `iframe` 内部取样，避免 GM 点击后弹出右侧详情面板干扰结果。整个过程仍然是只读采样。

### 2. Canvas 绘制取证

如果悬停取证已经确认 K 线头像在 TradingView `canvas` 里，而不是普通 DOM 节点，再用 [chart-avatar-canvas-probe.js](./chart-avatar-canvas-probe.js) 做第二步取证：

1. 打开 GMGN K 线页，按 `F12` 进入 Console。
2. 把 [chart-avatar-canvas-probe.js](./chart-avatar-canvas-probe.js) 全部粘进去运行。
3. 在图表里稍微移动、缩放、切换周期，主动触发几次重绘。
4. 直接按键盘 `z`。
5. 控制台会导出 `drawImage` 日志，重点看是否出现 `external-res`、`/static/emoji/` 或其他小尺寸头像图源。

这个脚本只做只读绘制取证，不会阻止图表交互，也不会修改备注数据。

## 当前假设

- 钱包备注头像使用 GM 的本地图片资源，例如：

```html
<img alt="emoji" class="size-full" src="/static/emoji/261d-fe0f.webp">
```

- 真实尺寸约束来自头像小容器，而不是 `img` 文件本身。
- 你想要的候选风格，本质上来自 Chrome / Windows 当前系统 emoji 渲染链路。
- 因此这一版不再追 OpenMoji 或 Google Noto 图片资源，而是直接让显示头像走系统 emoji 字体渲染。

## 当前限制

- 当前 K 线图支持依赖于 TradingView iframe 仍然保持同源可访问，并继续使用 `/static/emoji/*.webp` 作为 `drawImage` 源图。
- 如果 GM 后续把图表头像改成别的资源链路，例如 `external-res`、SVG 或服务端合成位图，就需要重新补一轮拦截逻辑。
- 如果 GM 某些列表头像的最小容器查找路径与当前结构差异很大，可能还需要补一条更精确的容器选择规则。
