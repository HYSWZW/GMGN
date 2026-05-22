// ==UserScript==
// @name         GMGN OpenMoji Restorer
// @namespace    https://gmgn.ai/
// @version      0.1.0
// @description  Replace selected GMGN wallet-note emojis with OpenMoji in read-only display contexts.
// @match        https://gmgn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const OPENMOJI_VERSION = '16.0.0';
  const OPENMOJI_SVG_BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg/`;
  const OPENMOJI_PNG_BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/72x72/`;
  const PROCESSED_ATTR = 'data-gmgn-openmoji';
  const DEBUG = false;

  const TARGET_CONTAINER_SELECTORS = [
    '[class*="wallet" i]',
    '[class*="remark" i]',
    '[class*="note" i]',
    '[class*="tag" i]',
    '[class*="follow" i]',
    '[class*="watch" i]',
    '[class*="tooltip" i]',
    '[class*="popover" i]',
    '[class*="modal" i]',
    '[class*="dialog" i]',
    '[data-testid*="wallet" i]',
    '[data-testid*="remark" i]',
    '[data-testid*="tooltip" i]',
    '[role="tooltip"]',
    '[role="dialog"]'
  ];

  const AUTO_REPLACE_ALL_EMOJIS = true;
  const EMOJI_REPLACEMENTS = {
    // Optional manual overrides:
    // '🐉': { label: 'Dragon' },
    // '🐸': { label: 'Frog', urls: ['https://example.com/frog.svg'] }
  };
  const EMOJI_EXCLUSIONS = new Set([
    // Add emojis here if you do not want them replaced.
    // '✅'
  ]);

  const targetSelectorGroup = TARGET_CONTAINER_SELECTORS.join(',');
  const replacementMap = buildReplacementMap(EMOJI_REPLACEMENTS);
  const emojiPattern = buildEmojiPattern();
  let scheduled = false;
  let observerStarted = false;
  const pendingRoots = new Set();

  if (!AUTO_REPLACE_ALL_EMOJIS && Object.keys(replacementMap).length === 0) {
    log('No configured emoji replacements. Script is idle.');
    return;
  }

  injectStyles();
  exposeDebugApi();
  scheduleProcess(document.body);
  startObserver();

  function buildReplacementMap(source) {
    const map = {};

    for (const [emoji, config] of Object.entries(source)) {
      map[emoji] = {
        label: config.label || emoji,
        urls: buildAssetQueue(emoji, config)
      };
    }

    return map;
  }

  function buildAssetQueue(emoji, config) {
    if (Array.isArray(config.urls) && config.urls.length > 0) {
      return config.urls.slice();
    }

    const fullCodepoint = toCodepointSequence(emoji, false);
    const compactCodepoint = toCodepointSequence(emoji, true);
    const sequences = fullCodepoint === compactCodepoint
      ? [fullCodepoint]
      : [fullCodepoint, compactCodepoint];
    const urls = [];

    for (const sequence of sequences) {
      urls.push(`${OPENMOJI_SVG_BASE}${sequence}.svg`);
    }

    for (const sequence of sequences) {
      urls.push(`${OPENMOJI_PNG_BASE}${sequence}.png`);
    }

    return urls;
  }

  function toCodepointSequence(text, stripVariationSelectors) {
    return Array.from(text)
      .map((char) => char.codePointAt(0))
      .filter((codepoint) => !stripVariationSelectors || codepoint !== 0xfe0f)
      .map((codepoint) => codepoint.toString(16).toUpperCase())
      .join('-');
  }

  function buildEmojiPattern() {
    return /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|[\p{Extended_Pictographic}](?:\uFE0F|\uFE0E)?(?:\u200D[\p{Extended_Pictographic}](?:\uFE0F|\uFE0E)?)*)/gu;
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      img[${PROCESSED_ATTR}="icon"] {
        display: inline-block;
        width: 1em;
        height: 1em;
        vertical-align: -0.14em;
        object-fit: contain;
        user-select: none;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function exposeDebugApi() {
    window.GMGNOpenMoji = {
      version: OPENMOJI_VERSION,
      autoReplaceAllEmojis: AUTO_REPLACE_ALL_EMOJIS,
      replacements: replacementMap,
      exclusions: Array.from(EMOJI_EXCLUSIONS),
      rescan() {
        scheduleProcess(document.body);
      }
    };
  }

  function startObserver() {
    if (observerStarted || !document.body) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.parentNode) {
          scheduleProcess(mutation.target.parentNode);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleProcess(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    observerStarted = true;
  }

  function scheduleProcess(scope) {
    pendingRoots.add(scope || document.body);

    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();

      for (const root of roots) {
        processNode(root);
      }
    });
  }

  function processNode(root) {
    if (!root) {
      return;
    }

    if (root.nodeType === Node.TEXT_NODE) {
      processTextNode(root);
      return;
    }

    const startNode = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
    if (!(startNode instanceof Element)) {
      return;
    }

    const walker = document.createTreeWalker(
      startNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldInspectTextNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const pending = [];
    let current;

    while ((current = walker.nextNode())) {
      pending.push(current);
    }

    for (const textNode of pending) {
      processTextNode(textNode);
    }
  }

  function shouldInspectTextNode(node) {
    if (!(node instanceof Text)) {
      return false;
    }

    const matches = findEmojiMatches(node.nodeValue);
    if (matches.length === 0) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent || !parent.isConnected) {
      return false;
    }

    if (parent.closest(`[${PROCESSED_ATTR}="root"]`)) {
      return false;
    }

    if (isIgnoredContext(parent)) {
      return false;
    }

    if (isInsideTargetContainer(parent)) {
      return true;
    }

    return isStandaloneEmojiNode(node);
  }

  function isIgnoredContext(element) {
    return Boolean(
      element.closest('script, style, noscript, textarea, input, select, option, code, pre') ||
      element.closest('[contenteditable="true"]') ||
      element.closest('svg')
    );
  }

  function isInsideTargetContainer(element) {
    if (!targetSelectorGroup) {
      return false;
    }

    return Boolean(element.closest(targetSelectorGroup));
  }

  function isStandaloneEmojiNode(node) {
    const text = (node.nodeValue || '').trim();
    if (!text) {
      return false;
    }

    const stripped = text.replace(/\uFE0F/g, '');
    const matches = findEmojiMatches(stripped);
    if (!matches || matches.length === 0) {
      return false;
    }

    const onlyEmojis = stripped.replace(emojiPattern, '').trim();
    emojiPattern.lastIndex = 0;
    return onlyEmojis.length === 0;
  }

  function processTextNode(node) {
    if (!shouldInspectTextNode(node)) {
      return;
    }

    const value = node.nodeValue;
    if (!value) {
      return;
    }

    const parent = node.parentElement;
    if (!parent) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let replaced = false;
    const matches = findEmojiMatches(value);

    for (const match of matches) {
      const emoji = match.emoji;
      const index = match.index;

      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
      }

      const icon = createEmojiIcon(emoji);
      fragment.appendChild(icon);
      lastIndex = index + emoji.length;
      replaced = true;
    }

    if (!replaced) {
      return;
    }

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    }

    node.replaceWith(fragment);
  }

  function createEmojiIcon(emoji) {
    const replacement = getReplacement(emoji);
    const img = document.createElement('img');

    img.setAttribute(PROCESSED_ATTR, 'icon');
    img.alt = emoji;
    img.title = replacement.label;
    img.decoding = 'async';
    img.loading = 'lazy';
    img.dataset.originalEmoji = emoji;
    img.dataset.urlIndex = '0';
    img.src = replacement.urls[0];

    img.addEventListener('error', () => {
      const nextIndex = Number(img.dataset.urlIndex) + 1;
      if (nextIndex < replacement.urls.length) {
        img.dataset.urlIndex = String(nextIndex);
        img.src = replacement.urls[nextIndex];
        return;
      }

      img.replaceWith(document.createTextNode(emoji));
    }, { once: false });

    return img;
  }

  function findEmojiMatches(text) {
    if (!text) {
      return [];
    }

    const matches = [];
    emojiPattern.lastIndex = 0;

    for (const match of text.matchAll(emojiPattern)) {
      const emoji = match[0];
      const index = match.index || 0;

      if (!shouldReplaceEmoji(emoji)) {
        continue;
      }

      matches.push({ emoji, index });
    }

    emojiPattern.lastIndex = 0;
    return matches;
  }

  function shouldReplaceEmoji(emoji) {
    if (!emoji || EMOJI_EXCLUSIONS.has(emoji)) {
      return false;
    }

    return AUTO_REPLACE_ALL_EMOJIS || Object.prototype.hasOwnProperty.call(replacementMap, emoji);
  }

  function getReplacement(emoji) {
    if (!replacementMap[emoji]) {
      replacementMap[emoji] = {
        label: emoji,
        urls: buildAssetQueue(emoji, {})
      };
    }

    return replacementMap[emoji];
  }

  function log(...args) {
    if (DEBUG) {
      console.log('[GMGN OpenMoji]', ...args);
    }
  }
})();
