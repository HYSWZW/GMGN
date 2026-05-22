// ==UserScript==
// @name         GMGN 左侧钱包追踪放大
// @namespace    https://gmgn.ai
// @version      0.2.0
// @description  Enlarge the left wallet tracking panel text and row spacing on GMGN.
// @match        https://gmgn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'gmgn-wallet-tracking-scale-style';
  const PANEL_ATTR = 'data-gmgn-wallet-tracking-scale';
  const ROW_ATTR = 'data-gmgn-wallet-tracking-row';
  const FONT_SCALE = '1.10';
  const ROW_PADDING_BLOCK = '3px';
  const PANEL_TEXT_PATTERN = /钱包.*追踪|追踪.*钱包/;

  let scheduled = false;

  injectStyle();
  refreshPanel();
  startObserver();

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${PANEL_ATTR}="true"] [${ROW_ATTR}="true"] {
        font-size: calc(1em * ${FONT_SCALE}) !important;
        line-height: 1.18 !important;
        padding-top: ${ROW_PADDING_BLOCK} !important;
        padding-bottom: ${ROW_PADDING_BLOCK} !important;
      }

      [${PANEL_ATTR}="true"] [${ROW_ATTR}="true"] :where(span, p, a, small, strong, em, label, div, button) {
        font-size: inherit !important;
        line-height: inherit !important;
      }

      [${PANEL_ATTR}="true"] :where(
        input,
        textarea,
        select,
        option,
        svg,
        canvas,
        img,
        video,
        code,
        pre,
        kbd,
        samp,
        [aria-hidden="true"],
        [data-gmgn-emoji-restored],
        [class*="icon" i],
        [class*="avatar" i],
        [class*="badge" i]
      ),
      [${PANEL_ATTR}="true"] :where(
        input,
        textarea,
        select,
        option,
        svg,
        canvas,
        img,
        video,
        code,
        pre,
        kbd,
        samp,
        [aria-hidden="true"],
        [data-gmgn-emoji-restored],
        [class*="icon" i],
        [class*="avatar" i],
        [class*="badge" i]
      ) * {
        font-size: inherit !important;
        line-height: inherit !important;
      }
    `;

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }

  function startObserver() {
    const root = document.body || document.documentElement;
    if (!root) {
      return;
    }

    const observer = new MutationObserver(() => {
      scheduleRefresh();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function scheduleRefresh() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      refreshPanel();
    });
  }

  function refreshPanel() {
    const panel = findWalletTrackingPanel();
    syncPanelMarker(panel);

    if (!panel) {
      return;
    }

    syncRowMarkers(panel, collectRowCandidates(panel));
  }

  function syncPanelMarker(activePanel) {
    for (const panel of document.querySelectorAll(`[${PANEL_ATTR}]`)) {
      if (panel === activePanel) {
        panel.setAttribute(PANEL_ATTR, 'true');
        continue;
      }

      panel.removeAttribute(PANEL_ATTR);
      for (const row of panel.querySelectorAll(`[${ROW_ATTR}]`)) {
        row.removeAttribute(ROW_ATTR);
      }
    }

    if (activePanel) {
      activePanel.setAttribute(PANEL_ATTR, 'true');
    }
  }

  function syncRowMarkers(panel, rows) {
    const activeRows = new Set(rows);

    for (const row of panel.querySelectorAll(`[${ROW_ATTR}]`)) {
      if (!activeRows.has(row)) {
        row.removeAttribute(ROW_ATTR);
      }
    }

    for (const row of activeRows) {
      row.setAttribute(ROW_ATTR, 'true');
    }
  }

  function findWalletTrackingPanel() {
    const candidates = new Set();

    for (const element of document.querySelectorAll('div, section, aside')) {
      const text = normalizeText(element.textContent);
      if (!text || !PANEL_TEXT_PATTERN.test(text)) {
        continue;
      }

      let current = element;
      for (let depth = 0; current && depth < 6; depth += 1) {
        if (current instanceof HTMLElement && isPanelLike(current)) {
          candidates.add(current);
        }

        current = current.parentElement;
      }
    }

    let best = null;
    let bestScore = -Infinity;

    for (const panel of candidates) {
      const rect = panel.getBoundingClientRect();
      const score =
        panelAreaScore(rect) -
        rect.left * 8 -
        Math.abs(rect.width - 300) -
        Math.abs(rect.top - 48) * 0.5;

      if (score > bestScore) {
        best = panel;
        bestScore = score;
      }
    }

    return best;
  }

  function isPanelLike(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 180 || rect.width > 380) {
      return false;
    }

    if (rect.height < 280) {
      return false;
    }

    if (rect.left > 48) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return true;
  }

  function collectRowCandidates(panel) {
    const scope = findScrollableList(panel) || panel;
    const panelRect = panel.getBoundingClientRect();
    const rows = [];
    const directChildren = Array.from(scope.children).filter((element) =>
      element instanceof HTMLElement && isRowLike(element, panelRect)
    );

    if (directChildren.length >= 6) {
      return directChildren;
    }

    for (const element of scope.querySelectorAll('div, a, li, article')) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      if (isRowLike(element, panelRect)) {
        rows.push(element);
      }
    }

    return rows;
  }

  function findScrollableList(panel) {
    let best = null;
    let bestScore = -Infinity;

    for (const element of panel.querySelectorAll('div, section')) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.height < 160 || rect.width < 160) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (!/(auto|scroll)/.test(style.overflowY)) {
        continue;
      }

      const score = rect.height * rect.width;
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return best;
  }

  function isRowLike(element, panelRect) {
    if (element.hasAttribute(PANEL_ATTR)) {
      return false;
    }

    const text = normalizeText(element.innerText || element.textContent);
    if (!text || text.length < 4) {
      return false;
    }

    if (PANEL_TEXT_PATTERN.test(text)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < panelRect.width * 0.55 || rect.width > panelRect.width + 24) {
      return false;
    }

    if (rect.height < 20 || rect.height > 88) {
      return false;
    }

    if (rect.left > panelRect.left + 20) {
      return false;
    }

    if (rect.top < panelRect.top + 48) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return true;
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, '');
  }

  function panelAreaScore(rect) {
    return rect.width * rect.height;
  }
})();
