// ==UserScript==
// @name         GMGN 头像还原
// @namespace    https://gmgn.ai/
// @version      0.5.7
// @description  Restore GMGN emoji avatars in DOM lists and TradingView chart canvases using local system emoji rendering.
// @match        https://gmgn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-gmgn-emoji-restored';
  const ORIGINAL_STYLE_ATTR = 'data-gmgn-original-style';
  const ORIGINAL_ARIA_HIDDEN_ATTR = 'data-gmgn-original-aria-hidden';
  const ORIGINAL_CONTAINER_STYLE_ATTR = 'data-gmgn-original-container-style';
  const REPLACEMENT_ID_ATTR = 'data-gmgn-emoji-replacement-id';
  const AVATAR_SELECTOR = 'img[alt="emoji"]';
  const STATIC_EMOJI_PATTERN = /\/static\/emoji\/([0-9a-f-]+)\.webp(?:\?.*)?$/i;
  const TRADING_VIEW_IFRAME_SELECTOR = 'iframe[src^="blob:https://gmgn.ai/"]';
  const PICKER_ROOT_SELECTOR = [
    '[role="dialog"]',
    '[class*="modal" i]',
    '[class*="dialog" i]',
    '[class*="popover" i]',
    '[class*="drawer" i]'
  ].join(',');
  const PICKER_HINT_PATTERN = /Emoji|Smileys & People|Search|自定义图片/i;
  const EMOJI_FONT_FAMILY = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const HOLDINGS_EMOJI_SIZE_RATIO = 0.92;
  const SIDEBAR_EMOJI_SIZE_RATIO = 1.02;
  const DOM_FALLBACK_EMOJI_SIZE_RATIO = 0.78;
  const CHART_SOURCE_EMOJI_RATIO = 1.04;
  const CHART_SOURCE_EMOJI_Y_OFFSET_RATIO = 0.03;

  let scheduled = false;
  let replacementCounter = 0;
  const pendingRoots = new Set();
  const patchedFrames = new WeakSet();
  const chartEmojiCanvasCache = new WeakMap();

  processImages(document);
  startObserver();
  startTradingViewObserver();

  function startObserver() {
    if (!document.body) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          scheduleProcess(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleProcess(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'style']
    });
  }

  function startTradingViewObserver() {
    patchTradingViewFrames(document);

    if (!document.body) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          patchTradingViewFrames(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function scheduleProcess(root) {
    pendingRoots.add(root || document);

    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();

      for (const pendingRoot of roots) {
        processImages(pendingRoot);
      }
    });
  }

  function processImages(root) {
    const candidates = collectCandidates(root);

    for (const image of candidates) {
      syncAvatarReplacement(image);
    }
  }

  function patchTradingViewFrames(root) {
    const frames = collectTradingViewFrames(root);

    for (const frame of frames) {
      frame.addEventListener('load', () => patchTradingViewFrame(frame), { once: true });
      patchTradingViewFrame(frame);
    }
  }

  function collectTradingViewFrames(root) {
    if (!root) {
      return [];
    }

    if (root instanceof HTMLIFrameElement) {
      return root.matches(TRADING_VIEW_IFRAME_SELECTOR) ? [root] : [];
    }

    if (!(root instanceof Element) && root !== document) {
      return [];
    }

    const scope = root === document ? document : root;
    const frames = [];

    if (scope instanceof Element && scope.matches(TRADING_VIEW_IFRAME_SELECTOR)) {
      frames.push(scope);
    }

    frames.push(...scope.querySelectorAll(TRADING_VIEW_IFRAME_SELECTOR));
    return frames;
  }

  function patchTradingViewFrame(frame) {
    if (!(frame instanceof HTMLIFrameElement)) {
      return;
    }

    let win;
    try {
      win = frame.contentWindow;
    } catch {
      return;
    }

    if (!win || patchedFrames.has(win)) {
      return;
    }

    const proto = win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype;
    if (!proto || typeof proto.drawImage !== 'function') {
      return;
    }

    const originalDrawImage = proto.drawImage;
    const parentWindow = window;

    proto.drawImage = function patchedDrawImage(...args) {
      const source = args[0];
      const replacement = resolveChartEmojiSource(win, source);

      if (replacement) {
        args[0] = replacement;
      }

      return originalDrawImage.apply(this, args);
    };

    try {
      Object.defineProperty(proto.drawImage, 'name', {
        value: originalDrawImage.name,
        configurable: true
      });
    } catch {
      parentWindow.console.debug('GMGN chart patch: drawImage name patch skipped.');
    }

    patchedFrames.add(win);
  }

  function resolveChartEmojiSource(win, source) {
    if (!source) {
      return null;
    }

    const src = source.currentSrc || source.src || '';
    const code = extractEmojiCode(src);
    if (!code) {
      return null;
    }

    const emoji = decodeEmoji(code);
    if (!emoji) {
      return null;
    }

    const sourceWidth = Math.max(64, Number(source.width || source.naturalWidth || 160) || 160);
    const sourceHeight = Math.max(64, Number(source.height || source.naturalHeight || 160) || 160);
    return getChartEmojiCanvas(win, code, emoji, sourceWidth, sourceHeight);
  }

  function getChartEmojiCanvas(win, code, emoji, width, height) {
    let frameCache = chartEmojiCanvasCache.get(win);
    if (!frameCache) {
      frameCache = new Map();
      chartEmojiCanvasCache.set(win, frameCache);
    }

    const cacheKey = `${code}:${width}x${height}`;
    const cached = frameCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const doc = win.document;
    if (!doc) {
      return null;
    }

    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${Math.floor(Math.min(width, height) * CHART_SOURCE_EMOJI_RATIO)}px ${EMOJI_FONT_FAMILY}`;
    context.fillText(
      emoji,
      width / 2,
      height / 2 + Math.floor(Math.min(width, height) * CHART_SOURCE_EMOJI_Y_OFFSET_RATIO)
    );

    frameCache.set(cacheKey, canvas);
    return canvas;
  }

  function collectCandidates(root) {
    if (!root) {
      return [];
    }

    if (root instanceof HTMLImageElement) {
      return root.matches(AVATAR_SELECTOR) ? [root] : [];
    }

    if (!(root instanceof Element) && root !== document) {
      return [];
    }

    const scope = root === document ? document : root;
    const images = [];

    if (scope instanceof Element && scope.matches(AVATAR_SELECTOR)) {
      images.push(scope);
    }

    images.push(...scope.querySelectorAll(AVATAR_SELECTOR));
    return images;
  }

  function syncAvatarReplacement(image) {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    if (isInsideEmojiPicker(image)) {
      rollbackReplacement(image);
      return;
    }

    const src = image.getAttribute('src') || '';
    const code = extractEmojiCode(src);
    if (!code) {
      rollbackReplacement(image);
      return;
    }

    const emoji = decodeEmoji(code);
    if (!emoji) {
      rollbackReplacement(image);
      return;
    }

    const container = findAvatarContainer(image);
    if (!container) {
      rollbackReplacement(image);
      return;
    }

    const replacement = ensureReplacementNode(image, container);
    updateReplacementNode(container, replacement, emoji);
    hideOriginalImage(image, container);
  }

  function findAvatarContainer(image) {
    let current = image.parentElement;

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width > 0 && height > 0 && width <= 64 && height <= 64) {
        return current;
      }

      current = current.parentElement;
    }

    return image.parentElement;
  }

  function ensureReplacementNode(image, container) {
    const existingId = image.getAttribute(REPLACEMENT_ID_ATTR);
    if (existingId) {
      const existingNode = document.getElementById(existingId);
      if (existingNode instanceof HTMLElement) {
        placeReplacementNode(image, container, existingNode);
        return existingNode;
      }
    }

    replacementCounter += 1;
    const replacementId = `gmgn-emoji-replacement-${replacementCounter}`;
    const span = document.createElement('span');
    span.id = replacementId;
    span.setAttribute(PROCESSED_ATTR, 'overlay');
    span.setAttribute('aria-hidden', 'true');

    placeReplacementNode(image, container, span);
    image.setAttribute(REPLACEMENT_ID_ATTR, replacementId);
    return span;
  }

  function placeReplacementNode(image, container, node) {
    if (image.parentElement === container) {
      const anchor = image.nextSibling;
      if (anchor) {
        container.insertBefore(node, anchor);
      } else {
        container.appendChild(node);
      }

      return;
    }

    container.appendChild(node);
  }

  function updateReplacementNode(container, node, emoji) {
    const size = measureContainerSize(container);
    const sizeRatio = resolveDomEmojiSizeRatio(container);
    node.textContent = emoji;
    node.title = emoji;
    node.style.position = 'absolute';
    node.style.inset = '0';
    node.style.display = 'flex';
    node.style.alignItems = 'center';
    node.style.justifyContent = 'center';
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.lineHeight = '1';
    node.style.fontFamily = EMOJI_FONT_FAMILY;
    node.style.fontSize = `${Math.max(12, Math.floor(Math.min(size.width, size.height) * sizeRatio))}px`;
    node.style.userSelect = 'none';
    node.style.pointerEvents = 'none';
    node.style.overflow = 'hidden';
    node.style.whiteSpace = 'nowrap';
    node.style.textAlign = 'center';
    node.style.zIndex = '0';
  }

  function hideOriginalImage(image, container) {
    if (!image.hasAttribute(ORIGINAL_STYLE_ATTR)) {
      image.setAttribute(ORIGINAL_STYLE_ATTR, image.getAttribute('style') || '');
    }

    if (!image.hasAttribute(ORIGINAL_ARIA_HIDDEN_ATTR)) {
      image.setAttribute(ORIGINAL_ARIA_HIDDEN_ATTR, image.getAttribute('aria-hidden') || '');
    }

    if (!container.hasAttribute(ORIGINAL_CONTAINER_STYLE_ATTR)) {
      container.setAttribute(ORIGINAL_CONTAINER_STYLE_ATTR, container.getAttribute('style') || '');
    }

    const computed = window.getComputedStyle(container);
    if (computed.position === 'static') {
      container.style.position = 'relative';
    }

    image.style.opacity = '0';
    image.style.pointerEvents = 'none';
    image.setAttribute('aria-hidden', 'true');
    image.setAttribute(PROCESSED_ATTR, 'masked');
  }

  function rollbackReplacement(image) {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    const replacementId = image.getAttribute(REPLACEMENT_ID_ATTR);
    const container = image.parentElement;

    if (replacementId) {
      const replacement = document.getElementById(replacementId);
      if (replacement) {
        replacement.remove();
      }

      image.removeAttribute(REPLACEMENT_ID_ATTR);
    }

    if (image.hasAttribute(ORIGINAL_STYLE_ATTR)) {
      const originalStyle = image.getAttribute(ORIGINAL_STYLE_ATTR) || '';
      if (originalStyle) {
        image.setAttribute('style', originalStyle);
      } else {
        image.removeAttribute('style');
      }

      image.removeAttribute(ORIGINAL_STYLE_ATTR);
    } else {
      image.style.removeProperty('opacity');
      image.style.removeProperty('pointer-events');
    }

    if (image.hasAttribute(ORIGINAL_ARIA_HIDDEN_ATTR)) {
      const originalAriaHidden = image.getAttribute(ORIGINAL_ARIA_HIDDEN_ATTR) || '';
      if (originalAriaHidden) {
        image.setAttribute('aria-hidden', originalAriaHidden);
      } else {
        image.removeAttribute('aria-hidden');
      }

      image.removeAttribute(ORIGINAL_ARIA_HIDDEN_ATTR);
    } else {
      image.removeAttribute('aria-hidden');
    }

    if (container && container.hasAttribute(ORIGINAL_CONTAINER_STYLE_ATTR)) {
      const originalContainerStyle = container.getAttribute(ORIGINAL_CONTAINER_STYLE_ATTR) || '';
      if (originalContainerStyle) {
        container.setAttribute('style', originalContainerStyle);
      } else {
        container.removeAttribute('style');
      }

      container.removeAttribute(ORIGINAL_CONTAINER_STYLE_ATTR);
    }

    image.removeAttribute(PROCESSED_ATTR);
  }

  function resolveDomEmojiSizeRatio(container) {
    const context = classifyAvatarDisplayContext(container);

    if (context === 'holdings') {
      return HOLDINGS_EMOJI_SIZE_RATIO;
    }

    if (context === 'sidebar') {
      return SIDEBAR_EMOJI_SIZE_RATIO;
    }

    return DOM_FALLBACK_EMOJI_SIZE_RATIO;
  }

  function classifyAvatarDisplayContext(container) {
    const rect = container.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (isInsideBottomWideRegion(container, viewportWidth, viewportHeight)) {
      return 'holdings';
    }

    if (isInsideLeftNarrowRegion(container, rect, viewportWidth)) {
      return 'sidebar';
    }

    return 'fallback';
  }

  function isInsideBottomWideRegion(container, viewportWidth, viewportHeight) {
    let current = container;

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (
        width >= viewportWidth * 0.45 &&
        height >= 120 &&
        rect.top >= viewportHeight * 0.45
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isInsideLeftNarrowRegion(container, rect, viewportWidth) {
    if (rect.left > Math.min(360, viewportWidth * 0.22)) {
      return false;
    }

    let current = container;

    while (current && current !== document.body) {
      const currentRect = current.getBoundingClientRect();
      const width = Math.round(currentRect.width);
      const height = Math.round(currentRect.height);

      if (
        currentRect.left <= 40 &&
        width > 0 &&
        width <= Math.max(320, viewportWidth * 0.24) &&
        height >= 160
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return rect.left <= 56;
  }

  function isInsideEmojiPicker(element) {
    const root = element.closest(PICKER_ROOT_SELECTOR);
    if (!root) {
      return false;
    }

    const rootText = root.textContent || '';
    if (PICKER_HINT_PATTERN.test(rootText)) {
      return true;
    }

    return Boolean(
      root.querySelector('input[placeholder*="Search" i]') ||
      root.querySelector('[class*="emoji-picker" i]') ||
      root.querySelector('[class*="emoji_picker" i]')
    );
  }

  function extractEmojiCode(src) {
    const match = src.match(STATIC_EMOJI_PATTERN);
    return match ? match[1].toLowerCase() : null;
  }

  function decodeEmoji(code) {
    try {
      const codepoints = code
        .split('-')
        .filter(Boolean)
        .map((part) => parseInt(part, 16))
        .filter((value) => Number.isFinite(value));

      if (codepoints.length === 0) {
        return '';
      }

      return String.fromCodePoint(...codepoints);
    } catch {
      return '';
    }
  }

  function measureContainerSize(container) {
    const rect = container.getBoundingClientRect();
    const computed = window.getComputedStyle(container);
    const width = rect.width || parseFloat(computed.width) || 20;
    const height = rect.height || parseFloat(computed.height) || width || 20;

    return {
      width: Math.max(12, Math.round(width)),
      height: Math.max(12, Math.round(height))
    };
  }
})();
