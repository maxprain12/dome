/* eslint-disable no-console */
/**
 * ppt-slide-extractor.cjs
 *
 * Electron-native PPTX → PNG slide extractor.
 *
 * Instead of relying on system tools (LibreOffice, poppler), this module
 * opens a hidden BrowserWindow that loads the Dome app at the special
 * /ppt-capture route. That page uses the bundled pptx-preview library to
 * render each slide, then the main process captures a PNG screenshot via
 * webContents.capturePage(). No external dependencies required.
 */

const { BrowserWindow, app, ipcMain } = require('electron');
const fs = require('fs');
const { getDistIndexHtml, getPreloadPath } = require('../paths.cjs');

// Internal resolution used by PptViewer and PptCapturePage
const SLIDE_W = 960;
const SLIDE_H = 540;

// How long to wait for the /ppt-capture page to signal readiness
const PAGE_READY_TIMEOUT_MS = 15000;

// How long to wait after renderSingleSlide() before capturing (ms).
const RENDER_SETTLE_MS = 250;

// Maximum slides to extract (guard against corrupt files)
const MAX_SLIDES = 200;

const INIT_TIMEOUT_MS = 120_000;
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Returns true when running in development mode (Vite dev server).
 */
function isDev() {
  const distIndex = getDistIndexHtml();
  return (
    process.env.NODE_ENV === 'development' ||
    !app.isPackaged ||
    !fs.existsSync(distIndex)
  );
}

/**
 * Build the URL the hidden window should load.
 */
function buildCaptureUrl() {
  return isDev()
    ? 'http://localhost:5173/ppt-capture'
    : 'app://dome/ppt-capture';
}

/**
 * Wait for a one-shot IPC message from a specific webContents id.
 */
function waitForCaptureEvent(win, channel, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener(channel, handler);
      reject(new Error(`Timeout waiting for ${channel} after ${timeoutMs} ms`));
    }, timeoutMs);

    const handler = (event, payload) => {
      if (win.isDestroyed() || event.sender.id !== win.webContents.id) return;
      clearTimeout(timer);
      ipcMain.removeListener(channel, handler);
      resolve(payload);
    };

    ipcMain.on(channel, handler);
  });
}

/**
 * Extract one PNG image per slide from a PPTX file.
 */
async function extractPptSlideImages(pptxPath) {
  if (!fs.existsSync(pptxPath)) {
    return { success: false, error: 'PPTX file not found' };
  }

  const url = buildCaptureUrl();
  let win = null;

  try {
    win = new BrowserWindow({
      width: SLIDE_W,
      height: SLIDE_H,
      show: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        ...(app.isPackaged ? { devTools: false } : {}),
      },
    });

    win.webContents.on('console-message', (_e, _level, message) => {
      if (process.env.PPT_EXTRACTOR_DEBUG) {
        console.log('[PptExtractor/page]', message);
      }
    });

    const readyPromise = waitForCaptureEvent(win, 'ppt-capture:ready', PAGE_READY_TIMEOUT_MS);
    await win.loadURL(url);
    await readyPromise;

    const pptxBuffer = fs.readFileSync(pptxPath);
    const pptxBase64 = pptxBuffer.toString('base64');

    const initDonePromise = waitForCaptureEvent(win, 'ppt-capture:init-done', INIT_TIMEOUT_MS);
    win.webContents.send('ppt-capture:init', pptxBase64);
    const initResult = await initDonePromise;

    if (!initResult || initResult.error) {
      return { success: false, error: initResult?.error || 'Failed to initialize PPT capture' };
    }

    const slideCount = initResult.slideCount;
    if (!slideCount || typeof slideCount !== 'number' || slideCount <= 0) {
      return { success: false, error: 'No slides found in the presentation' };
    }

    const total = Math.min(slideCount, MAX_SLIDES);
    const slides = [];

    for (let i = 0; i < total; i++) {
      if (win.isDestroyed()) {
        return { success: false, error: 'Capture window was destroyed during extraction' };
      }

      if (i > 0) {
        const renderDonePromise = waitForCaptureEvent(win, 'ppt-capture:render-done', RENDER_TIMEOUT_MS);
        win.webContents.send('ppt-capture:render-slide', i);
        const renderResult = await renderDonePromise;
        if (!renderResult || renderResult.error) {
          return { success: false, error: renderResult?.error || `Failed to render slide ${i}` };
        }
      }

      await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));

      const image = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: SLIDE_W,
        height: SLIDE_H,
      });

      slides.push({
        index: i,
        image_base64: image.toPNG().toString('base64'),
      });
    }

    return { success: true, slides };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PptExtractor] Error:', msg);
    return { success: false, error: msg };
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

module.exports = { extractPptSlideImages };
