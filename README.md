# GMGN OpenMoji Userscript

这个目录里已经放好了一个可直接导入油猴的脚本：[gmgn-openmoji.user.js](C:\Users\14328\Documents\Codex\2026-05-21\gmgn-emoji-summary-gmgn-emoji-emoji\gmgn-openmoji.user.js)。

## 怎么用

1. 打开 Tampermonkey，新建脚本。
2. 把 [gmgn-openmoji.user.js](C:\Users\14328\Documents\Codex\2026-05-21\gmgn-emoji-summary-gmgn-emoji-emoji\gmgn-openmoji.user.js) 的内容全部粘进去并保存。
3. 打开 `https://gmgn.ai/`，刷新页面。

## 现在包含什么

- 默认开启“目标区域内所有 emoji 自动替换成 OpenMoji”模式。
- 你不需要按钱包逐条配置，也不需要手动录入几百种 emoji。
- 脚本只改浏览器本地显示，不会提交备注、不改表单、不改服务器数据。
- 如果某个 OpenMoji 资源加载失败，脚本会自动回退成 GMGN 原始字符显示。

## 什么时候需要手动改脚本

通常不用。如果你想排除某些 emoji 不替换，打开 [gmgn-openmoji.user.js](C:\Users\14328\Documents\Codex\2026-05-21\gmgn-emoji-summary-gmgn-emoji-emoji\gmgn-openmoji.user.js)，找到：

```js
const EMOJI_EXCLUSIONS = new Set([
  // '✅'
]);
```

把不想替换的 emoji 加进去：

```js
const EMOJI_EXCLUSIONS = new Set([
  '✅',
  '⭐'
]);
```

如果你想强制某个 emoji 使用自定义资源，也可以补 `EMOJI_REPLACEMENTS`：

```js
const EMOJI_REPLACEMENTS = {
  '🐉': {
    label: 'Dragon',
    urls: ['https://example.com/custom-dragon.svg']
  }
};
```

## 当前限制

- 目前主要覆盖 DOM 文本节点和常见 tooltip / modal / wallet 相关容器。
- 如果 GMGN 某些 K 线标记是画在 `canvas` 里，这个版本不会改到那部分。
- 如果实际页面类名和预期差异很大，可能需要再补几条选择器。
