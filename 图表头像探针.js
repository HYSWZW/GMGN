(() => {
  const HOTKEY = 'z';
  const IFRAME_SELECTOR = 'iframe[src^="blob:https://gmgn.ai/"]';
  const MAX_LOGS = 800;
  const MAX_HTML_LENGTH = 240;

  function clip(text, length) {
    return String(text || '').slice(0, length);
  }

  function getDestRect(args, source) {
    const sourceWidth = source?.width || source?.videoWidth || 0;
    const sourceHeight = source?.height || source?.videoHeight || 0;

    if (args.length === 3) {
      return {
        dx: Number(args[1]) || 0,
        dy: Number(args[2]) || 0,
        dw: sourceWidth,
        dh: sourceHeight
      };
    }

    if (args.length === 5) {
      return {
        dx: Number(args[1]) || 0,
        dy: Number(args[2]) || 0,
        dw: Number(args[3]) || 0,
        dh: Number(args[4]) || 0
      };
    }

    if (args.length >= 9) {
      return {
        dx: Number(args[5]) || 0,
        dy: Number(args[6]) || 0,
        dw: Number(args[7]) || 0,
        dh: Number(args[8]) || 0
      };
    }

    return {
      dx: 0,
      dy: 0,
      dw: 0,
      dh: 0
    };
  }

  function summarizeSource(source) {
    const tag = source?.tagName?.toLowerCase?.() || source?.constructor?.name || typeof source;
    const src = source?.currentSrc || source?.src || '';

    return {
      sourceTag: tag,
      sourceSrc: src,
      sourceWidth: Number(source?.width || source?.videoWidth || 0),
      sourceHeight: Number(source?.height || source?.videoHeight || 0),
      sourceHtml: clip(source?.outerHTML || '', MAX_HTML_LENGTH)
    };
  }

  function isInteresting(entry) {
    const src = entry.sourceSrc || '';
    const name = entry.canvasName || '';
    const smallDraw = entry.dw >= 8 && entry.dw <= 96 && entry.dh >= 8 && entry.dh <= 96;

    return (
      src.includes('external-res') ||
      src.includes('/static/emoji/') ||
      src.includes('/static/avatar/') ||
      /avatar|emoji/i.test(src) ||
      (smallDraw && /pane|canvas/i.test(name))
    );
  }

  function copyJson(payload) {
    const text = JSON.stringify(payload, null, 2);
    console.log('GMGN canvas probe dump:');
    console.log(payload);
    console.log(text);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => console.log('Canvas probe JSON copied to clipboard.'))
        .catch(() => console.log('Clipboard copy skipped.'));
    }
  }

  const iframe = document.querySelector(IFRAME_SELECTOR);
  if (!iframe) {
    console.log('Blob iframe not found.');
    return;
  }

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    console.log('Iframe document unavailable.');
    return;
  }

  const proto = win.CanvasRenderingContext2D?.prototype;
  if (!proto?.drawImage) {
    console.log('CanvasRenderingContext2D.drawImage unavailable in iframe.');
    return;
  }

  if (win.__gmgnCanvasProbeInstalled) {
    console.log('Canvas probe already installed.');
    return;
  }

  const originalDrawImage = proto.drawImage;
  const logs = [];

  function pushLog(entry) {
    logs.push(entry);
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }
  }

  proto.drawImage = function patchedDrawImage(...args) {
    try {
      const source = args[0];
      const rect = getDestRect(args, source);
      const canvas = this.canvas;
      const canvasRect = canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
      const sourceInfo = summarizeSource(source);

      const entry = {
        capturedAt: new Date().toISOString(),
        canvasName: canvas?.getAttribute?.('data-name') || '',
        canvasWidth: Math.round(canvasRect.width || 0),
        canvasHeight: Math.round(canvasRect.height || 0),
        dx: Math.round(rect.dx),
        dy: Math.round(rect.dy),
        dw: Math.round(rect.dw),
        dh: Math.round(rect.dh),
        ...sourceInfo
      };

      if (isInteresting(entry)) {
        pushLog(entry);
      }
    } catch (error) {
      console.log('Canvas probe capture error:', error);
    }

    return originalDrawImage.apply(this, args);
  };

  win.__gmgnCanvasProbeInstalled = true;
  win.__gmgnCanvasProbeOriginalDrawImage = originalDrawImage;
  win.__gmgnCanvasProbeLogs = logs;
  win.__gmgnDumpCanvasDrawLog = () => {
    const payload = {
      mode: 'iframe-canvas-draw-image',
      capturedAt: new Date().toISOString(),
      iframeSrc: iframe.src,
      count: logs.length,
      logs
    };

    copyJson(payload);
    return payload;
  };
  win.__gmgnClearCanvasDrawLog = () => {
    logs.length = 0;
    console.log('Canvas probe logs cleared.');
  };

  window.__gmgnCanvasProbeKeyDown = (event) => {
    if (event.key.toLowerCase() !== HOTKEY) {
      return;
    }

    win.__gmgnDumpCanvasDrawLog();
  };

  window.removeEventListener('keydown', window.__gmgnCanvasProbeKeyDown, true);
  window.addEventListener('keydown', window.__gmgnCanvasProbeKeyDown, true);

  console.log('GMGN canvas probe armed.');
  console.log(`Interact with the chart to trigger redraws, then press ${HOTKEY} to dump drawImage logs.`);
  console.log('You can also run iframe.contentWindow.__gmgnDumpCanvasDrawLog() manually from the page console.');
})();
